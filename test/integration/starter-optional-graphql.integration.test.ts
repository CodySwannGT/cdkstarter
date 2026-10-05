/** Offline GraphQL metric-contract and actual forwarder acceptance. */
import { rmSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import * as sns from "aws-cdk-lib/aws-sns";
import { GraphqlAlarmsStack } from "../../lib/stacks/observability/graphql-alarms-stack";
import { stageEnvironments } from "../../config/environments";
import { alarmThresholds, dashboardWidgets } from "../../config/observability";
import { EnvironmentStage } from "../../lib/stages/environment-stage";
import { validateConfiguration } from "../../util/config-loader";
import type {
  GraphqlMonitoringConfig,
  StageEnvironment,
} from "../../lib/types";

const monitoring: GraphqlMonitoringConfig = {
  enabled: true,
  namespace: "Fixture/GraphQL",
  stageDimension: "fixture-dev",
  minimumInvocations: 10,
  errorRatePercent: { warning: 5, critical: 10 },
  latencyMilliseconds: { warning: 200, critical: 500 },
  latencyStatistic: "p95",
  operations: [
    { name: "ProtectedQuery", type: "query", public: false },
    { name: "PublicMutation", type: "mutation", public: true },
  ],
};
const base = stageEnvironments[0];
const environment = (
  graphqlMonitoring?: unknown,
  causeGrouping?: boolean
): StageEnvironment =>
  ({
    ...base,
    name: "dev",
    accountId: "222222222222",
    features: {
      ...base.features,
      network: false,
      aurora: false,
      valkey: false,
      cognito: false,
      observability: true,
      backup: false,
      ssmRelay: false,
      migrationRunner: false,
      amplifyHosting: false,
      githubOidcDeploy: false,
      waf: false,
    },
    observability: {
      ...base.observability,
      dashboardEnabled: false,
      graphqlMonitoring,
      causeGrouping,
      sentryDsn: "https://fixture-key@sentry.example.invalid/42",
    },
  }) as StageEnvironment;
const apps: cdk.App[] = [];
const templates = (env: StageEnvironment): Record<string, any>[] => {
  const app = new cdk.App({ autoSynth: false });
  apps.push(app);
  const stage = new EnvironmentStage(app, "Env-dev", {
    environment: env,
    alarmThresholds,
    env: { account: env.accountId, region: "us-east-1" },
  });
  const result = stage.node.children
    .filter((node): node is cdk.Stack => node instanceof cdk.Stack)
    .map(stack => Template.fromStack(stack).toJSON());
  expect(app.synth().manifest.missing ?? []).toEqual([]);
  return result;
};
const alarms = (all: Record<string, any>[]) =>
  all
    .flatMap(
      template =>
        Object.values(template.Resources ?? {}) as Record<string, any>[]
    )
    .filter(resource => resource.Type === "AWS::CloudWatch::Alarm");
const requireAsset = createRequire(resolve(__dirname, "../../package.json"));
const forwarder = () => {
  const file = requireAsset.resolve(
    resolve(
      __dirname,
      "../../resources/observability/sentry-forwarder/index.js"
    )
  );
  delete requireAsset.cache[file];
  return requireAsset(file) as { handler(event: unknown): Promise<unknown> };
};
const metadata = (
  identity = "graphql:Fixture/GraphQL:query:ProtectedQuery",
  cause = "error-rate",
  environment = "dev"
) => JSON.stringify({ version: 1, environment, identity, cause });
const notification = (
  name: string,
  severity = "warning",
  description = metadata(),
  state = "ALARM"
) => ({
  Records: [
    {
      Sns: {
        Message: JSON.stringify({
          AlarmName: name,
          NewStateValue: state,
          AlarmDescription: description,
        }),
        TopicArn: `topic:${severity}`,
      },
    },
  ],
});
const sent = () =>
  vi
    .mocked(fetch)
    .mock.calls.map(([, options]) => JSON.parse(String(options?.body)));

// Execute only the arithmetic/functions emitted in the actual CloudFormation queries.
// Inputs are independent time-series fixtures; no production helper is imported.
const evaluate = (
  queries: Record<string, any>[],
  inputs: Record<string, number | undefined>
): number => {
  const read = (id: string): number | undefined => {
    const query = queries.find(value => value.Id === id);
    if (!query) throw new Error(`Missing emitted query ${id}`);
    if (query.MetricStat) {
      const dimensions = query.MetricStat.Metric.Dimensions as {
        Name: string;
        Value: string;
      }[];
      const auth =
        dimensions.find(dimension => dimension.Name === "AuthState")?.Value ??
        "all";
      return inputs[
        `${query.MetricStat.Metric.MetricName}:${query.MetricStat.Stat}:${auth}`
      ];
    }
    const expression = query.Expression as string;
    if (!/^[A-Za-z0-9_.,()+*/><= -]+$/.test(expression))
      throw new Error("Unexpected metric expression syntax");
    const ids = [...new Set(expression.match(/\b[a-z][a-zA-Z0-9_]*\b/g) ?? [])];
    return Function(
      "IF",
      "FILL",
      ...ids,
      `return ${expression};`
    )(
      (condition: boolean, yes: number, no: number) => (condition ? yes : no),
      (value: number | undefined, fill: number) => value ?? fill,
      ...ids.map(read)
    );
  };
  const output = queries.find(query => query.ReturnData);
  if (!output) throw new Error("No emitted output query");
  return read(output.Id)!;
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
  vi.stubEnv("SENTRY_DSN", "https://fixture-key@sentry.example.invalid/42");
  vi.stubEnv("STAGE", "dev");
  vi.stubEnv("CAUSE_GROUPING", undefined);
});
afterEach(() => {
  for (const app of apps.splice(0))
    rmSync(app.outdir, { recursive: true, force: true });
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("starter optional GraphQL monitoring", () => {
  it.each(["query", "mutation"] as const)(
    "synthesizes an exact 255-character %s alarm name without changing its identity",
    type => {
      const name = "O".repeat(128);
      const suffix = `-graphql-${type}-${name}-error-rate-critical`;
      const stageName = "s".repeat(255 - suffix.length);
      const app = new cdk.App({ autoSynth: false });
      apps.push(app);
      const routes = new cdk.Stack(app, "Routes");
      const topic = new sns.Topic(routes, "Alerts");
      const props = {
        stageName,
        config: { ...monitoring, operations: [{ name, type, public: false }] },
        warningTopic: topic,
        criticalTopic: topic,
      };
      const first = new GraphqlAlarmsStack(app, "Graphql", props);
      const emitted = Object.entries(
        Template.fromStack(first).findResources("AWS::CloudWatch::Alarm")
      );
      expect(emitted).toHaveLength(4);
      expect(emitted.map(([, alarm]) => alarm.Properties.AlarmName)).toEqual([
        `${stageName}-graphql-${type}-${name}-error-rate-warning`,
        `${stageName}${suffix}`,
        `${stageName}-graphql-${type}-${name}-latency-warning`,
        `${stageName}-graphql-${type}-${name}-latency-critical`,
      ]);
      expect(emitted[1][1].Properties.AlarmName).toHaveLength(255);
      expect(app.synth().manifest.missing ?? []).toEqual([]);
    }
  );
  it.each(["query", "mutation"] as const)(
    "rejects a composed 256-character %s alarm name before synthesis",
    type => {
      const name = "O".repeat(128);
      const suffix = `-graphql-${type}-${name}-error-rate-critical`;
      const stageName = "s".repeat(256 - suffix.length);
      expect(`${stageName}${suffix}`).toHaveLength(256);
      const app = new cdk.App({ autoSynth: false });
      apps.push(app);
      const routes = new cdk.Stack(app, "Routes");
      const topic = new sns.Topic(routes, "Alerts");
      expect(
        () =>
          new GraphqlAlarmsStack(app, "Graphql", {
            stageName,
            config: {
              ...monitoring,
              operations: [{ name, type, public: false }],
            },
            warningTopic: topic,
            criticalTopic: topic,
          })
      ).toThrow(/GraphQL alarm name.*255/);
    }
  );
  it("keeps default-off complete templates and forwarder fingerprint unchanged", async () => {
    expect(
      templates(environment({ ...monitoring, enabled: false }, false))
    ).toEqual(templates(environment()));
    expect(alarms(templates(environment()))).toHaveLength(0);
    await forwarder().handler(notification("warning-alarm"));
    expect(sent()[0].fingerprint).toEqual(["warning-alarm"]);
  });
  it("enables grouping independently while preserving forwarder identity and omitting GraphQL alarms", () => {
    const baseline = templates(environment());
    const grouping = templates(environment(undefined, true));
    expect(alarms(grouping)).toHaveLength(0);
    const baselineFunctions = Object.entries(baseline[0].Resources).filter(
      ([, resource]) =>
        (resource as Record<string, unknown>).Type === "AWS::Lambda::Function"
    );
    const groupedFunctions = Object.entries(grouping[0].Resources).filter(
      ([, resource]) =>
        (resource as Record<string, unknown>).Type === "AWS::Lambda::Function"
    );
    expect(groupedFunctions.map(([id]) => id)).toEqual(
      baselineFunctions.map(([id]) => id)
    );
    const grouped = groupedFunctions[0][1] as Record<string, any>;
    expect(grouped.Properties.Environment.Variables.CAUSE_GROUPING).toBe(
      "true"
    );
    const monitoringOnly = templates(environment(monitoring));
    const functions = Object.values(monitoringOnly[0].Resources) as Record<
      string,
      any
    >[];
    expect(
      functions.find(resource => resource.Type === "AWS::Lambda::Function")!
        .Properties.Environment.Variables.CAUSE_GROUPING
    ).toBeUndefined();
  });

  it("emits caller metrics, thresholds, 300-second periods and bounded explicit cause metadata", () => {
    const all = templates(environment(monitoring, true));
    const emitted = alarms(all);
    expect(emitted).toHaveLength(8);
    for (const alarm of emitted) {
      expect(alarm.Properties.EvaluationPeriods).toBe(1);
      expect(alarm.Properties.ComparisonOperator).toBe("GreaterThanThreshold");
      expect(alarm.Properties.TreatMissingData).toBe("notBreaching");
      expect(alarm.Properties.AlarmActions).toHaveLength(1);
      const description = JSON.parse(alarm.Properties.AlarmDescription);
      expect(description).toMatchObject({ version: 1, environment: "dev" });
      expect(alarm.Properties.Threshold).toBe(
        description.cause === "error-rate"
          ? alarm.Properties.AlarmName.endsWith("warning")
            ? 5
            : 10
          : alarm.Properties.AlarmName.endsWith("warning")
            ? 200
            : 500
      );
      for (const query of alarm.Properties.Metrics)
        if (query.MetricStat) {
          expect(query.MetricStat.Period).toBe(300);
          expect(query.MetricStat.Unit).toBe(
            query.MetricStat.Metric.MetricName === "Errors"
              ? "Count"
              : "Milliseconds"
          );
          expect(query.MetricStat.Stat).toBe(
            query.MetricStat.Metric.MetricName === "Errors"
              ? "Sum"
              : description.cause === "latency" &&
                  query.MetricStat.Stat !== "SampleCount"
                ? "p95"
                : "SampleCount"
          );
          expect(query.MetricStat.Metric.Namespace).toBe(monitoring.namespace);
          expect(query.MetricStat.Metric.Dimensions).toEqual(
            expect.arrayContaining([
              { Name: "Stage", Value: "fixture-dev" },
              {
                Name: "OperationName",
                Value: expect.stringMatching(/ProtectedQuery|PublicMutation/),
              },
              {
                Name: "OperationType",
                Value: expect.stringMatching(/query|mutation/),
              },
            ])
          );
        }
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    [
      "authenticated",
      false,
      {
        "Duration:SampleCount:all": 100,
        "Errors:Sum:all": 90,
        "Duration:SampleCount:authenticated": 20,
        "Duration:SampleCount:anonymous": 80,
        "Errors:Sum:authenticated": 1,
      },
      5,
    ],
    [
      "anonymous only",
      false,
      {
        "Duration:SampleCount:all": 100,
        "Errors:Sum:all": 90,
        "Duration:SampleCount:anonymous": 100,
      },
      0,
    ],
    [
      "missing auth states",
      false,
      { "Duration:SampleCount:all": 20, "Errors:Sum:all": 2 },
      10,
    ],
    ["missing errors", false, { "Duration:SampleCount:all": 20 }, 0],
    ["zero", false, {}, 0],
    [
      "below floor",
      false,
      { "Duration:SampleCount:all": 9, "Errors:Sum:all": 9 },
      0,
    ],
    [
      "at floor",
      false,
      { "Duration:SampleCount:all": 10, "Errors:Sum:all": 1 },
      10,
    ],
    [
      "public includes anonymous",
      true,
      {
        "Duration:SampleCount:all": 20,
        "Errors:Sum:all": 2,
        "Duration:SampleCount:anonymous": 20,
      },
      10,
    ],
  ])(
    "evaluates actual emitted error-rate math for %s",
    (_name, isPublic, inputs, expected) => {
      const selected = alarms(templates(environment(monitoring))).find(
        alarm => {
          const meta = JSON.parse(alarm.Properties.AlarmDescription);
          return (
            meta.cause === "error-rate" &&
            meta.identity.endsWith(
              isPublic ? "PublicMutation" : "ProtectedQuery"
            ) &&
            alarm.Properties.Threshold === 5
          );
        }
      );
      expect(selected, "required GraphQL error-rate alarm").toBeDefined();
      expect(
        evaluate(selected!.Properties.Metrics, inputs as Record<string, number>)
      ).toBe(expected);
    }
  );
  it.each([
    [
      "protected auth latency",
      false,
      {
        "Duration:SampleCount:authenticated": 10,
        "Duration:SampleCount:anonymous": 90,
        "Duration:p95:authenticated": 250,
        "Duration:p95:all": 900,
      },
      250,
    ],
    [
      "anonymous only latency",
      false,
      { "Duration:SampleCount:anonymous": 20, "Duration:p95:all": 900 },
      0,
    ],
    [
      "missing auth latency",
      false,
      { "Duration:SampleCount:all": 20, "Duration:p95:all": 250 },
      250,
    ],
    [
      "public latency",
      true,
      {
        "Duration:SampleCount:all": 20,
        "Duration:p95:all": 250,
        "Duration:p95:authenticated": 50,
      },
      250,
    ],
  ])(
    "evaluates actual emitted latency math for %s",
    (_name, isPublic, inputs, expected) => {
      const selected = alarms(templates(environment(monitoring))).find(
        alarm => {
          const meta = JSON.parse(alarm.Properties.AlarmDescription);
          return (
            meta.cause === "latency" &&
            meta.identity.endsWith(
              isPublic ? "PublicMutation" : "ProtectedQuery"
            ) &&
            alarm.Properties.Threshold === 200
          );
        }
      );
      expect(
        evaluate(selected!.Properties.Metrics, inputs as Record<string, number>)
      ).toBe(expected);
    }
  );

  it("honors threshold boundaries and keeps zero-volume nonbreaching with a zero warning budget", () => {
    const configured = {
      ...monitoring,
      errorRatePercent: { warning: 0, critical: 10 },
    };
    const selected = alarms(templates(environment(configured))).find(
      alarm => alarm.Properties.Threshold === 0
    )!;
    const value = evaluate(selected.Properties.Metrics, {});
    expect(value).toBe(0);
    expect(selected.Properties.ComparisonOperator).toBe("GreaterThanThreshold");
    expect(value > selected.Properties.Threshold).toBe(false);
    const atThreshold = evaluate(selected.Properties.Metrics, {
      "Duration:SampleCount:all": 20,
      "Errors:Sum:all": 2,
    });
    expect(atThreshold).toBe(10);
    expect(atThreshold > 10).toBe(false);
    expect(
      evaluate(selected.Properties.Metrics, {
        "Duration:SampleCount:all": 20,
        "Errors:Sum:all": 3,
      }) > 10
    ).toBe(true);
  });

  it.each([
    [
      "duplicate",
      {
        ...monitoring,
        operations: [monitoring.operations[0], monitoring.operations[0]],
      },
      /unique|duplicate/i,
    ],
    [
      "threshold order",
      { ...monitoring, errorRatePercent: { warning: 10, critical: 5 } },
      /warning.*critical/i,
    ],
    [
      "zero floor",
      { ...monitoring, minimumInvocations: 0 },
      /minimumInvocations/,
    ],
    [
      "nonfinite latency",
      {
        ...monitoring,
        latencyMilliseconds: { warning: 100, critical: Infinity },
      },
      /latencyMilliseconds/,
    ],
  ])("rejects %s through real startup validation", (_name, config, error) => {
    expect(() =>
      validateConfiguration({
        stages: [environment(config)],
        supports: [],
        dashboardWidgets,
      })
    ).toThrow(error as RegExp);
  });
});

describe("cause grouping and sanitized actual forwarder", () => {
  it("groups warning and critical by cause while preserving severity and separating identities", async () => {
    vi.stubEnv("CAUSE_GROUPING", "true");
    const handler = forwarder();
    await handler.handler(notification("warning", "warning"));
    await handler.handler(notification("critical", "critical"));
    await handler.handler(
      notification("latency", "critical", metadata(undefined, "latency"))
    );
    await handler.handler(
      notification(
        "other operation",
        "critical",
        metadata("graphql:Fixture/GraphQL:query:Other")
      )
    );
    expect(sent()[0].fingerprint).toEqual(sent()[1].fingerprint);
    expect(sent()[0].tags.severity).toBe("warning");
    expect(sent()[1].tags.severity).toBe("critical");
    expect(sent()[2].fingerprint).not.toEqual(sent()[0].fingerprint);
    expect(sent()[3].fingerprint).not.toEqual(sent()[0].fingerprint);
    vi.stubEnv("STAGE", "staging");
    await forwarder().handler(
      notification(
        "same operation other environment",
        "critical",
        metadata(undefined, undefined, "staging")
      )
    );
    expect(sent()[4].fingerprint).not.toEqual(sent()[0].fingerprint);
  });
  it.each([
    "bad JSON",
    metadata(undefined, undefined, "wrong-env"),
    JSON.stringify({ version: 2 }),
    "x".repeat(1025),
  ])("falls back for malformed/mismatched metadata %s", async description => {
    vi.stubEnv("CAUSE_GROUPING", "true");
    await forwarder().handler(
      notification("original", "warning", description, "OK")
    );
    expect(sent()[0].fingerprint).toEqual(["original"]);
    expect(sent()[0].level).toBe("info");
  });
  it("rejects network failures with bounded generic errors and allows external retry", async () => {
    const handler = forwarder();
    vi.mocked(fetch).mockRejectedValueOnce(
      new Error("private DSN event body cause: do-not-log")
    );
    await expect(handler.handler(notification("alarm"))).rejects.toThrow(
      /^Sentry transport failed \(network\)$/
    );
    expect(await handler.handler(notification("alarm"))).toEqual({
      forwarded: 1,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("rejects HTTP failures without reading or exposing their body", async () => {
    const text = vi.fn().mockResolvedValue("private-response-contents");
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 429,
      text,
    } as unknown as Response);
    await expect(forwarder().handler(notification("alarm"))).rejects.toThrow(
      /^Sentry ingestion failed \(HTTP 429\)$/
    );
    expect(text).not.toHaveBeenCalled();
  });
});
