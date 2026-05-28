/**
 * Unit tests for VpcStack.
 *
 * These tests verify VPC resource creation with correct CIDR, subnet tiers,
 * NAT gateway configuration, and CloudFormation outputs.
 *
 * @module test/stacks/network/vpc-stack.test
 */
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { VpcStack } from "../../../lib/stacks/network/vpc-stack";

describe("VpcStack", () => {
  const createStack = (props: {
    stageName: string;
    vpcCidr: string;
    natGatewayCount: number;
    enableFlowLogs: boolean;
  }): Template => {
    const app = new cdk.App();
    const stack = new VpcStack(app, "TestVpcStack", {
      ...props,
      env: { account: "123456789012", region: "us-east-1" },
    });
    return Template.fromStack(stack);
  };

  it("should create VPC with correct CIDR", () => {
    const template = createStack({
      stageName: "dev",
      vpcCidr: "10.0.0.0/16",
      natGatewayCount: 1,
      enableFlowLogs: false,
    });

    template.hasResourceProperties("AWS::EC2::VPC", {
      CidrBlock: "10.0.0.0/16",
      EnableDnsHostnames: true,
      EnableDnsSupport: true,
    });
  });

  it("should create three subnet tiers", () => {
    const template = createStack({
      stageName: "dev",
      vpcCidr: "10.0.0.0/16",
      natGatewayCount: 1,
      enableFlowLogs: false,
    });

    // Should have public, private, and isolated subnets
    // With 2 AZs, each tier creates 2 subnets = 6 total subnets
    const subnets = template.findResources("AWS::EC2::Subnet");
    expect(Object.keys(subnets).length).toBe(6);
  });

  it("should create correct number of NAT gateways for dev", () => {
    const template = createStack({
      stageName: "dev",
      vpcCidr: "10.0.0.0/16",
      natGatewayCount: 1,
      enableFlowLogs: false,
    });

    const natGateways = template.findResources("AWS::EC2::NatGateway");
    expect(Object.keys(natGateways).length).toBe(1);
  });

  it("should create correct number of NAT gateways for production", () => {
    const template = createStack({
      stageName: "production",
      vpcCidr: "10.2.0.0/16",
      natGatewayCount: 2,
      enableFlowLogs: true,
    });

    const natGateways = template.findResources("AWS::EC2::NatGateway");
    expect(Object.keys(natGateways).length).toBe(2);
  });

  it("should enable flow logs when configured", () => {
    const template = createStack({
      stageName: "production",
      vpcCidr: "10.2.0.0/16",
      natGatewayCount: 2,
      enableFlowLogs: true,
    });

    template.hasResourceProperties("AWS::EC2::FlowLog", {
      ResourceType: "VPC",
      TrafficType: "ALL",
    });
  });

  it("should not create flow logs when disabled", () => {
    const template = createStack({
      stageName: "dev",
      vpcCidr: "10.0.0.0/16",
      natGatewayCount: 1,
      enableFlowLogs: false,
    });

    const flowLogs = template.findResources("AWS::EC2::FlowLog");
    expect(Object.keys(flowLogs).length).toBe(0);
  });

  it("should export VPC ID as output", () => {
    const template = createStack({
      stageName: "dev",
      vpcCidr: "10.0.0.0/16",
      natGatewayCount: 1,
      enableFlowLogs: false,
    });

    template.hasOutput("VpcId", {
      Export: { Name: "dev-vpc-id" },
    });
  });

  it("should export subnet IDs as outputs", () => {
    const template = createStack({
      stageName: "dev",
      vpcCidr: "10.0.0.0/16",
      natGatewayCount: 1,
      enableFlowLogs: false,
    });

    template.hasOutput("PublicSubnetIds", {
      Export: { Name: "dev-public-subnet-ids" },
    });
    template.hasOutput("PrivateSubnetIds", {
      Export: { Name: "dev-private-subnet-ids" },
    });
    template.hasOutput("IsolatedSubnetIds", {
      Export: { Name: "dev-isolated-subnet-ids" },
    });
  });

  it("should export availability zones as output", () => {
    const template = createStack({
      stageName: "dev",
      vpcCidr: "10.0.0.0/16",
      natGatewayCount: 1,
      enableFlowLogs: false,
    });

    template.hasOutput("AvailabilityZones", {
      Export: { Name: "dev-availability-zones" },
    });
  });

  it("should create internet gateway for public subnets", () => {
    const template = createStack({
      stageName: "dev",
      vpcCidr: "10.0.0.0/16",
      natGatewayCount: 1,
      enableFlowLogs: false,
    });

    template.hasResource("AWS::EC2::InternetGateway", {});
  });
});
