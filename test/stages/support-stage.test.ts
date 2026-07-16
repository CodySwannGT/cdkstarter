/**
 * Tests for SupportStage.
 *
 * @module test/stages/support-stage.test
 */
import * as cdk from "aws-cdk-lib";
import type {
  DomainConfig,
  StageEnvironment,
  SupportEnvironment,
} from "../../lib/types";
import { SupportStage } from "../../lib/stages/support-stage";

describe("SupportStage", () => {
  const devEnvironment: StageEnvironment = {
    type: "stage",
    name: "dev",
    accountId: "111111111111",
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
      alarmEmailEndpoints: [],
      dashboardEnabled: false,
      detailedMonitoring: false,
      logRetentionDays: 3,
    },
    deployment: {
      requireManualApproval: false,
    },
  };

  const stagingEnvironment: StageEnvironment = {
    ...devEnvironment,
    name: "staging",
    accountId: "222222222222",
    network: { vpcCidr: "10.1.0.0/16" },
  };

  const supportEnvironment: SupportEnvironment = {
    type: "support",
    name: "shared",
    accountId: "999999999999",
    region: "us-east-1",
    purpose: {
      pipeline: true,
      dns: true,
      codeConnections: true,
      flowLogs: false,
    },
  };

  const domainConfig: DomainConfig = {
    domains: [
      {
        name: "example.com",
        isPrimary: true,
        environments: {
          dev: { subdomain: "dev" },
          staging: { subdomain: "staging" },
          production: { useApex: true },
        },
      },
    ],
  };

  const emptyDomainConfig: DomainConfig = {
    domains: [],
  };

  const defaultProps = {
    supportEnvironment,
    domainConfig,
    deployableEnvironments: [devEnvironment, stagingEnvironment],
    env: { account: "999999999999", region: "us-east-1" },
  };

  describe("DNS Stack", () => {
    it("should create DnsStack when domains configured", () => {
      const app = new cdk.App();
      const stage = new SupportStage(app, "TestStage", defaultProps);

      expect(stage.dnsStack).toBeDefined();
    });

    it("should skip DnsStack when no domains configured", () => {
      const app = new cdk.App();
      const stage = new SupportStage(app, "TestStage", {
        ...defaultProps,
        domainConfig: emptyDomainConfig,
      });

      expect(stage.dnsStack).toBeUndefined();
    });

    it("should skip DnsStack when the support purpose disables DNS", () => {
      const app = new cdk.App();
      const stage = new SupportStage(app, "TestStage", {
        ...defaultProps,
        supportEnvironment: {
          ...supportEnvironment,
          purpose: { ...supportEnvironment.purpose, dns: false },
        },
      });

      expect(stage.dnsStack).toBeUndefined();
    });
  });

  describe("Trust Policy Stacks", () => {
    it("should create TrustPolicyStack for each deployable environment", () => {
      const app = new cdk.App();
      const stage = new SupportStage(app, "TestStage", defaultProps);

      expect(stage.trustPolicyStacks).toHaveLength(2);
    });

    it("should create TrustPolicyStack with correct target account", () => {
      const app = new cdk.App();
      const stage = new SupportStage(app, "TestStage", {
        ...defaultProps,
        deployableEnvironments: [devEnvironment],
      });

      expect(stage.trustPolicyStacks).toHaveLength(1);
      expect(stage.trustPolicyStacks[0].targetAccountId).toBe("111111111111");
    });

    it("should create TrustPolicyStack with pipeline account reference", () => {
      const app = new cdk.App();
      const stage = new SupportStage(app, "TestStage", {
        ...defaultProps,
        deployableEnvironments: [devEnvironment],
      });

      expect(stage.trustPolicyStacks[0].pipelineAccountId).toBe("999999999999");
    });

    it("should handle empty deployable environments", () => {
      const app = new cdk.App();
      const stage = new SupportStage(app, "TestStage", {
        ...defaultProps,
        deployableEnvironments: [],
      });

      expect(stage.trustPolicyStacks).toHaveLength(0);
    });
  });

  describe("Stage Structure", () => {
    it("should create stage with support environment", () => {
      const app = new cdk.App();
      const stage = new SupportStage(app, "TestStage", defaultProps);

      expect(stage.account).toBe("999999999999");
      expect(stage.region).toBe("us-east-1");
    });

    it("should expose support environment", () => {
      const app = new cdk.App();
      const stage = new SupportStage(app, "TestStage", defaultProps);

      expect(stage.supportEnvironment).toBe(supportEnvironment);
    });
  });
});
