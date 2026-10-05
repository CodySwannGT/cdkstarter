/** Offline SMS counter, persisted effect and recovery contracts; no AWS access. */
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { createRequire } from "node:module";
import * as path from "node:path";
import { existsSync, writeFileSync } from "node:fs";
import { SupportStage } from "../../lib/stages/support-stage";
import type { SupportEnvironment } from "../../lib/types";
import { validateConfiguration } from "../../util/config-loader";
import { dashboardWidgets } from "../../config/observability";

const require = createRequire(path.resolve("package.json"));
const account = "111111111111";
const region = "us-east-1";
const config = {
  enabled: true,
  monthlyPreferenceUsd: 100,
  warningPercent: 80,
  dailyCapUsd: 10,
  fiveMinuteSurgeUsd: 5,
  notificationTopicArn: `arn:aws:sns:${region}:${account}:sms-alerts`,
};
const scope = { account, region };
const support = (smsMonitoring?: Record<string, unknown>): SupportEnvironment =>
  ({
    type: "support",
    name: "shared",
    accountId: account,
    region,
    purpose: { dns: false, flowLogs: false, codeConnections: false },
    ...(smsMonitoring === undefined ? {} : { smsMonitoring }),
  }) as SupportEnvironment;
const render = (smsMonitoring?: Record<string, unknown>) => {
  const stage = new SupportStage(new cdk.App(), "Support", {
    env: scope,
    supportEnvironment: support(smsMonitoring),
    domainConfig: { domains: [] },
    deployableEnvironments: [],
  });
  return Object.fromEntries(
    stage.node
      .findAll()
      .filter(cdk.Stack.isStack)
      .map(stack => [stack.node.id, Template.fromStack(stack).toJSON()])
  );
};
const resources = (templates: ReturnType<typeof render>, type: string): any[] =>
  Object.values(templates).flatMap(template =>
    Object.values(template.Resources ?? {}).filter(
      (resource: any) => resource.Type === type
    )
  );
const core = () =>
  require(
    path.resolve("resources/observability/sms-spend-monitor/controller.cjs")
  );
const now = new Date("2026-10-04T12:05:00Z");
const samples = (last = 32) => [
  { timestamp: "2026-10-04T00:00:00Z", value: 20 },
  { timestamp: "2026-10-04T11:55:00Z", value: 25 },
  { timestamp: "2026-10-04T12:00:00Z", value: last },
];
const fixture = (options: Record<string, any> = {}) => {
  const state: { value: any } = { value: options.state };
  const deps = {
    now: () => options.now ?? now,
    operationId: () => "operation-1",
    readSpend: vi.fn(async () => options.samples ?? samples()),
    writeMetrics: vi.fn(async () => {}),
    getPreference: vi.fn(async () => options.current ?? 100),
    setPreference: vi.fn(async (value: number) => {
      if (options.rejectSet)
        throw Object.assign(new Error("untrusted sensitive service text"), {
          name: options.rejectSet,
        });
      options.current = value;
    }),
    notify: vi.fn(async () => {
      if (options.rejectNotify) throw new Error("notification service secret");
    }),
    store: {
      read: vi.fn(async () => state.value),
      compareAndSet: vi.fn(async (previous: any, next: any) => {
        if ((state.value?.version ?? 0) !== (previous?.version ?? 0))
          return false;
        if (options.failVersion === next.version)
          throw new Error("state secret");
        state.value = next;
        return true;
      }),
    },
  };
  return { deps, state, options };
};
const enforce = { ...config, mode: "enforce", ...scope };
const observe = { ...config, ...scope };

