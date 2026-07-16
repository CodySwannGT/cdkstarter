/**
 * Unit tests for configuration loader utility.
 *
 * These tests verify the configuration loading functions, PLACEHOLDER
 * filtering behavior, and validation rules for VPC CIDRs and domains.
 *
 * @module test/util/config-loader.test
 */
import {
  ConfigurationError,
  findDeadAmplifyHostingFlags,
  findNetworkDependencyViolations,
  getAlarmThresholds,
  getAllStageEnvironments,
  getDashboardWidgets,
  getDeployableSharedEnvironment,
  getDeployableStageEnvironments,
  getDomainConfig,
  getSupportEnvironments,
  isDeployableAccountId,
  validateConfiguration,
} from "../../util/config-loader";
import type { StageEnvironment } from "../../lib/types";

const stage = (features: StageEnvironment["features"]): StageEnvironment => ({
  type: "stage",
  name: "test",
  accountId: "123456789012",
  region: "us-east-1",
  features,
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
});

const frontendFeatures: StageEnvironment["features"] = {
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
};

describe("config-loader", () => {
  describe("getAllStageEnvironments", () => {
    it("should return all environments including PLACEHOLDER", () => {
      const envs = getAllStageEnvironments();
      expect(envs.length).toBeGreaterThan(0);
      expect(envs.every(e => e.type === "stage")).toBe(true);
    });

    it("should include dev, staging, and production", () => {
      const envs = getAllStageEnvironments();
      const names = envs.map(e => e.name);
      expect(names).toContain("dev");
      expect(names).toContain("staging");
      expect(names).toContain("production");
    });
  });

  describe("getDeployableStageEnvironments", () => {
    it("should filter out PLACEHOLDER accountIds", () => {
      const envs = getDeployableStageEnvironments();
      envs.forEach(env => {
        expect(env.accountId).not.toBe("PLACEHOLDER");
      });
    });

    it("should return empty array when all have PLACEHOLDER", () => {
      // With default config, all are PLACEHOLDER
      const envs = getDeployableStageEnvironments();
      expect(envs.length).toBe(0);
    });
  });

  describe("getSupportEnvironments", () => {
    it("should return support environments", () => {
      const envs = getSupportEnvironments();
      expect(envs.length).toBeGreaterThan(0);
      expect(envs.every(e => e.type === "support")).toBe(true);
    });

    it("should include shared environment", () => {
      const envs = getSupportEnvironments();
      const names = envs.map(e => e.name);
      expect(names).toContain("shared");
    });
  });

  describe("getDeployableSharedEnvironment", () => {
    it("should return undefined when shared has PLACEHOLDER", () => {
      // With default config, shared has PLACEHOLDER
      const shared = getDeployableSharedEnvironment();
      expect(shared).toBeUndefined();
    });
  });

  describe("isDeployableAccountId", () => {
    it("should return false for PLACEHOLDER", () => {
      expect(isDeployableAccountId("PLACEHOLDER")).toBe(false);
    });

    it("should return true for non-placeholder non-empty account ID", () => {
      expect(isDeployableAccountId("123456789012")).toBe(true);
    });

    it("should return false for empty string", () => {
      expect(isDeployableAccountId("")).toBe(false);
    });
  });

  describe("getDomainConfig", () => {
    it("should return domain configuration", () => {
      const config = getDomainConfig();
      expect(config).toBeDefined();
      expect(config.domains).toBeDefined();
    });
  });

  describe("getAlarmThresholds", () => {
    it("should return alarm thresholds", () => {
      const thresholds = getAlarmThresholds();
      expect(thresholds).toBeDefined();
      expect(thresholds.aurora).toBeDefined();
      expect(thresholds.valkey).toBeDefined();
    });
  });

  describe("getDashboardWidgets", () => {
    it("should return dashboard widgets", () => {
      const widgets = getDashboardWidgets();
      expect(widgets).toBeDefined();
      expect(widgets.aurora).toBeDefined();
    });
  });

  describe("validateConfiguration", () => {
    it("should pass with valid configuration", () => {
      expect(() => validateConfiguration()).not.toThrow();
    });

    it("should validate unique VPC CIDRs", () => {
      // Default config has unique CIDRs, so this should pass
      expect(() => validateConfiguration()).not.toThrow();
    });

    it("should validate exactly one primary domain when domains exist", () => {
      // Default config has exactly one primary domain
      expect(() => validateConfiguration()).not.toThrow();
    });
  });

  describe("ConfigurationError", () => {
    it("should be an instance of Error", () => {
      const error = new ConfigurationError("test");
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ConfigurationError);
      expect(error.message).toBe("test");
    });
  });

  describe("optional stage composition", () => {
    it("accepts a frontend-only stage with networking disabled", () => {
      expect(
        findNetworkDependencyViolations([stage(frontendFeatures)])
      ).toEqual([]);
    });

    it("finds network-dependent features when networking is disabled", () => {
      expect(
        findNetworkDependencyViolations([
          stage({ ...frontendFeatures, aurora: true }),
        ])
      ).toHaveLength(1);
    });

    it("finds an Amplify flag without hosting configuration", () => {
      expect(
        findDeadAmplifyHostingFlags([stage(frontendFeatures)])
      ).toHaveLength(1);
    });
  });
});
