/** Offline configuration contract and actual synthesized resource behavior. */
import { rmSync } from "node:fs";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import {
  stageEnvironments,
  supportEnvironments,
} from "../../config/environments";
import { alarmThresholds } from "../../config/observability";
import { EnvironmentStage } from "../../lib/stages/environment-stage";
import {
  isDeployableAccountId,
  validateConfiguration,
} from "../../util/config-loader";
import type {
  DashboardWidgets,
  StageEnvironment,
  SupportEnvironment,
} from "../../lib/types";

const widgets: DashboardWidgets = {
  aurora: [],
  valkey: [],
  cognito: [],
  vpc: [],
};
const environment = (): StageEnvironment => ({
  ...stageEnvironments[0],
  accountId: "111111111111",
});
const validate = (
  stages: readonly StageEnvironment[],
  supports: readonly SupportEnvironment[] = [],
  custom = widgets
) => validateConfiguration({ stages, supports, dashboardWidgets: custom });

const outdirs: string[] = [];
afterEach(() => {
  for (const outdir of outdirs.splice(0))
    rmSync(outdir, { recursive: true, force: true });
});
const synth = (configuration: StageEnvironment) => {
  const app = new cdk.App({
    context: {
      "availability-zones:account=111111111111:region=us-east-1": [
        "us-east-1a",
        "us-east-1b",
      ],
    },
  });
  outdirs.push(app.outdir);
  return new EnvironmentStage(app, "Env-dev", {
    environment: configuration,
    alarmThresholds,
    env: { account: "111111111111", region: "us-east-1" },
  });
};
const template = (stage: EnvironmentStage, name: string) =>
  Template.fromStack(stage.node.findChild(name) as cdk.Stack);

describe("starter configuration contract", () => {
  it("rejects malformed accounts, duplicate names, multiple support environments, overlapping CIDRs and invalid Aurora settings before synthesis", () => {
    expect(isDeployableAccountId("111")).toBe(false);
    expect(isDeployableAccountId("111111111111")).toBe(true);
    expect(() =>
      validate([{ ...environment(), accountId: "PLACEHOLDER" }])
    ).not.toThrow();
    for (const accountId of [
      "",
      "111",
      " 111111111111",
      "111111111111 ",
      "PLACEHOLDER ",
      "abcdefghijkl",
    ]) {
      expect(() => validate([{ ...environment(), accountId }])).toThrow(
        /accountId.*12 digits.*PLACEHOLDER/
      );
    }
    expect(() => validate([environment(), environment()])).toThrow(
      /Duplicate environment name/
    );
    expect(() =>
      validate(
        [],
        [supportEnvironments[0], { ...supportEnvironments[0], name: "another" }]
      )
    ).toThrow(/one support environment/);
    expect(() =>
      validate([
        environment(),
        {
          ...environment(),
          name: "another",
          network: { vpcCidr: "10.0.1.0/24" },
        },
      ])
    ).toThrow(/overlapping VPC CIDRs/);
    expect(() =>
      validate([{ ...environment(), network: { vpcCidr: "10.999.0.0/16" } }])
    ).toThrow(/valid IPv4 VPC CIDR/);
    for (const aurora of [
      { instanceCount: 0 },
      { instanceCount: 1.5 },
      { minCapacity: 8, maxCapacity: 2 },
      { minCapacity: NaN },
      { maxCapacity: 2.1 },
      { backupRetentionDays: 36 },
      { logRetentionDays: 2 },
      { engineVersion: "invalid" },
    ]) {
      expect(() =>
        validate([
          { ...environment(), aurora: { ...environment().aurora, ...aurora } },
        ])
      ).toThrow(/Aurora/);
    }
  });

  it("renders an explicit engine and three unique instances while preserving the writer and first-reader identities", () => {
    const base = environment();
    const two = template(
      synth({ ...base, aurora: { ...base.aurora, instanceCount: 2 } }),
      "AuroraStack"
    );
    const three = template(
      synth({
        ...base,
        aurora: { ...base.aurora, instanceCount: 3, engineVersion: "16.6" },
      }),
      "AuroraStack"
    );
    const oldInstances = two.findResources("AWS::RDS::DBInstance");
    const instances = three.findResources("AWS::RDS::DBInstance");
    expect(Object.keys(instances)).toHaveLength(3);
    expect(Object.keys(instances)).toEqual(
      expect.arrayContaining(Object.keys(oldInstances))
    );
    three.hasResourceProperties("AWS::RDS::DBCluster", {
      EngineVersion: "16.6",
    });
    two.hasResourceProperties("AWS::RDS::DBCluster", { EngineVersion: "16.4" });
  });

  it("rejects unsupported feature settings and makes X-Ray permissions follow the configured flag", () => {
    const base = environment();
    expect(() =>
      validate([
        { ...base, features: { ...base.features, shieldAdvanced: true } },
      ])
    ).toThrow(/shieldAdvanced.*unsupported/);
    for (const disasterRecovery of [
      { enableCrossRegionReplica: true, enableCrossRegionBackup: false },
      { enableCrossRegionReplica: false, enableCrossRegionBackup: true },
    ]) {
      expect(() => validate([{ ...base, disasterRecovery }])).toThrow(
        /disasterRecovery.*unsupported/
      );
    }
    expect(() => validate([base], [], { ...widgets, aurora: ["cpu"] })).toThrow(
      /dashboardWidgets.*unsupported/
    );
    expect(() =>
      validate([
        { ...base, features: { ...base.features, cognito: false, xray: true } },
      ])
    ).toThrow(/xray.*Aurora and Cognito/);
    const on = JSON.stringify(template(synth(base), "IamStack").toJSON());
    const off = JSON.stringify(
      template(
        synth({ ...base, features: { ...base.features, xray: false } }),
        "IamStack"
      ).toJSON()
    );
    expect(on).toContain("xray:PutTraceSegments");
    expect(off).not.toContain("xray:");
  });
});
