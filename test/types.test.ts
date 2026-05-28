/**
 * Unit tests for configuration type definitions.
 *
 * These tests verify that all required interfaces are properly exported and
 * can be used for type-safe configuration. Since TypeScript interfaces are
 * compile-time constructs, these tests primarily verify that imports work
 * and that the types can be instantiated with expected shapes.
 *
 * @module test/types.test
 */
import type {
  AlarmThresholds,
  AuroraAlarmThresholds,
  AuroraConfig,
  DashboardWidgets,
  DeploymentConfig,
  Domain,
  DomainConfig,
  EnvironmentType,
  NetworkConfig,
  ObservabilityConfig,
  StageEnvironment,
  StageFeatures,
  SupportEnvironment,
  SupportPurpose,
  ValkeyAlarmThresholds,
  ValkeyConfig,
} from "../lib/types";

describe("Configuration Types", () => {
  describe("EnvironmentType", () => {
    it("should accept 'stage' and 'support' values", () => {
      const stageType: EnvironmentType = "stage";
      const supportType: EnvironmentType = "support";

      expect(stageType).toBe("stage");
      expect(supportType).toBe("support");
    });
  });

  describe("StageFeatures", () => {
    it("should define feature flags for stage environments", () => {
      const features: StageFeatures = {
        aurora: true,
        valkey: true,
        cognito: true,
        xray: false,
        waf: false,
        shieldAdvanced: false,
      };

      expect(features.aurora).toBe(true);
      expect(features.xray).toBe(false);
      expect(features.waf).toBe(false);
      expect(features.shieldAdvanced).toBe(false);
    });
  });

  describe("AuroraConfig", () => {
    it("should define database capacity and settings", () => {
      const config: AuroraConfig = {
        minCapacity: 0.5,
        maxCapacity: 2,
        instanceCount: 1,
        deletionProtection: false,
        backupRetentionDays: 1,
        logRetentionDays: 3,
      };

      expect(config.minCapacity).toBe(0.5);
      expect(config.deletionProtection).toBe(false);
    });
  });

  describe("ValkeyConfig", () => {
    it("should define cache node configuration", () => {
      const config: ValkeyConfig = {
        nodeType: "cache.t4g.micro",
        numCacheNodes: 1,
      };

      expect(config.nodeType).toBe("cache.t4g.micro");
      expect(config.numCacheNodes).toBe(1);
    });
  });

  describe("ObservabilityConfig", () => {
    it("should define monitoring settings", () => {
      const config: ObservabilityConfig = {
        alarmEmailEndpoints: ["alerts@example.com"],
        dashboardEnabled: true,
        detailedMonitoring: true,
        logRetentionDays: 30,
      };

      expect(config.alarmEmailEndpoints).toHaveLength(1);
      expect(config.dashboardEnabled).toBe(true);
    });
  });

  describe("NetworkConfig", () => {
    it("should define VPC CIDR with uniqueness requirement", () => {
      const config: NetworkConfig = {
        vpcCidr: "10.0.0.0/16",
      };

      expect(config.vpcCidr).toBe("10.0.0.0/16");
    });
  });

  describe("DeploymentConfig", () => {
    it("should define deployment pipeline settings", () => {
      const config: DeploymentConfig = {
        requireManualApproval: true,
      };

      expect(config.requireManualApproval).toBe(true);
    });
  });

  describe("StageEnvironment", () => {
    it("should define complete stage environment configuration", () => {
      const env: StageEnvironment = {
        type: "stage",
        name: "dev",
        accountId: "123456789012",
        region: "us-east-1",
        features: {
          aurora: true,
          valkey: true,
          cognito: true,
          xray: true,
          waf: false,
          shieldAdvanced: false,
        },
        aurora: {
          minCapacity: 0.5,
          maxCapacity: 2,
          instanceCount: 1,
          deletionProtection: false,
          backupRetentionDays: 1,
          logRetentionDays: 3,
        },
        valkey: {
          nodeType: "cache.t4g.micro",
          numCacheNodes: 1,
        },
        network: {
          vpcCidr: "10.0.0.0/16",
        },
        observability: {
          alarmEmailEndpoints: [],
          dashboardEnabled: false,
          detailedMonitoring: false,
          logRetentionDays: 3,
        },
        deployment: {
          requireManualApproval: false,
        },
      };

      expect(env.type).toBe("stage");
      expect(env.name).toBe("dev");
      expect(env.deployment.requireManualApproval).toBe(false);
    });
  });

  describe("SupportPurpose", () => {
    it("should define shared account purpose flags", () => {
      const purpose: SupportPurpose = {
        pipeline: true,
        dns: true,
        codeConnections: true,
      };

      expect(purpose.pipeline).toBe(true);
    });
  });

  describe("SupportEnvironment", () => {
    it("should define support account configuration", () => {
      const env: SupportEnvironment = {
        type: "support",
        name: "shared",
        accountId: "123456789012",
        region: "us-east-1",
        purpose: {
          pipeline: true,
          dns: true,
          codeConnections: true,
        },
      };

      expect(env.type).toBe("support");
      expect(env.purpose.pipeline).toBe(true);
    });
  });

  describe("Domain", () => {
    it("should define domain with environment mappings", () => {
      const domain: Domain = {
        name: "example.com",
        isPrimary: true,
        environments: {
          dev: { subdomain: "dev" },
          production: { useApex: true },
        },
      };

      expect(domain.isPrimary).toBe(true);
      expect(domain.environments.dev?.subdomain).toBe("dev");
    });
  });

  describe("DomainConfig", () => {
    it("should define domains array wrapper", () => {
      const config: DomainConfig = {
        domains: [
          {
            name: "example.com",
            isPrimary: true,
            environments: {},
          },
        ],
      };

      expect(config.domains).toHaveLength(1);
    });
  });

  describe("AlarmThresholds", () => {
    it("should define configurable thresholds for aurora and valkey", () => {
      const thresholds: AlarmThresholds = {
        aurora: {
          cpuWarning: 80,
          cpuCritical: 95,
          memoryWarningMB: 1000,
          memoryCriticalMB: 500,
          connectionsWarning: 150,
          connectionsCritical: 200,
          replicationLagWarningMs: 100,
          replicationLagCriticalMs: 1000,
          freeStorageCriticalGB: 10,
        },
        valkey: {
          cpuWarning: 80,
          cpuCritical: 95,
          cacheHitRateWarning: 80,
          cacheHitRateCritical: 50,
          evictionsWarning: 0,
          evictionsCritical: 1000,
        },
      };

      expect(thresholds.aurora.cpuWarning).toBe(80);
      expect(thresholds.valkey.cacheHitRateWarning).toBe(80);
      expect(thresholds.valkey.cpuCritical).toBe(95);
    });
  });

  describe("AuroraAlarmThresholds", () => {
    it("should define Aurora-specific alarm thresholds", () => {
      const thresholds: AuroraAlarmThresholds = {
        cpuWarning: 80,
        cpuCritical: 95,
        memoryWarningMB: 1000,
        memoryCriticalMB: 500,
        connectionsWarning: 150,
        connectionsCritical: 200,
        replicationLagWarningMs: 100,
        replicationLagCriticalMs: 1000,
        freeStorageCriticalGB: 10,
      };

      expect(thresholds.cpuCritical).toBe(95);
    });
  });

  describe("ValkeyAlarmThresholds", () => {
    it("should define Valkey-specific alarm thresholds", () => {
      const thresholds: ValkeyAlarmThresholds = {
        cpuWarning: 80,
        cpuCritical: 95,
        cacheHitRateWarning: 80,
        cacheHitRateCritical: 50,
        evictionsWarning: 0,
        evictionsCritical: 1000,
      };

      expect(thresholds.evictionsWarning).toBe(0);
      expect(thresholds.cpuCritical).toBe(95);
      expect(thresholds.cacheHitRateCritical).toBe(50);
      expect(thresholds.evictionsCritical).toBe(1000);
    });
  });

  describe("DashboardWidgets", () => {
    it("should define widget configuration per resource type", () => {
      const widgets: DashboardWidgets = {
        aurora: ["connections", "cpu", "memory"],
        valkey: ["hitRate", "connections"],
        cognito: ["signIns", "signUps"],
        vpc: ["natGateway"],
      };

      expect(widgets.aurora).toContain("cpu");
      expect(widgets.valkey).toContain("hitRate");
    });
  });
});
