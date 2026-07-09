/**
 * Tests for MigrationRunnerStack.
 *
 * @module test/stacks/cicd/migration-runner-stack.test
 */
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { MigrationRunnerStack } from "../../../lib/stacks/cicd/migration-runner-stack";
import type { GitHubConfig } from "../../../lib/types";

describe("MigrationRunnerStack", () => {
  const github: GitHubConfig = {
    owner: "your-project-io",
    infrastructureRepo: "infrastructure",
    branch: "main",
    codeConnectionArn:
      "arn:aws:codestar-connections:us-east-1:999999999999:connection/test-connection",
    deployRoleName: "DeployServiceRole",
    deployRepoPattern: "*",
    migrationRunnerRepo: "backend",
  };

  const createStack = (
    githubOverride: GitHubConfig = github
  ): MigrationRunnerStack => {
    const app = new cdk.App();
    const networkStack = new cdk.Stack(app, "NetworkStack", {
      env: { account: "111111111111", region: "us-east-1" },
    });
    const vpc = new ec2.Vpc(networkStack, "Vpc", { maxAzs: 2 });
    const securityGroup = new ec2.SecurityGroup(networkStack, "RunnerSg", {
      vpc,
    });
    return new MigrationRunnerStack(app, "TestStack", {
      stageName: "dev",
      github: githubOverride,
      vpc,
      securityGroup,
      env: { account: "111111111111", region: "us-east-1" },
    });
  };

  describe("Validation", () => {
    it("should throw when the connection ARN is a placeholder", () => {
      expect(() =>
        createStack({ ...github, codeConnectionArn: "PLACEHOLDER" })
      ).toThrow(/CodeConnections connection ARN/);
    });
  });

  describe("Runner Project", () => {
    it("should create the project with the runs-on label name", () => {
      const template = Template.fromStack(createStack());

      template.hasResourceProperties("AWS::CodeBuild::Project", {
        Name: "migration-runner-dev",
      });
    });

    it("should trigger on WORKFLOW_JOB_QUEUED webhook events", () => {
      const template = Template.fromStack(createStack());

      template.hasResourceProperties("AWS::CodeBuild::Project", {
        Triggers: Match.objectLike({
          Webhook: true,
          FilterGroups: [
            [
              Match.objectLike({
                Type: "EVENT",
                Pattern: "WORKFLOW_JOB_QUEUED",
              }),
            ],
          ],
        }),
      });
    });

    it("should use MEDIUM compute so the runner agent is not starved", () => {
      const template = Template.fromStack(createStack());

      template.hasResourceProperties("AWS::CodeBuild::Project", {
        Environment: Match.objectLike({
          ComputeType: "BUILD_GENERAL1_MEDIUM",
        }),
      });
    });

    it("should run inside the VPC", () => {
      const template = Template.fromStack(createStack());

      template.hasResourceProperties("AWS::CodeBuild::Project", {
        VpcConfig: Match.objectLike({
          VpcId: Match.anyValue(),
        }),
      });
    });
  });

  describe("IAM", () => {
    it("should create the least-privileged runner role", () => {
      const template = Template.fromStack(createStack());

      template.hasResourceProperties("AWS::IAM::Role", {
        RoleName: "migration-runner-role-dev",
      });
    });

    it("should grant PassConnection on the shared connection", () => {
      const template = Template.fromStack(createStack());

      template.hasResourceProperties("AWS::IAM::Role", {
        Policies: [
          Match.objectLike({
            PolicyDocument: Match.objectLike({
              Statement: Match.arrayWith([
                Match.objectLike({
                  Action: Match.arrayWith(["codeconnections:PassConnection"]),
                  Resource: github.codeConnectionArn,
                }),
              ]),
            }),
          }),
        ],
      });
    });
  });
});
