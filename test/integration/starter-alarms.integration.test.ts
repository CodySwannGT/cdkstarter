/** Offline synthesized Aurora saturation contracts. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as cdk from "aws-cdk-lib";
import * as sns from "aws-cdk-lib/aws-sns";
import { Template } from "aws-cdk-lib/assertions";
import { alarmThresholds } from "../../config/observability";
import { stageEnvironments } from "../../config/environments";
import { AuroraAlarmsStack } from "../../lib/stacks/observability/aurora-alarms-stack";
import { EnvironmentStage } from "../../lib/stages/environment-stage";

const outputs: string[] = [];
const createApp = () => {
  const outdir = mkdtempSync(join(tmpdir(), "starter-alarm-"));
  outputs.push(outdir);
  return new cdk.App({ outdir });
};
afterEach(() => {
  outputs
    .splice(0)
    .forEach(output => rmSync(output, { recursive: true, force: true }));
});

const synth = (
  maxCapacity: number,
  hasReaders = false,
  warning = 80,
  critical = 90
) => {
  const app = createApp();
  const topics = new cdk.Stack(app, "Topics");
  const stack = new AuroraAlarmsStack(app, "Alarms", {
    stageName: "test",
    clusterIdentifier: "test-aurora-cluster",
    maxCapacity,
    hasReaders,
    thresholds: {
      cpuWarningPercent: 70,
      cpuCriticalPercent: 90,
      storageCriticalGB: 10,
      storageWarningGB: 20,
      connectionsWarning: 100,
      connectionsCritical: 200,
      replicationLagMs: 1000,
      capacityWarningPercent: warning,
      capacityCriticalPercent: critical,
    },
    criticalTopic: new sns.Topic(topics, "Critical"),
    warningTopic: new sns.Topic(topics, "Warning"),
  });
  return Template.fromStack(stack);
};

const capacityAlarms = (template: Template) =>
  Object.entries(template.findResources("AWS::CloudWatch::Alarm")).filter(
    ([, resource]) =>
      resource.Properties.MetricName === "ServerlessDatabaseCapacity"
  );

describe("Aurora saturation alarm contract", () => {
  it.each([
    ["dev", 2],
    ["staging", 8],
    ["production", 32],
  ] as const)(
    "%s ceiling yields high-capacity ACU thresholds",
    (name, ceiling) => {
      const configured = stageEnvironments.find(
        environment => environment.type === "stage" && environment.name === name
      );
      expect(configured?.type).toBe("stage");
      if (!configured || configured.type !== "stage")
        throw new Error("Missing stage fixture");
      const app = createApp();
      const stage = new EnvironmentStage(app, "Env-test", {
        environment: {
          ...configured,
          accountId: "123456789012",
          aurora: {
            ...configured.aurora,
            maxCapacity: ceiling,
            instanceCount: 1,
          },
        },
        alarmThresholds,
        env: { account: "123456789012", region: "us-east-1" },
      });
      const alarms = capacityAlarms(
        Template.fromStack(
          stage.node.findChild("AuroraAlarmsStack") as cdk.Stack
        )
      );
      expect(alarms).toHaveLength(2);
      expect(
        alarms
          .map(([, alarm]) => alarm.Properties.Threshold)
          .sort((left, right) => left - right)
      ).toEqual([ceiling * 0.8, ceiling * 0.9]);
      alarms.forEach(([, alarm]) => {
        expect(alarm.Properties.ComparisonOperator).toBe(
          "GreaterThanOrEqualToThreshold"
        );
        expect(alarm.Properties.Statistic).toBe("Maximum");
        expect(alarm.Properties.TreatMissingData).toBe("notBreaching");
        expect(alarm.Properties.Dimensions).toContainEqual({
          Name: "Role",
          Value: "WRITER",
        });
      });
    }
  );
  it("retains writer identities and separately observes optional readers without paging missing data", () => {
    const writer = capacityAlarms(synth(8));
    const withReaders = capacityAlarms(synth(8, true));
    expect(withReaders.filter(([id]) => id.startsWith("Serverless"))).toEqual(
      writer
    );
    expect(withReaders).toHaveLength(4);
    expect(
      withReaders.filter(([, alarm]) =>
        alarm.Properties.Dimensions.some(
          (dimension: { Value: string }) => dimension.Value === "READER"
        )
      )
    ).toHaveLength(2);
    withReaders.forEach(([, alarm]) => {
      expect(alarm.Properties.Statistic).toBe("Maximum");
      expect(alarm.Properties.TreatMissingData).toBe("notBreaching");
    });
  });
  it.each([
    [32, 75, 95, [24, 30.4]],
    [10, 90, 100, [9, 10]],
  ] as const)(
    "orders capacity thresholds numerically for %s ACUs with %s/%s percentages",
    (ceiling, warning, critical, expected) => {
      expect(
        capacityAlarms(synth(ceiling, false, warning, critical))
          .map(([, alarm]) => alarm.Properties.Threshold)
          .sort((left, right) => left - right)
      ).toEqual(expected);
    }
  );
  it.each([
    [80, 80],
    [90, 80],
    [0, 90],
    [80, 101],
    [NaN, 90],
  ])(
    "rejects invalid capacity percentage ordering %s/%s",
    (warning, critical) => {
      expect(() => synth(8, false, warning, critical)).toThrow(
        /capacity.*percent/i
      );
    }
  );
  it.each([0, -1, Infinity, NaN])(
    "rejects invalid max capacity %s",
    ceiling => {
      expect(() => synth(ceiling)).toThrow(/maxCapacity/);
    }
  );
});
