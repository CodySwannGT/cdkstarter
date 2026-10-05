/** Offline unit contracts at the SMS runtime's AWS and invocation boundaries. */
import { createRequire } from "node:module";
import { resolve } from "node:path";

const requireAsset = createRequire(resolve("package.json"));
const runtime = requireAsset(
  resolve("resources/observability/sms-spend-monitor/index.js")
);
const account = "111111111111";
const region = "us-east-1";
const config = {
  account,
  region,
  controllerName: "shared",
  notificationTopicArn: `arn:aws:sns:${region}:${account}:sms-alerts`,
};

const fixture = () => {
  const calls: any[] = [];
  const replies: Record<string, any> = {};
  const failures: Record<string, Error> = {};
  const command = (kind: string) =>
    class {
      constructor(readonly input: any) {}
      readonly kind = kind;
    };
  class Client {
    constructor(readonly settings: any) {}
    async send(request: any) {
      calls.push({ ...request, settings: this.settings });
      if (failures[request.kind]) throw failures[request.kind];
      return replies[request.kind] ?? {};
    }
  }
  const modules = {
    sns: {
      SNSClient: Client,
      GetSMSAttributesCommand: command("GetSMSAttributes"),
      SetSMSAttributesCommand: command("SetSMSAttributes"),
      PublishCommand: command("Publish"),
    },
    cloudwatch: {
      CloudWatchClient: Client,
      GetMetricStatisticsCommand: command("GetMetricStatistics"),
      PutMetricDataCommand: command("PutMetricData"),
    },
    dynamodb: {
      DynamoDBClient: Client,
      GetItemCommand: command("GetItem"),
      UpdateItemCommand: command("UpdateItem"),
    },
  };
  return {
    calls,
    replies,
    failures,
    deps: runtime.runtimeDependencies(config, "retained-state", modules),
  };
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("SMS runtime service boundary", () => {
  it("requests the account-wide monthly counter from UTC midnight with bounded retries", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T00:05:00Z"));
    const f = fixture();
    expect(await f.deps.readSpend()).toEqual([]);
    expect(f.calls).toEqual([
      {
        kind: "GetMetricStatistics",
        settings: { region, maxAttempts: 2 },
        input: {
          Namespace: "AWS/SNS",
          MetricName: "SMSMonthToDateSpentUSD",
          StartTime: new Date("2026-10-05T00:00:00Z"),
          EndTime: new Date("2026-10-05T00:05:00Z"),
          Period: 300,
          Statistics: ["Maximum"],
        },
      },
    ]);
    const timestamp = new Date("2026-10-05T00:00:00Z");
    f.replies.GetMetricStatistics = {
      Datapoints: [{ Timestamp: timestamp, Maximum: 12 }],
    };
    expect(await f.deps.readSpend()).toEqual([{ timestamp, value: 12 }]);
  });

  it("keeps a missing preference absent and never retries a preference effect", async () => {
    const f = fixture();
    expect(await f.deps.getPreference()).toBeUndefined();
    f.replies.GetSMSAttributes = { attributes: { MonthlySpendLimit: "80" } };
    expect(await f.deps.getPreference()).toBe("80");
    const refusal = new Error("service refusal");
    f.failures.SetSMSAttributes = refusal;
    await expect(f.deps.setPreference(0.0000001)).rejects.toBe(refusal);
    const effects = f.calls.filter(call => call.kind === "SetSMSAttributes");
    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({
      settings: { region, maxAttempts: 1 },
      input: { attributes: { MonthlySpendLimit: "0.0000001" } },
    });
  });

  it("publishes only caller metadata and emits separate controller-scoped estimates", async () => {
    const f = fixture();
    await f.deps.notify({ status: "OBSERVED", account, region });
    expect(f.calls.at(-1).input).toEqual({
      TopicArn: config.notificationTopicArn,
      Message: JSON.stringify({ status: "OBSERVED", account, region }),
    });
    await f.deps.writeMetrics({
      sampleAt: "2026-10-05T00:05:00Z",
      dailyUsd: 8,
      surgeUsd: 3,
    });
    expect(f.calls.at(-1).input).toEqual({
      Namespace: "Starter/SmsSpend",
      MetricData: [
        { MetricName: "DailyEstimateUsd", Value: 8 },
        { MetricName: "SurgeEstimateUsd", Value: 3 },
      ].map(metric => ({
        ...metric,
        Timestamp: new Date("2026-10-05T00:05:00Z"),
        Unit: "None",
        Dimensions: [{ Name: "Controller", Value: "shared" }],
      })),
    });
    expect(typeof f.deps.operationId()).toBe("string");
    expect(f.deps.now()).toBeInstanceOf(Date);
  });

  it("uses consistent versioned reads and refuses corrupt retained state", async () => {
    const f = fixture();
    expect(await f.deps.store.read()).toBeUndefined();
    expect(f.calls.at(-1).input).toEqual({
      TableName: "retained-state",
      Key: { controller: { S: `sms#${account}#${region}` } },
      ConsistentRead: true,
    });
    for (const Item of [
      {},
      { version: { N: "1" } },
      { stateJson: { S: "{}" } },
    ]) {
      f.replies.GetItem = { Item };
      await expect(f.deps.store.read()).rejects.toThrow("state-record-invalid");
    }
    f.replies.GetItem = {
      Item: { version: { N: "2" }, stateJson: { S: '{"version":1}' } },
    };
    await expect(f.deps.store.read()).rejects.toThrow("version-mismatch");
    const retained = { version: 2, status: "RECOVERING" };
    f.replies.GetItem.Item.stateJson.S = JSON.stringify(retained);
    expect(await f.deps.store.read()).toEqual(retained);
  });

  it("distinguishes a competing conditional writer from service failure", async () => {
    const f = fixture();
    const next = { version: 1, status: "TRIPPING" };
    expect(await f.deps.store.compareAndSet(undefined, next)).toBe(true);
    expect(f.calls.at(-1).input.ConditionExpression).toBe(
      "attribute_not_exists(#version)"
    );
    expect(
      await f.deps.store.compareAndSet(next, { ...next, version: 2 })
    ).toBe(true);
    expect(f.calls.at(-1).input).toMatchObject({
      ConditionExpression: "#version = :previous",
      ExpressionAttributeValues: { ":previous": { N: "1" } },
    });
    f.failures.UpdateItem = Object.assign(new Error("concurrent writer"), {
      name: "ConditionalCheckFailedException",
    });
    expect(await f.deps.store.compareAndSet(next, next)).toBe(false);
    f.failures.UpdateItem = new Error("sensitive service response");
    await expect(f.deps.store.compareAndSet(next, next)).rejects.toThrow(
      "state-service-failed"
    );
  });
});

