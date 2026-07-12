/**
 * Tests for AppStage.
 *
 * @module test/stages/app-stage.test
 */
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import type { DomainConfig, StageEnvironment } from "../../lib/types";
import { AppStage } from "../../lib/stages/app-stage";

const domainsFor = (stageName: string): DomainConfig => ({
  domains: [
    {
      name: "example.com",
      isPrimary: true,
      environments:
        stageName === "production"
          ? { production: { useApex: true } }
          : { [stageName]: { subdomain: stageName } },
    },
  ],
});

describe("AppStage", () => {
  const createStage = (
    overrides: Partial<StageEnvironment> = {},
    domainConfig?: DomainConfig
  ): AppStage => {
    const app = new cdk.App();

    const helperStack = new cdk.Stack(app, "HelperStack", {
      env: { account: "123456789012", region: "us-east-1" },
    });

    const vpc = ec2.Vpc.fromVpcAttributes(helperStack, "ImportedVpc", {
      vpcId: "vpc-12345",
      availabilityZones: ["us-east-1a", "us-east-1b"],
      isolatedSubnetIds: ["subnet-isolated-1", "subnet-isolated-2"],
      isolatedSubnetRouteTableIds: ["rtb-1", "rtb-2"],
      privateSubnetIds: ["subnet-private-1", "subnet-private-2"],
      privateSubnetRouteTableIds: ["rtb-3", "rtb-4"],
    });
    const auroraSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      helperStack,
      "AuroraSG",
      "sg-aurora-12345"
    );
    const valkeySecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      helperStack,
      "ValkeySG",
      "sg-valkey-12345"
    );

    const environment: StageEnvironment = {
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
        alarmEmailEndpoints: [],
        dashboardEnabled: false,
        detailedMonitoring: false,
        logRetentionDays: 3,
      },
      deployment: {
        requireManualApproval: false,
      },
      ...overrides,
    };

    return new AppStage(app, "TestAppStage", {
      environment,
      vpc,
      auroraSecurityGroup,
      valkeySecurityGroup,
      domainConfig,
      env: { account: "123456789012", region: "us-east-1" },
    });
  };

  const allFeatures: StageEnvironment["features"] = {
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
  };

  describe("All features enabled", () => {
    it("should create CognitoStack when cognito enabled", () => {
      const stage = createStage();

      expect(stage.cognitoStack).toBeDefined();
    });

    it("should create AuroraStack when aurora enabled", () => {
      const stage = createStage();

      expect(stage.auroraStack).toBeDefined();
    });

    it("should create ValkeyStack when valkey enabled", () => {
      const stage = createStage();

      expect(stage.valkeyStack).toBeDefined();
    });

    it("should create IamStack when both aurora and cognito enabled", () => {
      const stage = createStage();

      expect(stage.iamStack).toBeDefined();
    });
  });

  describe("Features disabled", () => {
    it("should not create CognitoStack when cognito disabled", () => {
      const stage = createStage({
        features: {
          aurora: true,
          valkey: true,
          cognito: false,
          xray: true,
          waf: false,
          shieldAdvanced: false,
          backup: false,
          ssmRelay: false,
          githubOidcDeploy: false,
          migrationRunner: false,
        },
      });

      expect(stage.cognitoStack).toBeUndefined();
    });

    it("should not create AuroraStack when aurora disabled", () => {
      const stage = createStage({
        features: {
          aurora: false,
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
      });

      expect(stage.auroraStack).toBeUndefined();
    });

    it("should not create ValkeyStack when valkey disabled", () => {
      const stage = createStage({
        features: {
          aurora: true,
          valkey: false,
          cognito: true,
          xray: true,
          waf: false,
          shieldAdvanced: false,
          backup: false,
          ssmRelay: false,
          githubOidcDeploy: false,
          migrationRunner: false,
        },
      });

      expect(stage.valkeyStack).toBeUndefined();
    });

    it("should not create IamStack when aurora disabled", () => {
      const stage = createStage({
        features: {
          aurora: false,
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
      });

      expect(stage.iamStack).toBeUndefined();
    });

    it("should not create IamStack when cognito disabled", () => {
      const stage = createStage({
        features: {
          aurora: true,
          valkey: true,
          cognito: false,
          xray: true,
          waf: false,
          shieldAdvanced: false,
          backup: false,
          ssmRelay: false,
          githubOidcDeploy: false,
          migrationRunner: false,
        },
      });

      expect(stage.iamStack).toBeUndefined();
    });

    it("should not create any stacks when all features disabled", () => {
      const stage = createStage({
        features: {
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
        },
      });

      expect(stage.cognitoStack).toBeUndefined();
      expect(stage.auroraStack).toBeUndefined();
      expect(stage.valkeyStack).toBeUndefined();
      expect(stage.iamStack).toBeUndefined();
    });
  });

  describe("Conditional CloudFront + WAF edge", () => {
    it("creates no edge when no domain is configured (no-op)", () => {
      expect(createStage().cdnStack).toBeUndefined();
    });

    it("stays a no-op for a non-prod stage with waf:true but no domain", () => {
      const stage = createStage({ features: { ...allFeatures, waf: true } });

      expect(stage.cdnStack).toBeUndefined();
    });

    it("creates the edge for production when a domain is configured", () => {
      const stage = createStage(
        { name: "production" },
        domainsFor("production")
      );

      expect(stage.cdnStack).toBeDefined();
    });

    it("creates the edge for a non-prod stage that opted in with waf:true", () => {
      const stage = createStage(
        { features: { ...allFeatures, waf: true } },
        domainsFor("test")
      );

      expect(stage.cdnStack).toBeDefined();
    });

    it("creates no edge for a non-prod stage with a domain but waf:false", () => {
      const stage = createStage({}, domainsFor("test"));

      expect(stage.cdnStack).toBeUndefined();
    });
  });
});
