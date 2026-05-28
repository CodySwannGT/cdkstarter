/**
 * Tests for NetworkStage.
 *
 * @module test/stages/network-stage.test
 */
import * as cdk from "aws-cdk-lib";
import type { StageEnvironment } from "../../lib/types";
import { NetworkStage } from "../../lib/stages/network-stage";

describe("NetworkStage", () => {
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

  const productionEnvironment: StageEnvironment = {
    ...devEnvironment,
    name: "production",
    accountId: "333333333333",
    network: { vpcCidr: "10.2.0.0/16" },
  };

  describe("VPC Stack", () => {
    it("should create VpcStack", () => {
      const app = new cdk.App();
      const stage = new NetworkStage(app, "TestStage", {
        environment: devEnvironment,
        env: { account: "111111111111", region: "us-east-1" },
      });

      expect(stage.vpcStack).toBeDefined();
    });
  });

  describe("Security Groups Stack", () => {
    it("should create SecurityGroupsStack", () => {
      const app = new cdk.App();
      const stage = new NetworkStage(app, "TestStage", {
        environment: devEnvironment,
        env: { account: "111111111111", region: "us-east-1" },
      });

      expect(stage.securityGroupsStack).toBeDefined();
    });
  });

  describe("Stage Structure", () => {
    it("should create stage with correct account", () => {
      const app = new cdk.App();
      const stage = new NetworkStage(app, "TestStage", {
        environment: devEnvironment,
        env: { account: "111111111111", region: "us-east-1" },
      });

      expect(stage.account).toBe("111111111111");
      expect(stage.region).toBe("us-east-1");
    });

    it("should create stage for production environment", () => {
      const app = new cdk.App();
      const stage = new NetworkStage(app, "TestStage", {
        environment: productionEnvironment,
        env: { account: "333333333333", region: "us-east-1" },
      });

      expect(stage.vpcStack).toBeDefined();
      expect(stage.securityGroupsStack).toBeDefined();
    });

    it("should create stage for staging environment", () => {
      const stagingEnvironment: StageEnvironment = {
        ...devEnvironment,
        name: "staging",
        accountId: "222222222222",
        network: { vpcCidr: "10.1.0.0/16" },
      };

      const app = new cdk.App();
      const stage = new NetworkStage(app, "TestStage", {
        environment: stagingEnvironment,
        env: { account: "222222222222", region: "us-east-1" },
      });

      expect(stage.vpcStack).toBeDefined();
      expect(stage.securityGroupsStack).toBeDefined();
    });
  });
});
