/**
 * Unit tests for environment configuration.
 *
 * These tests verify the structure and constraints of the environment
 * configuration, ensuring all environments have proper settings and
 * that critical constraints like unique VPC CIDRs are enforced.
 *
 * @module test/config/environments.test
 */
import {
  stageEnvironments,
  supportEnvironments,
} from "../../config/environments";

describe("environments", () => {
  describe("stageEnvironments", () => {
    it("should export stageEnvironments array", () => {
      expect(Array.isArray(stageEnvironments)).toBe(true);
      expect(stageEnvironments.length).toBeGreaterThan(0);
    });

    it("should have dev, staging, and production environments", () => {
      const names = stageEnvironments.map(env => env.name);
      expect(names).toContain("dev");
      expect(names).toContain("staging");
      expect(names).toContain("production");
    });

    it("should have unique VPC CIDRs for each stage", () => {
      const cidrs = stageEnvironments.map(env => env.network.vpcCidr);
      const uniqueCidrs = new Set(cidrs);
      expect(uniqueCidrs.size).toBe(cidrs.length);
    });

    it("should have all stages with type stage", () => {
      stageEnvironments.forEach(env => {
        expect(env.type).toBe("stage");
      });
    });

    it("should have dev environment with low capacity settings", () => {
      const dev = stageEnvironments.find(env => env.name === "dev");
      expect(dev).toBeDefined();
      expect(dev?.aurora.minCapacity).toBe(0.5);
      expect(dev?.aurora.maxCapacity).toBe(2);
      expect(dev?.aurora.instanceCount).toBe(1);
      expect(dev?.aurora.deletionProtection).toBe(false);
      expect(dev?.valkey.nodeType).toBe("cache.t4g.micro");
      expect(dev?.valkey.numCacheNodes).toBe(1);
      expect(dev?.observability.dashboardEnabled).toBe(false);
    });

    it("should have staging environment with medium capacity settings", () => {
      const staging = stageEnvironments.find(env => env.name === "staging");
      expect(staging).toBeDefined();
      expect(staging?.aurora.minCapacity).toBe(1);
      expect(staging?.aurora.maxCapacity).toBe(8);
      expect(staging?.aurora.instanceCount).toBe(2);
      expect(staging?.aurora.deletionProtection).toBe(true);
      expect(staging?.valkey.nodeType).toBe("cache.t4g.small");
      expect(staging?.valkey.numCacheNodes).toBe(2);
      expect(staging?.observability.dashboardEnabled).toBe(true);
    });

    it("should have production environment with high capacity settings", () => {
      const production = stageEnvironments.find(
        env => env.name === "production"
      );
      expect(production).toBeDefined();
      expect(production?.aurora.minCapacity).toBe(2);
      expect(production?.aurora.maxCapacity).toBe(64);
      expect(production?.aurora.instanceCount).toBe(2);
      expect(production?.aurora.deletionProtection).toBe(true);
      expect(production?.valkey.nodeType).toBe("cache.r7g.large");
      expect(production?.valkey.numCacheNodes).toBe(2);
      expect(production?.observability.dashboardEnabled).toBe(true);
    });

    it("should have all feature flags enabled for all stages", () => {
      stageEnvironments.forEach(env => {
        expect(env.features.aurora).toBe(true);
        expect(env.features.valkey).toBe(true);
        expect(env.features.cognito).toBe(true);
        expect(env.features.xray).toBe(true);
      });
    });

    it("should have us-east-1 region for all stages", () => {
      stageEnvironments.forEach(env => {
        expect(env.region).toBe("us-east-1");
      });
    });
  });

  describe("supportEnvironments", () => {
    it("should export supportEnvironments array", () => {
      expect(Array.isArray(supportEnvironments)).toBe(true);
      expect(supportEnvironments.length).toBeGreaterThan(0);
    });

    it("should have shared environment", () => {
      const shared = supportEnvironments.find(env => env.name === "shared");
      expect(shared).toBeDefined();
      expect(shared?.type).toBe("support");
    });

    it("should have pipeline, dns, and codeConnections enabled for shared", () => {
      const shared = supportEnvironments.find(env => env.name === "shared");
      expect(shared?.purpose.pipeline).toBe(true);
      expect(shared?.purpose.dns).toBe(true);
      expect(shared?.purpose.codeConnections).toBe(true);
    });

    it("should have us-east-1 region for shared", () => {
      const shared = supportEnvironments.find(env => env.name === "shared");
      expect(shared?.region).toBe("us-east-1");
    });
  });
});
