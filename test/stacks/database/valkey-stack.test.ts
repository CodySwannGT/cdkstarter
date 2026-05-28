/**
 * Unit tests for ValkeyStack.
 *
 * These tests verify ElastiCache Valkey cluster creation with correct
 * configuration including node type, encryption, and subnet group.
 *
 * @module test/stacks/database/valkey-stack.test
 */
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Template } from "aws-cdk-lib/assertions";
import { ValkeyStack } from "../../../lib/stacks/database/valkey-stack";
import type { ValkeyConfig } from "../../../lib/types";

describe("ValkeyStack", () => {
  const devConfig: ValkeyConfig = {
    nodeType: "cache.t4g.micro",
    numCacheNodes: 1,
  };

  const prodConfig: ValkeyConfig = {
    nodeType: "cache.r7g.large",
    numCacheNodes: 2,
  };

  const createStack = (
    valkeyConfig: ValkeyConfig,
    stageName = "dev"
  ): Template => {
    const app = new cdk.App();

    const helperStack = new cdk.Stack(app, "HelperStack", {
      env: { account: "123456789012", region: "us-east-1" },
    });

    const vpc = ec2.Vpc.fromVpcAttributes(helperStack, "ImportedVpc", {
      vpcId: "vpc-12345",
      availabilityZones: ["us-east-1a", "us-east-1b"],
      isolatedSubnetIds: ["subnet-isolated-1", "subnet-isolated-2"],
      isolatedSubnetRouteTableIds: ["rtb-1", "rtb-2"],
    });

    const securityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      helperStack,
      "ImportedSG",
      "sg-12345"
    );

    const stack = new ValkeyStack(app, "TestValkeyStack", {
      stageName,
      vpc,
      securityGroup,
      valkey: valkeyConfig,
      env: { account: "123456789012", region: "us-east-1" },
    });

    return Template.fromStack(stack);
  };

  it("should create Valkey replication group", () => {
    const template = createStack(devConfig);

    template.hasResourceProperties("AWS::ElastiCache::ReplicationGroup", {
      Engine: "valkey",
    });
  });

  it("should use Valkey engine version 7", () => {
    const template = createStack(devConfig);

    template.hasResourceProperties("AWS::ElastiCache::ReplicationGroup", {
      EngineVersion: "7.2",
    });
  });

  it("should configure node type from props", () => {
    const template = createStack(devConfig);

    template.hasResourceProperties("AWS::ElastiCache::ReplicationGroup", {
      CacheNodeType: "cache.t4g.micro",
    });
  });

  it("should enable at-rest encryption", () => {
    const template = createStack(devConfig);

    template.hasResourceProperties("AWS::ElastiCache::ReplicationGroup", {
      AtRestEncryptionEnabled: true,
    });
  });

  it("should enable in-transit encryption", () => {
    const template = createStack(devConfig);

    template.hasResourceProperties("AWS::ElastiCache::ReplicationGroup", {
      TransitEncryptionEnabled: true,
    });
  });

  it("should create subnet group", () => {
    const template = createStack(devConfig);

    template.hasResource("AWS::ElastiCache::SubnetGroup", {});
  });

  it("should create parameter group for valkey7", () => {
    const template = createStack(devConfig);

    template.hasResourceProperties("AWS::ElastiCache::ParameterGroup", {
      CacheParameterGroupFamily: "valkey7",
    });
  });

  it("should export cache endpoint", () => {
    const template = createStack(devConfig);

    template.hasOutput("CacheEndpoint", {
      Export: { Name: "dev-valkey-endpoint" },
    });
  });

  it("should export cache port", () => {
    const template = createStack(devConfig);

    template.hasOutput("CachePort", {
      Export: { Name: "dev-valkey-port" },
    });
  });

  it("should enable automatic failover when multiple nodes configured", () => {
    const template = createStack(prodConfig, "production");

    template.hasResourceProperties("AWS::ElastiCache::ReplicationGroup", {
      AutomaticFailoverEnabled: true,
    });
  });
});
