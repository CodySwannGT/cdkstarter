/** Tests for optional per-environment pipeline composition. */
import * as cdk from "aws-cdk-lib";
import type { AlarmThresholds, StageEnvironment } from "../../lib/types";
import { EnvironmentStage } from "../../lib/stages/environment-stage";

const alarmThresholds: AlarmThresholds = {
  aurora: {
    cpuWarning: 70,
    cpuCritical: 90,
    memoryWarningMB: 512,
    memoryCriticalMB: 256,
    connectionsWarning: 80,
    connectionsCritical: 100,
    replicationLagWarningMs: 1000,
    replicationLagCriticalMs: 5000,
    freeStorageCriticalGB: 10,
  },
  valkey: {
    cpuWarning: 70,
    cpuCritical: 90,
    cacheHitRateWarning: 80,
    cacheHitRateCritical: 50,
    evictionsWarning: 100,
    evictionsCritical: 1000,
  },
};

const frontendOnlyEnvironment: StageEnvironment = {
  type: "stage",
  name: "dev",
  accountId: "123456789012",
  region: "us-east-1",
  features: {
    network: false,
    observability: false,
    aurora: false,
    valkey: false,
    cognito: false,
    xray: false,
    waf: false,
    shieldAdvanced: false,
    backup: false,
    ssmRelay: false,
    githubOidcDeploy: false,
    migrationRunner: false,
    amplifyHosting: true,
  },
  aurora: {
    minCapacity: 0.5,
    maxCapacity: 2,
    instanceCount: 1,
    deletionProtection: false,
    backupRetentionDays: 1,
    logRetentionDays: 3,
  },
  valkey: { nodeType: "cache.t4g.micro", numCacheNodes: 1 },
  network: { vpcCidr: "10.0.0.0/16" },
  observability: {
    alarmEmailEndpoints: [],
    dashboardEnabled: false,
    detailedMonitoring: false,
    logRetentionDays: 3,
  },
  deployment: { requireManualApproval: false },
  amplifyHosting: {
    owner: "example",
    repository: "frontend",
    branch: "dev",
    oauthTokenSecretName: "example/amplify/github-token",
  },
};

describe("EnvironmentStage", () => {
  it("can synthesize an Amplify-only environment", () => {
    const app = new cdk.App();
    const stage = new EnvironmentStage(app, "FrontendOnly", {
      environment: frontendOnlyEnvironment,
      alarmThresholds,
      env: { account: "123456789012", region: "us-east-1" },
    });

    expect(stage.vpcStack).toBeUndefined();
    expect(stage.securityGroupsStack).toBeUndefined();
    expect(stage.amplifyHostingStack).toBeDefined();
    expect(stage.node.tryFindChild("SnsStack")).toBeUndefined();
  });

  it("rejects a network-dependent service when networking is disabled", () => {
    const app = new cdk.App();

    expect(
      () =>
        new EnvironmentStage(app, "Invalid", {
          environment: {
            ...frontendOnlyEnvironment,
            features: {
              ...frontendOnlyEnvironment.features,
              aurora: true,
            },
          },
          alarmThresholds,
        })
    ).toThrow(/network-dependent data service/);
  });
});