describe("optional SMS account spend controller", () => {
  it("preserves complete default-off support templates with no SMS resources", () => {
    expect(render({ enabled: false })).toEqual(render());
    expect(render()).toEqual({});
  });
  it("accepts a complete configuration at the real loader boundary", () => {
    expect(() =>
      validateConfiguration({
        stages: [],
        supports: [support(config)],
        dashboardWidgets,
      })
    ).not.toThrow();
  });
  it("renders five-minute observe monitoring and exact caller thresholds without preference mutation permissions", () => {
    const templates = render(config);
    expect(resources(templates, "AWS::Lambda::Function")).toHaveLength(1);
    expect(
      resources(templates, "AWS::Events::Rule")[0].Properties.ScheduleExpression
    ).toBe("rate(5 minutes)");
    const fn = resources(templates, "AWS::Lambda::Function")[0];
    expect(
      JSON.parse(fn.Properties.Environment.Variables.SMS_CONFIG)
    ).toMatchObject({ ...config, mode: "observe", ...scope });
    const statements = resources(templates, "AWS::IAM::Policy").flatMap(
      p => p.Properties.PolicyDocument.Statement
    );
    expect(JSON.stringify(statements)).not.toContain("sns:SetSMSAttributes");
    expect(JSON.stringify(statements)).not.toContain("sns:GetSMSAttributes");
    expect(resources(templates, "AWS::DynamoDB::Table")).toHaveLength(0);
    const alarms = resources(templates, "AWS::CloudWatch::Alarm").map(
      a => a.Properties
    );
    expect(
      alarms.find(a => a.MetricName === "SMSMonthToDateSpentUSD")
    ).toMatchObject({
      Namespace: "AWS/SNS",
      Statistic: "Maximum",
      Threshold: 80,
      AlarmActions: [config.notificationTopicArn],
    });
    expect(
      alarms.find(a => a.MetricName === "DailyEstimateUsd").Threshold
    ).toBe(10);
    expect(
      alarms.find(a => a.MetricName === "SurgeEstimateUsd").Threshold
    ).toBe(5);
    expect(
      resources(templates, "AWS::CloudFormation::CustomResource")
    ).toHaveLength(0);
  });
  it("processes an observed cap breach with no preference API calls", async () => {
    const f = fixture();
    const result = await core().evaluate(observe, f.deps);
    expect(result).toMatchObject({
      status: "OBSERVED",
      dailyUsd: 12,
      surgeUsd: 7,
    });
    expect(f.deps.notify).toHaveBeenCalledOnce();
    expect(f.deps.getPreference).not.toHaveBeenCalled();
    expect(f.deps.setPreference).not.toHaveBeenCalled();
  });
  it("emits enforce-only scoped account APIs, retained conditional state and no country/quota privileges", () => {
    const templates = render({ ...config, mode: "enforce" });
    const table = resources(templates, "AWS::DynamoDB::Table")[0];
    expect(table).toMatchObject({
      DeletionPolicy: "Retain",
      UpdateReplacePolicy: "Retain",
    });
    expect(table.Properties.TimeToLiveSpecification).toBeUndefined();
    expect(
      resources(templates, "AWS::Lambda::Function")[0].Properties
        .ReservedConcurrentExecutions
    ).toBe(1);
    const policies = resources(templates, "AWS::IAM::Policy").flatMap(
      p => p.Properties.PolicyDocument.Statement
    );
    const sms = policies.find(p =>
      JSON.stringify(p.Action).includes("sns:SetSMSAttributes")
    );
    expect(sms).toMatchObject({
      Action: ["sns:GetSMSAttributes", "sns:SetSMSAttributes"],
      Resource: "*",
      Condition: { StringEquals: { "aws:RequestedRegion": region } },
    });
    expect(JSON.stringify(policies)).not.toMatch(
      /sns:\*|support:|servicequotas:|SetPlatform|PhoneNumber/
    );
    expect(policies.find(p => p.Action === "sns:Publish").Resource).toBe(
      config.notificationTopicArn
    );
  });
  it("coordinates concurrent/repeated evaluations and retains trip across day/month boundaries", async () => {
    const f = fixture();
    await Promise.all([
      core().evaluate(enforce, f.deps),
      core().evaluate(enforce, f.deps),
    ]);
    expect(f.deps.setPreference).toHaveBeenCalledExactlyOnceWith(32);
    expect(f.state.value).toMatchObject({
      status: "TRIPPED",
      targetLimit: 32,
      previousLimit: 100,
      configuredCeiling: 100,
      account,
      region,
    });
    await core().evaluate(enforce, f.deps);
    f.options.now = new Date("2026-11-01T12:05:00Z");
    f.options.samples = samples().map(point => ({
      ...point,
      timestamp: point.timestamp.replace("2026-10-04", "2026-11-01"),
    }));
    await core().evaluate(enforce, f.deps);
    expect(f.deps.setPreference).toHaveBeenCalledOnce();
    expect(f.state.value.status).toBe("TRIPPED");
  });
  it("never raises an already lower preference while recording a logical trip", async () => {
    const f = fixture({ current: 15 });
    await core().evaluate(enforce, f.deps);
    expect(f.state.value.targetLimit).toBe(15);
    expect(f.state.value.status).toBe("TRIPPED");
    expect(f.deps.setPreference).not.toHaveBeenCalled();
  });
  it("preserves ambiguous service failure and completes exact readback without a duplicate Set", async () => {
    const f = fixture({ rejectSet: "TimeoutError" });
    await expect(core().evaluate(enforce, f.deps)).rejects.toThrow(
      "preference-update:TimeoutError"
    );
    expect(f.state.value.status).toBe("NEEDS_RECONCILIATION");
    f.options.current = 32;
    delete f.options.rejectSet;
    await core().evaluate(enforce, f.deps);
    expect(f.state.value.status).toBe("TRIPPED");
    expect(f.deps.setPreference).toHaveBeenCalledOnce();
  });
  it("fails unresolved intent observably without retrying an ambiguous effect", async () => {
    const f = fixture({ rejectSet: "InvalidParameterException" });
    await expect(core().evaluate(enforce, f.deps)).rejects.toThrow(
      "preference-update"
    );
    await expect(core().evaluate(enforce, f.deps)).rejects.toThrow(
      "manual-reconciliation"
    );
    expect(f.deps.setPreference).toHaveBeenCalledOnce();
  });
  it("retains the intent when successful preference mutation cannot be persisted", async () => {
    const f = fixture({ failVersion: 2 });
    await expect(core().evaluate(enforce, f.deps)).rejects.toThrow(
      "state-write"
    );
    expect(f.options.current).toBe(32);
    expect(f.state.value.status).toBe("TRIPPING");
    delete f.options.failVersion;
    await core().evaluate(enforce, f.deps);
    expect(f.state.value.status).toBe("TRIPPED");
    expect(f.deps.setPreference).toHaveBeenCalledOnce();
  });
  it("retries failed notification only while retaining the successful trip", async () => {
    const f = fixture({ rejectNotify: true });
    await expect(core().evaluate(enforce, f.deps)).rejects.toThrow(
      "notification-failed"
    );
    expect(f.state.value).toMatchObject({
      status: "TRIPPED",
      notificationPending: true,
    });
    delete f.options.rejectNotify;
    await core().evaluate(enforce, f.deps);
    expect(f.state.value.notificationPending).toBe(false);
    expect(f.deps.setPreference).toHaveBeenCalledOnce();
    expect(f.deps.notify).toHaveBeenCalledTimes(2);
  });
  it("recovers through the exported injected-client command only after successful preference update", async () => {
    const f = fixture();
    await core().evaluate(enforce, f.deps);
    const { recoverSmsSpend } = await import(
      path.resolve("scripts/recover-sms-spend.mjs")
    );
    await recoverSmsSpend(enforce, { account, region, limit: 80 }, f.deps);
    expect(f.deps.setPreference).toHaveBeenLastCalledWith(80);
    expect(f.state.value.status).toBe("READY");
    await core().evaluate(enforce, f.deps);
    f.options.rejectSet = "AuthorizationErrorException";
    await expect(
      recoverSmsSpend(enforce, { account, region, limit: 80 }, f.deps)
    ).rejects.toThrow("preference-update");
    expect(f.state.value.status).not.toBe("READY");
  });
  it("rejects above-ceiling/wrong-identity/in-flight recovery without a restore call", async () => {
    const f = fixture();
    await core().evaluate(enforce, f.deps);
    const calls = f.deps.setPreference.mock.calls.length;
    for (const request of [
      { account, region, limit: 101 },
      { account: "222222222222", region, limit: 80 },
      { account, region: "us-west-2", limit: 80 },
    ])
      await expect(core().recover(enforce, request, f.deps)).rejects.toThrow();
    expect(f.deps.setPreference.mock.calls).toHaveLength(calls);
    f.state.value = { ...f.state.value, status: "TRIPPING" };
    await expect(
      core().recover(enforce, { account, region, limit: 80 }, f.deps)
    ).rejects.toThrow("manual-reconciliation");
  });
  it("rejects reconciliation outside an exact pending recovery without mutation", async () => {
    const f = fixture();
    await core().evaluate(enforce, f.deps);
    for (const status of [
      "TRIPPED",
      "READY",
      "TRIPPING",
      "NEEDS_RECONCILIATION",
      "RECOVERING",
    ]) {
      f.state.value = { ...f.state.value, status };
      const retained = structuredClone(f.state.value);
      const mutations = f.deps.setPreference.mock.calls.length;
      const writes = f.deps.store.compareAndSet.mock.calls.length;
      await expect(
        core().recover(
          enforce,
          { account, region, limit: 80, reconcile: true },
          f.deps
        )
      ).rejects.toThrow("manual-reconciliation");
      expect(f.state.value).toEqual(retained);
      expect(f.deps.setPreference.mock.calls).toHaveLength(mutations);
      expect(f.deps.store.compareAndSet.mock.calls).toHaveLength(writes);
    }
  });
  it("sends an exact tiny positive target once and reports service rejection without an invented floor", async () => {
    const f = fixture({
      samples: samples(0.00000002).map((point, index) => ({
        ...point,
        value: index === 2 ? 0.00000002 : 0,
      })),
      rejectSet: "InvalidParameterException",
    });
    await expect(
      core().evaluate({ ...enforce, dailyCapUsd: 0.000000001 }, f.deps)
    ).rejects.toThrow("preference-update:InvalidParameterException");
    expect(f.deps.setPreference).toHaveBeenCalledExactlyOnceWith(0.00000002);
    expect(f.state.value.status).toBe("NEEDS_RECONCILIATION");
  });
  it("uses the real recovery CLI adapter identity/payload and cleans only its own temporary output", async () => {
    const { invokeRecovery } = await import(
      path.resolve("scripts/recover-sms-spend.mjs")
    );
    const commands: any[] = [];
    const output: { path?: string } = {};
    const run = (_binary: string, args: string[]) => {
      commands.push(args);
      if (args[0] === "sts") return JSON.stringify({ Account: account });
      output.path = args.at(-1);
      writeFileSync(
        output.path!,
        JSON.stringify({ status: "READY", operationId: "recovery-1" })
      );
      return JSON.stringify({ StatusCode: 200 });
    };
    expect(
      invokeRecovery(
        [
          `arn:aws:lambda:${region}:${account}:function:evaluator`,
          account,
          region,
          "80",
          "--reconcile",
        ],
        run
      )
    ).toMatchObject({ account, region, status: "READY", limit: 80 });
    expect(commands[0].slice(0, 2)).toEqual(["sts", "get-caller-identity"]);
    expect(
      JSON.parse(commands[1][commands[1].indexOf("--payload") + 1])
    ).toEqual({
      action: "recover",
      account,
      region,
      limit: 80,
      reconcile: true,
    });
    expect(existsSync(path.dirname(output.path!))).toBe(false);
    expect(() =>
      invokeRecovery(
        [
          `arn:aws:lambda:${region}:${account}:function:evaluator`,
          account,
          region,
          "80",
        ],
        () => {
          throw new Error("sensitive credential response");
        }
      )
    ).toThrow("recovery-command-failed");
  });
  it("uses the genuine runtime adapter's exact no-dimension counter, SNS map and conditional state requests", async () => {
    const calls: any[] = [];
    const remote: { item?: any } = {};
    const command = (kind: string) =>
      class {
        input: any;
        kind = kind;
        constructor(input: any) {
          this.input = input;
        }
      };
    class Client {
      settings: any;
      constructor(settings: any) {
        this.settings = settings;
      }
      async send(cmd: any) {
        calls.push({ ...cmd, settings: this.settings });
        if (cmd.kind === "GetMetricStatistics")
          return {
            Datapoints: samples().map(p => ({
              Timestamp: new Date(p.timestamp),
              Maximum: p.value,
            })),
          };
        if (cmd.kind === "GetSMSAttributes")
          return { attributes: { MonthlySpendLimit: "100" } };
        if (cmd.kind === "GetItem") return { Item: remote.item };
        return {};
      }
    }
    const sdk = {
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
    const runtime = require(
      path.resolve("resources/observability/sms-spend-monitor/index.js")
    );
    const deps = runtime.runtimeDependencies(
      { ...enforce, controllerName: "shared" },
      "retained-state",
      sdk
    );
    await deps.readSpend();
    expect(calls.at(-1).input).toMatchObject({
      Namespace: "AWS/SNS",
      MetricName: "SMSMonthToDateSpentUSD",
      Period: 300,
      Statistics: ["Maximum"],
    });
    expect(calls.at(-1).input.Dimensions).toBeUndefined();
    await deps.setPreference(0.0000001);
    expect(calls.at(-1)).toMatchObject({
      settings: { region, maxAttempts: 1 },
      input: { attributes: { MonthlySpendLimit: "0.0000001" } },
    });
    await deps.store.compareAndSet(undefined, {
      status: "TRIPPING",
      version: 1,
    });
    expect(calls.at(-1).input).toMatchObject({
      TableName: "retained-state",
      ConditionExpression: "attribute_not_exists(#version)",
      Key: { controller: { S: `sms#${account}#${region}` } },
    });
    await deps.store.compareAndSet(
      { version: 1 },
      { status: "TRIPPED", version: 2 }
    );
    expect(calls.at(-1).input).toMatchObject({
      ConditionExpression: "#version = :previous",
      ExpressionAttributeValues: { ":previous": { N: "1" } },
    });
    await deps.store.read();
    expect(calls.at(-1).input.ConsistentRead).toBe(true);
    remote.item = { version: { N: "1" } };
    await expect(deps.store.read()).rejects.toThrow("state-record-invalid");
    remote.item = {
      version: { N: "1" },
      stateJson: { S: JSON.stringify({ version: 1, status: "TRIPPED" }) },
    };
    expect(await deps.store.read()).toEqual({ version: 1, status: "TRIPPED" });
    remote.item = { ...remote.item, version: { N: "2" } };
    await expect(deps.store.read()).rejects.toThrow(
      "state-record-version-mismatch"
    );
    expect(await deps.getPreference()).toBe("100");
    expect(calls.at(-1).input).toEqual({ attributes: ["MonthlySpendLimit"] });
    await deps.writeMetrics(core().spendEstimates(samples(), now));
    expect(calls.at(-1).input).toMatchObject({
      Namespace: "Starter/SmsSpend",
      MetricData: [
        {
          MetricName: "DailyEstimateUsd",
          Value: 12,
          Dimensions: [{ Name: "Controller", Value: "shared" }],
        },
        {
          MetricName: "SurgeEstimateUsd",
          Value: 7,
          Dimensions: [{ Name: "Controller", Value: "shared" }],
        },
      ],
    });
    await deps.notify({ kind: "test-metadata", account, region });
    expect(calls.at(-1).input).toEqual({
      TopicArn: config.notificationTopicArn,
      Message: JSON.stringify({ kind: "test-metadata", account, region }),
    });
    const f = fixture();
    const handler = runtime.createHandler(observe, () => f.deps);
    await expect(
      handler(
        { action: "evaluate" },
        {
          invokedFunctionArn: `arn:aws:lambda:${region}:${account}:function:evaluator`,
        }
      )
    ).resolves.toMatchObject({ status: "OBSERVED" });
    expect(f.deps.setPreference).not.toHaveBeenCalled();
    await expect(
      handler(
        { action: "recover", account, region, limit: 80 },
        {
          invokedFunctionArn: `arn:aws:lambda:${region}:222222222222:function:evaluator`,
        }
      )
    ).rejects.toThrow("identity-invalid");
  });
  it("keeps ambiguous recovery until explicit exact readback and does not clear it on scheduled evaluation", async () => {
    const f = fixture();
    await core().evaluate(enforce, f.deps);
    f.options.failVersion = 5;
    await expect(
      core().recover(enforce, { account, region, limit: 80 }, f.deps)
    ).rejects.toThrow("state-write");
    expect(f.state.value.status).toBe("RECOVERING");
    expect(f.options.current).toBe(80);
    delete f.options.failVersion;
    await expect(core().evaluate(enforce, f.deps)).rejects.toThrow(
      "explicit-recovery-readback"
    );
    const count = f.deps.setPreference.mock.calls.length;
    await core().recover(
      enforce,
      { account, region, limit: 80, reconcile: true },
      f.deps
    );
    expect(f.state.value.status).toBe("READY");
    expect(f.deps.setPreference.mock.calls).toHaveLength(count);
  });
  it("reports known service categories without leaking response text and rejects malformed retained state", async () => {
    const f = fixture();
    f.deps.readSpend.mockRejectedValue(
      Object.assign(new Error("sensitive service text"), {
        name: "AuthorizationErrorException",
      })
    );
    await expect(core().evaluate(enforce, f.deps)).rejects.toThrow(
      "counter-read:AuthorizationErrorException"
    );
    expect(f.deps.setPreference).not.toHaveBeenCalled();
    f.state.value = {
      status: "TRIPPED",
      version: 1,
      account: "222222222222",
      region,
    };
    await expect(core().evaluate(enforce, f.deps)).rejects.toThrow(
      "state-invalid"
    );
    expect(f.deps.setPreference).not.toHaveBeenCalled();
  });
  it.each(
    [
      [],
      samples().slice(1),
      samples().map(p => ({
        ...p,
        timestamp: p.timestamp.replace("12:00", "11:45"),
      })),
      [{ timestamp: "2026-10-04T12:10:00Z", value: 32 }],
      samples().map((p, i) => ({ ...p, value: i === 2 ? 24 : p.value })),
      samples().map((p, i) => ({
        ...p,
        timestamp: i === 1 ? "2026-10-04T11:50:00Z" : p.timestamp,
      })),
      samples().map(p => ({ ...p, value: NaN })),
      samples().map(p => ({
        ...p,
        timestamp: p.timestamp.replace("2026-10", "2026-09"),
      })),
    ].map(points => ({ points }))
  )(
    "rejects missing/stale/future/reset/gapped/nonfinite counters without a preference effect %j",
    async ({ points }) => {
      const f = fixture({ samples: points });
      await expect(core().evaluate(enforce, f.deps)).rejects.toThrow();
      expect(f.deps.setPreference).not.toHaveBeenCalled();
    }
  );
  it.each([
    { monthlyPreferenceUsd: 0 },
    { monthlyPreferenceUsd: Infinity },
    { dailyCapUsd: 0 },
    { dailyCapUsd: 101 },
    { fiveMinuteSurgeUsd: -1 },
    { warningPercent: 100 },
    { notificationTopicArn: undefined },
    {
      notificationTopicArn: config.notificationTopicArn.replace(
        region,
        "us-west-2"
      ),
    },
    { mode: "freeze" },
  ])("rejects invalid config at loader and constructor %j", invalid => {
    const c = { ...config, ...invalid };
    expect(() =>
      validateConfiguration({
        stages: [],
        supports: [support(c)],
        dashboardWidgets,
      })
    ).toThrow();
    expect(() => render(c)).toThrow();
  });
});
