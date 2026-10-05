/** Runtime asset contracts: no live endpoints or AWS services are contacted. */
import { createRequire } from "node:module";
import { resolve } from "node:path";

interface ForwardedEvent {
  message: string;
  level: string;
  environment: string;
  tags: Record<string, string>;
  extra: Record<string, unknown>;
  fingerprint: string[];
}
interface AssetHandler {
  handler(event?: Record<string, unknown>): Promise<Record<string, unknown>>;
}
const requireAsset = createRequire(resolve(__dirname, "../../../package.json"));
const load = (asset: string): AssetHandler => {
  const file = requireAsset.resolve(
    resolve(__dirname, `../../../resources/observability/${asset}/index.js`)
  );
  delete requireAsset.cache[file];
  return requireAsset(file) as AssetHandler;
};
const response = (ok = true, status = 200): Response =>
  ({ ok, status, text: async () => "rejected" }) as Response;

const sent = (): ForwardedEvent[] =>
  vi
    .mocked(fetch)
    .mock.calls.map(
      ([, options]) => JSON.parse(String(options?.body)) as ForwardedEvent
    );
const sns = (message: unknown, topic = "topic:critical", subject?: string) => ({
  Records: [
    {
      Sns: {
        Message:
          typeof message === "string" ? message : JSON.stringify(message),
        TopicArn: topic,
        Subject: subject,
      },
    },
  ],
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));
  vi.stubEnv("SENTRY_DSN", "https://fixture-key@sentry.example.invalid/42");
  vi.stubEnv("STAGE", "test");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("canary deployed asset", () => {
  it.each([
    "{",
    "null",
    "{}",
    "[1]",
    '["https://valid.invalid", ""]',
    '["file:///tmp/fixture"]',
  ])(
    "rejects malformed targets %s before checking any endpoint",
    async targets => {
      vi.stubEnv("CANARY_URLS", targets);
      await expect(load("canary").handler()).rejects.toThrow();
      expect(fetch).not.toHaveBeenCalled();
    }
  );
  it("handles absent targets without a request", async () => {
    vi.stubEnv("CANARY_URLS", undefined);
    expect(await load("canary").handler()).toEqual({ ok: true, checked: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("checks every configured target with redirects and a bounded signal", async () => {
    vi.stubEnv("CANARY_URLS", '["https://one.invalid","https://two.invalid"]');
    expect(await load("canary").handler()).toEqual({ ok: true, checked: 2 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({
      redirect: "follow",
      signal: expect.any(AbortSignal),
    });
  });
  it("retains HTTP and network failure details instead of reporting success", async () => {
    vi.stubEnv("CANARY_URLS", '["https://one.invalid","https://two.invalid"]');
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(false, 503))
      .mockRejectedValueOnce(new TypeError("connection refused"));
    await expect(load("canary").handler()).rejects.toThrow(
      "https://one.invalid -> HTTP 503; https://two.invalid -> TypeError: connection refused"
    );
  });
});

describe("Sentry deployed forwarder", () => {
  it.each([null, undefined, { Records: "invalid" }])(
    "rejects malformed invocation %s before transport",
    async event => {
      await expect(
        load("sentry-forwarder").handler(event as Record<string, unknown>)
      ).rejects.toThrow(/Invalid (notification|SNS)/);
      expect(fetch).not.toHaveBeenCalled();
    }
  );
  it.each([undefined, "BROKEN", 7])(
    "rejects malformed recognized alarm state %s before transport",
    async state => {
      await expect(
        load("sentry-forwarder").handler(
          sns({
            AlarmName: "fixture alarm",
            NewStateValue: state,
          })
        )
      ).rejects.toThrow(/alarm state/i);
      expect(fetch).not.toHaveBeenCalled();
    }
  );
  it.each([null, {}, { state: 7 }, { state: "FAILED" }])(
    "rejects malformed Backup job detail %s instead of ignoring or forwarding it",
    async detail => {
      const handler = load("sentry-forwarder");
      const event = {
        source: "aws.backup",
        "detail-type": "Backup Job State Change",
        detail,
      };
      await expect(handler.handler(event)).rejects.toThrow(/backup job/i);
      await expect(handler.handler(sns(event))).rejects.toThrow(/backup job/i);
      expect(fetch).not.toHaveBeenCalled();
    }
  );
  it.each([null, {}, { Message: null }])(
    "rejects malformed SNS record %s before transport",
    async Sns => {
      await expect(
        load("sentry-forwarder").handler({ Records: [{ Sns }] })
      ).rejects.toThrow(/SNS record/i);
      expect(fetch).not.toHaveBeenCalled();
    }
  );
  it.each([
    [new TypeError("network unavailable"), "network"],
    [new DOMException("request timed out", "TimeoutError"), "timeout"],
  ])(
    "propagates transport failure %s and accepts an external reinvocation",
    async (error, category) => {
      const handler = load("sentry-forwarder");
      const event = sns({
        source: "aws.backup",
        "detail-type": "Backup Job State Change",
        account: "111111111111",
        region: "us-east-1",
        detail: {
          state: "FAILED",
          backupJobId: "fixture-job",
          resourceType: "Aurora",
        },
      });
      vi.mocked(fetch).mockRejectedValueOnce(error);
      await expect(handler.handler(event)).rejects.toThrow(
        `Sentry transport failed (${category})`
      );
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(await handler.handler(event)).toEqual({ forwarded: 1 });
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(sent()[1]).toMatchObject({
        tags: { source: "aws-backup" },
        extra: { backup_job_id: "fixture-job" },
      });
    }
  );
  it("fails an HTTP 429 invocation and forwards the same alarm on external retry", async () => {
    const handler = load("sentry-forwarder");
    const event = sns({
      AlarmName: "fixture alarm",
      NewStateValue: "ALARM",
      AWSAccountId: "111111111111",
      AlarmArn: "arn:aws:cloudwatch:us-east-1:111111111111:alarm:fixture",
      Trigger: { MetricName: "Errors", Namespace: "AWS/Lambda" },
    });
    vi.mocked(fetch).mockResolvedValueOnce(response(false, 429));
    await expect(handler.handler(event)).rejects.toThrow(
      "Sentry ingestion failed (HTTP 429)"
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await handler.handler(event)).toEqual({ forwarded: 1 });
    expect(sent()[1]).toMatchObject({
      level: "error",
      tags: { source: "cloudwatch-alarm" },
    });
  });
  it("does not forward unknown invocations", async () => {
    expect(await load("sentry-forwarder").handler({ source: "other" })).toEqual(
      { forwarded: 0 }
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["ALARM", "OK", "INSUFFICIENT_DATA"])(
    "maps %s alarm state, region and severity",
    async state => {
      const handler = load("sentry-forwarder");
      await handler.handler(
        sns(
          {
            AlarmName: "service errors",
            NewStateValue: state,
            NewStateReason: "fixture reason",
            AlarmArn: "arn:aws:cloudwatch:eu-west-1:123:alarm:service",
          },
          "topic:WARNING"
        )
      );
      expect(sent()[0]).toMatchObject({
        level: state === "ALARM" ? "error" : "info",
        environment: "test",
        tags: {
          triage: "ready",
          source: "cloudwatch-alarm",
          severity: "warning",
          state,
        },
        fingerprint: ["service errors"],
      });
      expect(sent()[0].extra.console_url).toContain("eu-west-1");
      expect(fetch).toHaveBeenCalledWith(
        "https://sentry.example.invalid/api/42/store/",
        expect.objectContaining({
          method: "POST",
          signal: expect.any(AbortSignal),
          headers: expect.objectContaining({
            "X-Sentry-Auth": expect.stringContaining("sentry_key=fixture-key"),
          }),
        })
      );
    }
  );
  it("uses default stage and alarm region when absent", async () => {
    vi.stubEnv("STAGE", undefined);
    await load("sentry-forwarder").handler(
      sns({ AlarmName: "alarm", NewStateValue: "OK" }, "topic:info")
    );
    expect(sent()[0].environment).toBe("unknown");
    expect(sent()[0].extra.console_url).toContain("us-east-1");
    expect(sent()[0].tags.severity).toBe("info");
  });
  it.each(["FAILED", "SUCCEEDED"])(
    "maps pipeline %s notifications",
    async state => {
      await load("sentry-forwarder").handler(
        sns({
          "detail-type": "pipeline change",
          detail: { state, pipeline: "fixture" },
          region: "us-east-1",
        })
      );
      expect(sent()[0]).toMatchObject({
        level: state === "FAILED" ? "error" : "info",
        tags: { source: "codepipeline", pipeline: "fixture", state },
        fingerprint: ["pipeline-fixture"],
      });
    }
  );
  it("handles pipeline detail absence and the alternate notification discriminator", async () => {
    await load("sentry-forwarder").handler(
      sns({ detailType: "pipeline change" })
    );
    expect(sent()[0].level).toBe("info");
    expect(sent()[0].tags.source).toBe("codepipeline");
  });
  it.each([true, false])(
    "preserves parsed versus raw generic messages (%s)",
    async parsed => {
      const message = parsed ? { custom: "fixture" } : "not JSON";
      await load("sentry-forwarder").handler(
        sns(
          message,
          parsed ? "topic:critical" : "topic:no-severity",
          parsed ? "subject" : undefined
        )
      );
      expect(sent()[0]).toMatchObject({
        level: parsed ? "error" : "warning",
        tags: { source: "sns", severity: parsed ? "critical" : "unknown" },
        extra: { message },
      });
      expect(sent()[0].message).toBe(
        parsed ? "[test] subject" : "[test] notification"
      );
    }
  );
  it.each(["EFS", undefined])(
    "maps backup failures with resource type %s",
    async resourceType => {
      await load("sentry-forwarder").handler({
        source: "aws.backup",
        detail: {
          state: "FAILED",
          resourceType,
          backupJobId: "job",
          statusMessage: "failed",
          resourceArn: "arn:fixture",
        },
      });
      expect(sent()[0]).toMatchObject({
        level: "error",
        tags: { source: "aws-backup", state: "FAILED" },
        extra: { backup_job_id: "job", status_message: "failed" },
        fingerprint: ["backup-job-failure", resourceType ?? "unknown"],
      });
      expect(sent()[0].message).toContain(resourceType ?? "unknown resource");
    }
  );
  it("propagates rejected ingestion and malformed DSN without suppressing errors", async () => {
    vi.mocked(fetch).mockResolvedValue(response(false, 429));
    await expect(
      load("sentry-forwarder").handler(sns("alert"))
    ).rejects.toThrow("Sentry ingestion failed (HTTP 429)");
    vi.stubEnv("SENTRY_DSN", "invalid");
    await expect(
      load("sentry-forwarder").handler(sns("alert"))
    ).rejects.toThrow();
  });
});
