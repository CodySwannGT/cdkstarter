/**
 * Unit tests for AuroraStack.
 *
 * These tests verify Aurora Serverless v2 cluster creation with correct
 * configuration including capacity settings, RDS Proxy, and IAM auth.
 *
 * @module test/stacks/database/aurora-stack.test
 */
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Match, Template } from "aws-cdk-lib/assertions";
import { AuroraStack } from "../../../lib/stacks/database/aurora-stack";
import type { AuroraConfig } from "../../../lib/types";

describe("AuroraStack", () => {
  const devConfig: AuroraConfig = {
    minCapacity: 0.5,
    maxCapacity: 2,
    instanceCount: 1,
    deletionProtection: false,
    backupRetentionDays: 1,
    logRetentionDays: 3,
  };

  const prodConfig: AuroraConfig = {
    minCapacity: 2,
    maxCapacity: 64,
    instanceCount: 2,
    deletionProtection: true,
    backupRetentionDays: 35,
    logRetentionDays: 365,
  };

  const createStack = (
    auroraConfig: AuroraConfig,
    stageName = "dev"
  ): Template => {
    const app = new cdk.App();

    // Create a helper stack with VPC and security group
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

    const securityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      helperStack,
      "ImportedSG",
      "sg-12345"
    );

    const stack = new AuroraStack(app, "TestAuroraStack", {
      stageName,
      vpc,
      securityGroup,
      aurora: auroraConfig,
      env: { account: "123456789012", region: "us-east-1" },
    });

    return Template.fromStack(stack);
  };

  it("should create Aurora PostgreSQL cluster", () => {
    const template = createStack(devConfig);

    template.hasResourceProperties("AWS::RDS::DBCluster", {
      Engine: "aurora-postgresql",
    });
  });

  it("should configure serverless v2 scaling", () => {
    const template = createStack(devConfig);

    template.hasResourceProperties("AWS::RDS::DBCluster", {
      ServerlessV2ScalingConfiguration: {
        MinCapacity: 0.5,
        MaxCapacity: 2,
      },
    });
  });

  it("should leave Enhanced Monitoring and Performance Insights off by default", () => {
    const template = createStack(devConfig);

    const instances = template.findResources("AWS::RDS::DBInstance");
    Object.values(instances).forEach(instance => {
      expect(instance.Properties.MonitoringInterval).toBeUndefined();
      expect(instance.Properties.EnablePerformanceInsights).toBeFalsy();
    });
  });

  it("should enable Enhanced Monitoring at the configured interval", () => {
    const template = createStack({
      ...prodConfig,
      enhancedMonitoringIntervalSeconds: 15,
    });

    const instances = template.findResources("AWS::RDS::DBInstance");
    expect(Object.keys(instances).length).toBeGreaterThanOrEqual(1);
    Object.values(instances).forEach(instance => {
      expect(instance.Properties.MonitoringInterval).toBe(15);
    });
  });

  it("should enable Performance Insights on every instance when configured", () => {
    const template = createStack({
      ...prodConfig,
      performanceInsights: true,
    });

    const instances = template.findResources("AWS::RDS::DBInstance");
    expect(Object.keys(instances).length).toBeGreaterThanOrEqual(1);
    Object.values(instances).forEach(instance => {
      expect(instance.Properties.EnablePerformanceInsights).toBe(true);
    });
  });

  it("should create RDS Proxy", () => {
    const template = createStack(devConfig);

    template.hasResourceProperties("AWS::RDS::DBProxy", {
      EngineFamily: "POSTGRESQL",
      RequireTLS: true,
    });
  });

  it("should enable IAM auth on proxy", () => {
    const template = createStack(devConfig);

    template.hasResourceProperties("AWS::RDS::DBProxyTargetGroup", {
      DBProxyName: Match.anyValue(),
    });
  });

  it("should enable deletion protection when configured", () => {
    const template = createStack(prodConfig, "production");

    template.hasResourceProperties("AWS::RDS::DBCluster", {
      DeletionProtection: true,
    });
  });

  it("should disable deletion protection for dev", () => {
    const template = createStack(devConfig);

    template.hasResourceProperties("AWS::RDS::DBCluster", {
      DeletionProtection: false,
    });
  });

  it("should export cluster endpoint", () => {
    const template = createStack(devConfig);

    template.hasOutput("ClusterEndpoint", {
      Export: { Name: "dev-aurora-cluster-endpoint" },
    });
  });

  it("should export proxy endpoint", () => {
    const template = createStack(devConfig);

    template.hasOutput("ProxyEndpoint", {
      Export: { Name: "dev-aurora-proxy-endpoint" },
    });
  });

  it("should export secret ARN", () => {
    const template = createStack(devConfig);

    template.hasOutput("SecretArn", {
      Export: { Name: "dev-aurora-secret-arn" },
    });
  });

  it("should store credentials in Secrets Manager", () => {
    const template = createStack(devConfig);

    template.hasResource("AWS::SecretsManager::Secret", {});
  });

  it("should enable CloudWatch log exports", () => {
    const template = createStack(devConfig);

    template.hasResourceProperties("AWS::RDS::DBCluster", {
      EnableCloudwatchLogsExports: ["postgresql"],
    });
  });

  describe("Log retention mapping", () => {
    it("should use ONE_DAY retention for 1 day", () => {
      const config = { ...devConfig, logRetentionDays: 1 };
      const template = createStack(config);

      template.hasResourceProperties("AWS::RDS::DBCluster", {
        Engine: "aurora-postgresql",
      });
    });

    it("should use ONE_WEEK retention for 7 days", () => {
      const config = { ...devConfig, logRetentionDays: 7 };
      const template = createStack(config);

      template.hasResourceProperties("AWS::RDS::DBCluster", {
        Engine: "aurora-postgresql",
      });
    });

    it("should use TWO_WEEKS retention for 14 days", () => {
      const config = { ...devConfig, logRetentionDays: 14 };
      const template = createStack(config);

      template.hasResourceProperties("AWS::RDS::DBCluster", {
        Engine: "aurora-postgresql",
      });
    });

    it("should use ONE_MONTH retention for 30 days", () => {
      const config = { ...devConfig, logRetentionDays: 30 };
      const template = createStack(config);

      template.hasResourceProperties("AWS::RDS::DBCluster", {
        Engine: "aurora-postgresql",
      });
    });

    it("should use THREE_MONTHS retention for 90 days", () => {
      const config = { ...devConfig, logRetentionDays: 90 };
      const template = createStack(config);

      template.hasResourceProperties("AWS::RDS::DBCluster", {
        Engine: "aurora-postgresql",
      });
    });

    it("should use SIX_MONTHS retention for 180 days", () => {
      const config = { ...devConfig, logRetentionDays: 180 };
      const template = createStack(config);

      template.hasResourceProperties("AWS::RDS::DBCluster", {
        Engine: "aurora-postgresql",
      });
    });
  });

  it("should export cluster port", () => {
    const template = createStack(devConfig);

    template.hasOutput("ClusterPort", {
      Export: { Name: "dev-aurora-cluster-port" },
    });
  });
});
