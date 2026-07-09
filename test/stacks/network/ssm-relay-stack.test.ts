/**
 * Tests for SsmRelayStack.
 *
 * @module test/stacks/network/ssm-relay-stack.test
 */
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import {
  SsmRelayStack,
  ssmRelayAsgParameterName,
} from "../../../lib/stacks/network/ssm-relay-stack";

describe("SsmRelayStack", () => {
  const createTemplate = (): Template => {
    const app = new cdk.App();
    const networkStack = new cdk.Stack(app, "NetworkStack", {
      env: { account: "111111111111", region: "us-east-1" },
    });
    const vpc = new ec2.Vpc(networkStack, "Vpc", { maxAzs: 2 });
    const securityGroup = new ec2.SecurityGroup(networkStack, "RelaySg", {
      vpc,
    });
    const stack = new SsmRelayStack(app, "TestStack", {
      stageName: "dev",
      vpc,
      securityGroup,
      env: { account: "111111111111", region: "us-east-1" },
    });
    return Template.fromStack(stack);
  };

  describe("Auto Scaling Group", () => {
    it("should self-heal with exactly one instance", () => {
      const template = createTemplate();

      template.hasResourceProperties("AWS::AutoScaling::AutoScalingGroup", {
        MinSize: "1",
        MaxSize: "1",
        DesiredCapacity: "1",
        AutoScalingGroupName: "ssm-relay-dev",
      });
    });

    it("should use a t4g.nano instance with IMDSv2 required", () => {
      const template = createTemplate();

      template.hasResourceProperties("AWS::EC2::LaunchTemplate", {
        LaunchTemplateData: Match.objectLike({
          InstanceType: "t4g.nano",
          MetadataOptions: Match.objectLike({ HttpTokens: "required" }),
        }),
      });
    });
  });

  describe("Discovery", () => {
    it("should publish the ASG name to the well-known SSM parameter", () => {
      const template = createTemplate();

      template.hasResourceProperties("AWS::SSM::Parameter", {
        Name: "/platform/ssm-relay/dev/asg-name",
      });
    });

    it("ssmRelayAsgParameterName should build stage-specific names", () => {
      expect(ssmRelayAsgParameterName("production")).toBe(
        "/platform/ssm-relay/production/asg-name"
      );
    });
  });

  describe("IAM", () => {
    it("should grant only SSM managed instance core", () => {
      const template = createTemplate();

      template.hasResourceProperties("AWS::IAM::Role", {
        ManagedPolicyArns: [
          Match.objectLike({
            "Fn::Join": Match.arrayWith([
              Match.arrayWith([
                Match.stringLikeRegexp("AmazonSSMManagedInstanceCore"),
              ]),
            ]),
          }),
        ],
      });
    });
  });
});
