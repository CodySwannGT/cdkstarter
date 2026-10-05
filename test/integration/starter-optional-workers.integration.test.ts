/** Real offline stage/queue templates and imported-worker permission contracts. */
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { EnvironmentStage } from "../../lib/stages/environment-stage";
import type { StageEnvironment } from "../../lib/types";
import { stageEnvironments } from "../../config/environments";
import { alarmThresholds, dashboardWidgets } from "../../config/observability";
import { validateConfiguration } from "../../util/config-loader";

const worker = {
  functionArn: "arn:aws:lambda:us-east-1:111111111111:function:worker-fn",
  executionRoleArn: "arn:aws:iam::111111111111:role/service-role/worker-role",
  timeoutSeconds: 30,
};
const topic = "arn:aws:sns:us-east-1:111111111111:worker-alerts";
const environment = (queues?: Record<string, unknown>): StageEnvironment =>
  ({
    ...stageEnvironments[0],
    accountId: "111111111111",
    region: "us-east-1",
    features: {
      ...stageEnvironments[0].features,
      xray: false,
      network: false,
      aurora: false,
      valkey: false,
      cognito: false,
      backup: false,
      observability: false,
      ssmRelay: false,
      migrationRunner: false,
      githubOidcDeploy: false,
    },
    ...(queues === undefined ? {} : { queues }),
  }) as StageEnvironment;
const render = (queues?: Record<string, unknown>) => {
  const stage = new EnvironmentStage(new cdk.App(), "Env-dev", {
    env: { account: "111111111111", region: "us-east-1" },
    environment: environment(queues),
    alarmThresholds,
  });
  return Object.fromEntries(
    stage.node
      .findAll()
      .filter(cdk.Stack.isStack)
      .map(stack => [stack.node.id, Template.fromStack(stack).toJSON()])
  );
};
const resources = (
  templates: ReturnType<typeof render>,
  type: string
): [string, any][] =>
  Object.values(templates).flatMap(template =>
    Object.entries(template.Resources ?? {}).filter(
      ([, resource]) => (resource as any).Type === type
    )
  );
const enabled = (definitions: readonly Record<string, unknown>[]) => ({
  enabled: true,
  definitions,
});
const validate = (queues: Record<string, unknown>) =>
  validateConfiguration({
    stages: [environment(queues)],
    supports: [],
    dashboardWidgets,
  });
const queueProps = (templates: ReturnType<typeof render>, name: string) =>
  resources(templates, "AWS::SQS::Queue").find(
    ([, queue]) => queue.Properties.QueueName === name
  )!;

