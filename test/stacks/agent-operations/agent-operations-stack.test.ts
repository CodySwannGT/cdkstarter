/**
 * Tests for AgentOperationsStack.
 *
 * @module test/stacks/agent-operations/agent-operations-stack.test
 */
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { AgentOperationsStack } from "../../../lib/stacks/agent-operations/agent-operations-stack";
import type { AgentOperationsConfig } from "../../../lib/types";

describe("AgentOperationsStack", () => {
  const agentOperations: AgentOperationsConfig = {
    enabled: true,
    roleName: "RemoteAgent",
    policyName: "AgentOperationsPolicy",
    userName: "remote-agent",
    secretName: "remote-agent-credentials",
  };

  const createTemplate = (): Template => {
    const app = new cdk.App();
    const stack = new AgentOperationsStack(app, "TestStack", {
      agentOperations,
      trustedUserArn: "arn:aws:iam::999999999999:user/remote-agent",
      externalId: "test-external-id",
      env: { account: "111111111111", region: "us-east-1" },
    });
    return Template.fromStack(stack);
  };

  describe("Role", () => {
    it("should create the remote-agent role with the stable name", () => {
      const template = createTemplate();

      template.hasResourceProperties("AWS::IAM::Role", {
        RoleName: "RemoteAgent",
      });
    });

    it("should trust only the dedicated user with an ExternalId condition", () => {
      const template = createTemplate();

      template.hasResourceProperties("AWS::IAM::Role", {
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: [
            Match.objectLike({
              Action: "sts:AssumeRole",
              Effect: "Allow",
              Principal: {
                AWS: "arn:aws:iam::999999999999:user/remote-agent",
              },
              Condition: {
                StringEquals: { "sts:ExternalId": "test-external-id" },
              },
            }),
          ],
        }),
      });
    });
  });

  describe("Policy", () => {
    it("should create the managed policy with the configured name", () => {
      const template = createTemplate();

      template.hasResourceProperties("AWS::IAM::ManagedPolicy", {
        ManagedPolicyName: "AgentOperationsPolicy",
      });
    });

    it("should keep the Bedrock Anthropic invoke statement from the policy document", () => {
      const template = createTemplate();

      template.hasResourceProperties("AWS::IAM::ManagedPolicy", {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Sid: "BedrockInvokeAnthropic",
              Action: [
                "bedrock:InvokeModel",
                "bedrock:InvokeModelWithResponseStream",
              ],
            }),
          ]),
        }),
      });
    });

    it("should keep operational permissions from the policy document", () => {
      const template = createTemplate();

      template.hasResourceProperties("AWS::IAM::ManagedPolicy", {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith([
                "ssm:StartSession",
                "rds-db:connect",
                "logs:FilterLogEvents",
              ]),
            }),
          ]),
        }),
      });
    });
  });

  describe("Outputs", () => {
    it("should output the role ARN", () => {
      const template = createTemplate();

      template.hasOutput("RemoteAgentRoleArn", {});
    });
  });
});
