/**
 * Tests for AgentOperationsUserStack.
 *
 * @module test/stacks/agent-operations/agent-operations-user-stack.test
 */
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { AgentOperationsUserStack } from "../../../lib/stacks/agent-operations/agent-operations-user-stack";
import type { AgentOperationsConfig } from "../../../lib/types";

describe("AgentOperationsUserStack", () => {
  const agentOperations: AgentOperationsConfig = {
    enabled: true,
    roleName: "RemoteAgent",
    policyName: "AgentOperationsPolicy",
    userName: "remote-agent",
    secretName: "remote-agent-credentials",
  };

  const roleArns = [
    "arn:aws:iam::111111111111:role/RemoteAgent",
    "arn:aws:iam::999999999999:role/RemoteAgent",
  ];

  const createTemplate = (): Template => {
    const app = new cdk.App();
    const stack = new AgentOperationsUserStack(app, "TestStack", {
      agentOperations,
      roleArns,
      env: { account: "999999999999", region: "us-east-1" },
    });
    return Template.fromStack(stack);
  };

  describe("User", () => {
    it("should create the dedicated user", () => {
      const template = createTemplate();

      template.hasResourceProperties("AWS::IAM::User", {
        UserName: "remote-agent",
      });
    });

    it("should only allow assuming the remote-agent roles", () => {
      const template = createTemplate();

      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: Match.objectLike({
          Statement: [
            Match.objectLike({
              Action: "sts:AssumeRole",
              Effect: "Allow",
              Resource: roleArns,
            }),
          ],
        }),
      });
    });
  });

  describe("Credentials", () => {
    it("should create an access key for the user", () => {
      const template = createTemplate();

      template.resourceCountIs("AWS::IAM::AccessKey", 1);
    });

    it("should store the access key in Secrets Manager", () => {
      const template = createTemplate();

      template.hasResourceProperties("AWS::SecretsManager::Secret", {
        Name: "remote-agent-credentials",
      });
    });
  });
});
