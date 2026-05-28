/**
 * Unit tests for SecurityGroupsStack.
 *
 * These tests verify security group creation with correct ingress rules
 * for Aurora, Valkey, and Lambda communication.
 *
 * @module test/stacks/network/security-groups-stack.test
 */
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Match, Template } from "aws-cdk-lib/assertions";
import { SecurityGroupsStack } from "../../../lib/stacks/network/security-groups-stack";

describe("SecurityGroupsStack", () => {
  const createStack = (stageName: string): Template => {
    const app = new cdk.App();
    const vpcStack = new cdk.Stack(app, "VpcStack", {
      env: { account: "123456789012", region: "us-east-1" },
    });
    const vpc = new ec2.Vpc(vpcStack, "Vpc", {
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/16"),
    });

    const stack = new SecurityGroupsStack(app, "TestSecurityGroupsStack", {
      stageName,
      vpc,
      env: { account: "123456789012", region: "us-east-1" },
    });
    return Template.fromStack(stack);
  };

  it("should create Aurora security group", () => {
    const template = createStack("dev");

    template.hasResourceProperties("AWS::EC2::SecurityGroup", {
      GroupDescription: Match.stringLikeRegexp("Aurora"),
    });
  });

  it("should create Valkey security group", () => {
    const template = createStack("dev");

    template.hasResourceProperties("AWS::EC2::SecurityGroup", {
      GroupDescription: Match.stringLikeRegexp("Valkey"),
    });
  });

  it("should create Lambda security group", () => {
    const template = createStack("dev");

    template.hasResourceProperties("AWS::EC2::SecurityGroup", {
      GroupDescription: Match.stringLikeRegexp("Lambda"),
    });
  });

  it("should have ingress rule for Aurora on port 5432", () => {
    const template = createStack("dev");

    // Find security group ingress allowing port 5432
    template.hasResourceProperties("AWS::EC2::SecurityGroupIngress", {
      IpProtocol: "tcp",
      FromPort: 5432,
      ToPort: 5432,
    });
  });

  it("should have ingress rule for Valkey on port 6379", () => {
    const template = createStack("dev");

    // Find security group ingress allowing port 6379
    template.hasResourceProperties("AWS::EC2::SecurityGroupIngress", {
      IpProtocol: "tcp",
      FromPort: 6379,
      ToPort: 6379,
    });
  });

  it("should export Aurora security group ID", () => {
    const template = createStack("dev");

    template.hasOutput("AuroraSecurityGroupId", {
      Export: { Name: "dev-aurora-security-group-id" },
    });
  });

  it("should export Valkey security group ID", () => {
    const template = createStack("dev");

    template.hasOutput("ValkeySecurityGroupId", {
      Export: { Name: "dev-valkey-security-group-id" },
    });
  });

  it("should export Lambda security group ID", () => {
    const template = createStack("dev");

    template.hasOutput("LambdaSecurityGroupId", {
      Export: { Name: "dev-lambda-security-group-id" },
    });
  });

  it("should create three security groups total", () => {
    const template = createStack("dev");

    const securityGroups = template.findResources("AWS::EC2::SecurityGroup");
    expect(Object.keys(securityGroups).length).toBe(3);
  });
});
