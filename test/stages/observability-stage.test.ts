/**
 * Tests for ObservabilityStage.
 *
 * @module test/stages/observability-stage.test
 */
import * as cdk from "aws-cdk-lib";
import type { StageEnvironment } from "../../lib/types";
import { ObservabilityStage } from "../../lib/stages/observability-stage";

describe("ObservabilityStage", () => {
  const baseEnvironment: StageEnvironment = {
    type: "stage",
    name: "test",
    accountId: "123456789012",
    region: "us-east-1",
    features: {
      aurora: true,
      valkey: true,
      cognito: true,
      xray: true,
      waf: false,
      shieldAdvanced: false,
      backup: false,
      ssmRelay: false,
      githubOidcDeploy: false,
      migrationRunner: false,
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
      alarmEmailEndpoints: ["alerts@example.com"],
      dashboardEnabled: true,
      detailedMonitoring: false,
      logRetentionDays: 3,
    },
    deployment: {
      requireManualApproval: false,
    },
  };

  const auroraThresholds = {
    cpuCriticalPercent: 90,
    cpuWarningPercent: 70,
    storageCriticalGB: 10,
    storageWarningGB: 20,
    connectionsCritical: 180,
    connectionsWarning: 150,
    replicationLagMs: 1000,
  };

  const valkeyThresholds = {
    cpuWarningPercent: 80,
    cpuCriticalPercent: 95,
    cacheHitRateWarningPercent: 80,
    cacheHitRateCriticalPercent: 50,
    evictionsWarning: 0,
    evictionsCritical: 1000,
  };

  describe("SNS Stack", () => {
    it("should always create SnsStack", () => {
      const app = new cdk.App();
      const stage = new ObservabilityStage(app, "TestStage", {
        environment: baseEnvironment,
        env: { account: "123456789012", region: "us-east-1" },
      });

      expect(stage.snsStack).toBeDefined();
    });
  });

  describe("Aurora Alarms Stack", () => {
    it("should create AuroraAlarmsStack when aurora cluster ID and thresholds provided", () => {
      const app = new cdk.App();
      const stage = new ObservabilityStage(app, "TestStage", {
        environment: baseEnvironment,
        auroraClusterId: "test-aurora-cluster",
        auroraThresholds,
        env: { account: "123456789012", region: "us-east-1" },
      });

      expect(stage.auroraAlarmsStack).toBeDefined();
    });

    it("should not create AuroraAlarmsStack when aurora cluster ID not provided", () => {
      const app = new cdk.App();
      const stage = new ObservabilityStage(app, "TestStage", {
        environment: baseEnvironment,
        auroraThresholds,
        env: { account: "123456789012", region: "us-east-1" },
      });

      expect(stage.auroraAlarmsStack).toBeUndefined();
    });

    it("should not create AuroraAlarmsStack when thresholds not provided", () => {
      const app = new cdk.App();
      const stage = new ObservabilityStage(app, "TestStage", {
        environment: baseEnvironment,
        auroraClusterId: "test-aurora-cluster",
        env: { account: "123456789012", region: "us-east-1" },
      });

      expect(stage.auroraAlarmsStack).toBeUndefined();
    });
  });

  describe("Valkey Alarms Stack", () => {
    it("should create ValkeyAlarmsStack when valkey replication group ID and thresholds provided", () => {
      const app = new cdk.App();
      const stage = new ObservabilityStage(app, "TestStage", {
        environment: baseEnvironment,
        valkeyReplicationGroupId: "test-valkey-replication-group",
        valkeyThresholds,
        env: { account: "123456789012", region: "us-east-1" },
      });

      expect(stage.valkeyAlarmsStack).toBeDefined();
    });

    it("should not create ValkeyAlarmsStack when valkey replication group ID not provided", () => {
      const app = new cdk.App();
      const stage = new ObservabilityStage(app, "TestStage", {
        environment: baseEnvironment,
        valkeyThresholds,
        env: { account: "123456789012", region: "us-east-1" },
      });

      expect(stage.valkeyAlarmsStack).toBeUndefined();
    });

    it("should not create ValkeyAlarmsStack when thresholds not provided", () => {
      const app = new cdk.App();
      const stage = new ObservabilityStage(app, "TestStage", {
        environment: baseEnvironment,
        valkeyReplicationGroupId: "test-valkey-replication-group",
        env: { account: "123456789012", region: "us-east-1" },
      });

      expect(stage.valkeyAlarmsStack).toBeUndefined();
    });
  });

  describe("Dashboard Stack", () => {
    it("should create DashboardStack when dashboardEnabled is true", () => {
      const app = new cdk.App();
      const stage = new ObservabilityStage(app, "TestStage", {
        environment: baseEnvironment,
        env: { account: "123456789012", region: "us-east-1" },
      });

      expect(stage.dashboardStack).toBeDefined();
    });

    it("should not create DashboardStack when dashboardEnabled is false", () => {
      const app = new cdk.App();
      const envWithDashboardDisabled: StageEnvironment = {
        ...baseEnvironment,
        observability: {
          ...baseEnvironment.observability,
          dashboardEnabled: false,
        },
      };
      const stage = new ObservabilityStage(app, "TestStage", {
        environment: envWithDashboardDisabled,
        env: { account: "123456789012", region: "us-east-1" },
      });

      expect(stage.dashboardStack).toBeUndefined();
    });
  });

  describe("Full observability pipeline", () => {
    it("should create all stacks when all resources are enabled", () => {
      const app = new cdk.App();
      const stage = new ObservabilityStage(app, "TestStage", {
        environment: baseEnvironment,
        auroraClusterId: "test-aurora-cluster",
        auroraThresholds,
        valkeyReplicationGroupId: "test-valkey-replication-group",
        valkeyThresholds,
        env: { account: "123456789012", region: "us-east-1" },
      });

      expect(stage.snsStack).toBeDefined();
      expect(stage.auroraAlarmsStack).toBeDefined();
      expect(stage.valkeyAlarmsStack).toBeDefined();
      expect(stage.dashboardStack).toBeDefined();
    });

    it("should only create SNS stack when no resources are monitored and dashboard disabled", () => {
      const app = new cdk.App();
      const envWithDashboardDisabled: StageEnvironment = {
        ...baseEnvironment,
        observability: {
          ...baseEnvironment.observability,
          dashboardEnabled: false,
        },
      };
      const stage = new ObservabilityStage(app, "TestStage", {
        environment: envWithDashboardDisabled,
        env: { account: "123456789012", region: "us-east-1" },
      });

      expect(stage.snsStack).toBeDefined();
      expect(stage.auroraAlarmsStack).toBeUndefined();
      expect(stage.valkeyAlarmsStack).toBeUndefined();
      expect(stage.dashboardStack).toBeUndefined();
    });
  });
});
