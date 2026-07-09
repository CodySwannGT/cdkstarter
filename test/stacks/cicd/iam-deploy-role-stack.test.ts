/**
 * Tests for IamDeployRoleStack.
 *
 * @module test/stacks/cicd/iam-deploy-role-stack.test
 */
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { IamDeployRoleStack } from "../../../lib/stacks/cicd/iam-deploy-role-stack";
import type { GitHubConfig } from "../../../lib/types";

describe("IamDeployRoleStack", () => {
  const github: GitHubConfig = {
    owner: "your-project-io",
    infrastructureRepo: "infrastructure",
    branch: "main",
    codeConnectionArn: "PLACEHOLDER",
    deployRoleName: "DeployServiceRole",
    deployRepoPattern: "*",
    migrationRunnerRepo: "backend",
  };

  const createTemplate = (): Template => {
    const app = new cdk.App();
    const stack = new IamDeployRoleStack(app, "TestStack", {
      stageName: "dev",
      github,
      env: { account: "111111111111", region: "us-east-1" },
    });
    return Template.fromStack(stack);
  };

  describe("OIDC Provider", () => {
    it("should create the GitHub Actions identity provider", () => {
      const template = createTemplate();

      template.hasResourceProperties("Custom::AWSCDKOpenIdConnectProvider", {
        Url: "https://token.actions.githubusercontent.com",
      });
    });
  });

  describe("Deploy Role", () => {
    it("should create the deploy role with the configured name", () => {
      const template = createTemplate();

      template.hasResourceProperties("AWS::IAM::Role", {
        RoleName: "DeployServiceRole",
        MaxSessionDuration: 7200,
      });
    });

    it("should restrict the role to the configured repo pattern", () => {
      const template = createTemplate();

      template.hasResourceProperties("AWS::IAM::Role", {
        RoleName: "DeployServiceRole",
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Condition: Match.objectLike({
                StringLike: Match.objectLike({
                  "token.actions.githubusercontent.com:sub":
                    "repo:your-project-io/*:*",
                }),
              }),
            }),
          ]),
        }),
      });
    });

    it("should include the CDK bootstrap asset bucket statement", () => {
      const template = createTemplate();

      template.hasResourceProperties("AWS::IAM::Role", {
        RoleName: "DeployServiceRole",
        Policies: [
          Match.objectLike({
            PolicyDocument: Match.objectLike({
              Statement: Match.arrayWith([
                Match.objectLike({
                  Action: "s3:*",
                  Resource: Match.arrayWith([
                    "arn:aws:s3:::cdk-*-assets-111111111111-us-east-1",
                  ]),
                }),
              ]),
            }),
          }),
        ],
      });
    });
  });

  describe("API Gateway Logs", () => {
    it("should create the API Gateway CloudWatch logs role", () => {
      const template = createTemplate();

      template.hasResourceProperties("AWS::IAM::Role", {
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Principal: { Service: "apigateway.amazonaws.com" },
            }),
          ]),
        }),
      });
    });
  });

  describe("Outputs", () => {
    it("should export the deploy role ARN", () => {
      const template = createTemplate();

      template.hasOutput("DeployRoleArn", {
        Export: { Name: "dev-deploy-service-role-arn" },
      });
    });
  });
});