describe("optional generic worker queues", () => {
  it("accepts a valid configuration at the real loader boundary", () => {
    expect(() => validate(enabled([{ key: "valid", worker }]))).not.toThrow();
  });
  it("omits the entire module by default and preserves complete templates when disabled", () => {
    const before = render();
    const after = render({ enabled: false });
    expect(after).toEqual(before);
    for (const type of [
      "AWS::SQS::Queue",
      "AWS::Lambda::EventSourceMapping",
      "AWS::CloudWatch::Alarm",
    ])
      expect(resources(after, type)).toHaveLength(0);
    expect(after.QueuesStack).toBeUndefined();
  });
  it("creates exact standard queue/DLQ defaults and alarms for the first failed message", () => {
    const templates = render(enabled([{ key: "alpha" }, { key: "beta" }]));
    expect(resources(templates, "AWS::SQS::Queue")).toHaveLength(4);
    const dlqs = [
      queueProps(templates, "dev-alpha-dlq"),
      queueProps(templates, "dev-beta-dlq"),
    ];
    for (const [id, queue] of dlqs) {
      expect(queue.Properties.MessageRetentionPeriod).toBe(1209600);
      expect(queue.Properties.SqsManagedSseEnabled).toBe(true);
      expect(queue.Properties.FifoQueue).toBeUndefined();
      const alarm = resources(templates, "AWS::CloudWatch::Alarm").find(
        ([, a]) =>
          a.Properties.MetricName === "ApproximateNumberOfMessagesVisible" &&
          a.Properties.Dimensions[0].Value["Fn::GetAtt"]?.[0] === id
      )![1].Properties;
      expect(alarm).toMatchObject({
        Namespace: "AWS/SQS",
        Statistic: "Maximum",
        Period: 300,
        Threshold: 0,
        ComparisonOperator: "GreaterThanThreshold",
        EvaluationPeriods: 1,
        TreatMissingData: "notBreaching",
        Dimensions: [
          { Name: "QueueName", Value: { "Fn::GetAtt": [id, "QueueName"] } },
        ],
      });
      expect(alarm.AlarmActions).toBeUndefined();
    }
    const [, source] = queueProps(templates, "dev-alpha");
    expect(source.Properties).toMatchObject({
      VisibilityTimeout: 180,
      MessageRetentionPeriod: 345600,
      SqsManagedSseEnabled: true,
      RedrivePolicy: {
        maxReceiveCount: 3,
        deadLetterTargetArn: { "Fn::GetAtt": [dlqs[0][0], "Arn"] },
      },
    });
    expect(resources(templates, "AWS::Lambda::Function")).toHaveLength(0);
    expect(
      resources(templates, "AWS::Lambda::EventSourceMapping")
    ).toHaveLength(0);
  });
  it("binds only the existing worker and grants exact consume actions on its source queue", () => {
    const before = render();
    const templates = render(
      enabled([{ key: "bound", worker }, { key: "unbound" }])
    );
    const [sourceId] = queueProps(templates, "dev-bound");
    const mappings = resources(templates, "AWS::Lambda::EventSourceMapping");
    expect(mappings).toHaveLength(1);
    expect(mappings[0][1].Properties).toMatchObject({
      EventSourceArn: { "Fn::GetAtt": [sourceId, "Arn"] },
      FunctionName: "worker-fn",
      BatchSize: 10,
      MaximumBatchingWindowInSeconds: 0,
    });
    const policies = resources(templates, "AWS::IAM::Policy").filter(
      ([, policy]) => policy.Properties.Roles?.includes("worker-role")
    );
    expect(policies).toHaveLength(1);
    const statement = policies[0][1].Properties.PolicyDocument.Statement;
    expect(statement).toHaveLength(1);
    expect([...statement[0].Action].sort()).toEqual(
      [
        "sqs:ChangeMessageVisibility",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes",
        "sqs:GetQueueUrl",
        "sqs:ReceiveMessage",
      ].sort()
    );
    expect(statement[0].Resource).toEqual({ "Fn::GetAtt": [sourceId, "Arn"] });
    expect(policies[0][1].Properties.PolicyName).toMatch(
      /^boundWorkerRolequeuesdevboundconsume[A-F0-9]{8}$/
    );
    expect(resources(templates, "AWS::IAM::Role")).toEqual(
      resources(before, "AWS::IAM::Role")
    );
    expect(resources(templates, "AWS::Lambda::Function")).toHaveLength(0);
    expect(Object.keys(templates.QueuesStack.Outputs ?? {})).toHaveLength(0);
  });
  it("requires at least six worker timeouts with an actionable 240-second rejection", () => {
    const config = enabled([
      {
        key: "unsafe",
        worker: { ...worker, timeoutSeconds: 40 },
        visibilityTimeoutSeconds: 180,
      },
    ]);
    expect(() => validate(config)).toThrow(/240/);
    expect(() => render(config)).toThrow(/240/);
  });
  it("accepts the exact six-times boundary without generating a stub worker", () => {
    const templates = render(
      enabled([
        {
          key: "safe",
          worker: { ...worker, timeoutSeconds: 40 },
          visibilityTimeoutSeconds: 240,
        },
      ])
    );
    expect(
      queueProps(templates, "dev-safe")[1].Properties.VisibilityTimeout
    ).toBe(240);
    expect(
      resources(templates, "AWS::Lambda::EventSourceMapping")
    ).toHaveLength(1);
    expect(resources(templates, "AWS::Lambda::Function")).toHaveLength(0);
  });
  it("uses source/function metric identities and only explicit destinations", () => {
    const templates = render(
      enabled([
        {
          key: "bound",
          backlogAgeThresholdSeconds: 420,
          notificationTopicArns: [topic],
          worker: { ...worker, alarms: { errors: true, throttles: true } },
        },
        { key: "quiet" },
      ])
    );
    const [sourceId] = queueProps(templates, "dev-bound");
    const alarms = resources(templates, "AWS::CloudWatch::Alarm").map(
      ([, a]) => a.Properties
    );
    const age = alarms.find(
      a =>
        a.MetricName === "ApproximateAgeOfOldestMessage" &&
        a.Dimensions[0].Value["Fn::GetAtt"]?.[0] === sourceId
    );
    expect(age).toMatchObject({
      Namespace: "AWS/SQS",
      Threshold: 420,
      Dimensions: [
        { Name: "QueueName", Value: { "Fn::GetAtt": [sourceId, "QueueName"] } },
      ],
      AlarmActions: [topic],
    });
    for (const metric of ["Errors", "Throttles"])
      expect(alarms.find(a => a.MetricName === metric)).toMatchObject({
        Namespace: "AWS/Lambda",
        Dimensions: [{ Name: "FunctionName", Value: "worker-fn" }],
        Threshold: 0,
        ComparisonOperator: "GreaterThanThreshold",
        AlarmActions: [topic],
      });
    expect(alarms.filter(a => a.AlarmActions)).toHaveLength(4);
    expect(resources(templates, "AWS::SNS::Topic")).toHaveLength(0);
  });
  it("retains stable keyed resource identities when definition order changes", () => {
    const definitions = [{ key: "zeta", worker }, { key: "alpha" }];
    const first = render(enabled(definitions));
    expect(resources(first, "AWS::SQS::Queue")).toHaveLength(4);
    expect(render(enabled([...definitions].reverse()))).toEqual(first);
  });
  it("permits service range boundaries for an unbound standard queue", () => {
    const templates = render(
      enabled([
        {
          key: "boundaries",
          visibilityTimeoutSeconds: 0,
          retentionSeconds: 60,
          deadLetterRetentionSeconds: 1209600,
          maxReceiveCount: 1,
        },
      ])
    );
    expect(queueProps(templates, "dev-boundaries")[1].Properties).toMatchObject(
      {
        VisibilityTimeout: 0,
        MessageRetentionPeriod: 60,
        RedrivePolicy: { maxReceiveCount: 1 },
      }
    );
  });
  it.each([
    { enabled: true, definitions: [] },
    { enabled: "true", definitions: [{ key: "a" }] },
    enabled([{ key: "duplicate" }, { key: "duplicate" }]),
    enabled([
      { key: "a", queueName: "same" },
      { key: "b", queueName: "same" },
    ]),
    enabled([
      { key: "a", queueName: "same" },
      { key: "b", queueName: "same-dlq" },
    ]),
    enabled([{ key: "a", queueName: "a".repeat(77) }]),
    enabled([{ key: "a", queueName: "fifo.fifo" }]),
    enabled([{ key: "a", visibilityTimeoutSeconds: -1 }]),
    enabled([{ key: "a", visibilityTimeoutSeconds: 43201 }]),
    enabled([{ key: "a", retentionSeconds: 59 }]),
    enabled([{ key: "a", deadLetterRetentionSeconds: 1209601 }]),
    enabled([{ key: "a", maxReceiveCount: 1001 }]),
    enabled([{ key: "a", maxReceiveCount: 0 }]),
    enabled([{ key: "a", maxReceiveCount: 1.5 }]),
    enabled([{ key: "a", worker: { ...worker, timeoutSeconds: 0 } }]),
    enabled([
      {
        key: "a",
        worker: {
          ...worker,
          functionArn: worker.functionArn.replace("us-east-1", "us-west-2"),
        },
      },
    ]),
    enabled([
      {
        key: "a",
        worker: {
          ...worker,
          functionArn: worker.functionArn.replace(
            "111111111111",
            "222222222222"
          ),
        },
      },
    ]),
    enabled([
      {
        key: "a",
        worker: {
          ...worker,
          executionRoleArn: worker.executionRoleArn.replace(
            "111111111111",
            "222222222222"
          ),
        },
      },
    ]),
    enabled([
      {
        key: "a",
        worker: {
          ...worker,
          executionRoleArn: worker.executionRoleArn.replace(
            "arn:aws:",
            "arn:aws-cn:"
          ),
        },
      },
    ]),
    enabled([{ key: "a", worker: { ...worker, executionRoleArn: undefined } }]),
    enabled([{ key: "a", notificationTopicArns: ["not-an-arn"] }]),
  ])(
    "fails malformed enabled configuration at loader and owning constructor boundaries %j",
    config => {
      expect(() => validate(config)).toThrow();
      expect(() => render(config)).toThrow();
    }
  );
});