describe("SMS runtime invocation authorization", () => {
  it("enforces the deployed handler's configured account before loading SDK clients", async () => {
    vi.stubEnv("SMS_CONFIG", JSON.stringify(config));
    await expect(
      runtime.handler(
        { action: "evaluate" },
        {
          invokedFunctionArn: `arn:aws:lambda:${region}:222222222222:function:evaluator`,
        }
      )
    ).rejects.toThrow("invocation-identity-invalid");
  });

  it("rejects recovery in observe mode without reading or mutating account state", async () => {
    const f = fixture();
    const handler = runtime.createHandler(
      { ...config, mode: "observe" },
      () => f.deps
    );
    await expect(
      handler(
        { action: "recover", account, region, limit: 80 },
        {
          invokedFunctionArn: `arn:aws:lambda:${region}:${account}:function:evaluator`,
        }
      )
    ).rejects.toThrow("recovery-identity-or-ceiling-invalid");
    expect(f.calls).toEqual([]);
  });

  it.each([
    undefined,
    `arn:aws:lambda:us-west-2:${account}:function:evaluator`,
    `arn:aws:lambda:${region}:222222222222:function:evaluator`,
  ])(
    "rejects a wrong invocation identity before creating clients (%s)",
    async arn => {
      const clients = vi.fn();
      const handler = runtime.createHandler(config, clients);
      await expect(
        handler({ action: "recover" }, { invokedFunctionArn: arn })
      ).rejects.toThrow("invocation-identity-invalid");
      expect(clients).not.toHaveBeenCalled();
    }
  );

  it("rejects unknown actions without any service effect", async () => {
    const f = fixture();
    const handler = runtime.createHandler(config, () => f.deps);
    await expect(
      handler(
        { action: "reset-quota" },
        {
          invokedFunctionArn: `arn:aws:lambda:${region}:${account}:function:evaluator`,
        }
      )
    ).rejects.toThrow("action-invalid");
    expect(f.calls).toEqual([]);
  });
});
