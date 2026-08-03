/**
 * Tests for AgentOperationsStack.
 *
 * @module test/stacks/agent-operations/agent-operations-stack.test
 */
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import observerPolicy from "../../../lib/stacks/agent-operations/agent-operations-policy.json";
import repairPolicy from "../../../lib/stacks/agent-operations/agent-operations-repair-policy.json";
import { AgentOperationsStack } from "../../../lib/stacks/agent-operations/agent-operations-stack";
import type { AgentOperationsConfig } from "../../../lib/types";

describe("AgentOperationsStack", () => {
  const agentOperations: AgentOperationsConfig = {
    enabled: true,
    roleName: "RemoteAgent",
    policyName: "AgentOperationsPolicy",
    repairPolicyName: "AgentOperationsRepairPolicy",
    repairEnvironmentNames: ["dev", "staging"],
    userName: "remote-agent",
    secretName: "remote-agent-credentials",
    externalIdSecretName: "agent-operations-external-id",
    profilePrefix: "agent-",
  };

  const createTemplate = (repairEnabled = false): Template => {
    const app = new cdk.App();
    const stack = new AgentOperationsStack(app, "TestStack", {
      agentOperations,
      trustedUserArn: "arn:aws:iam::999999999999:user/remote-agent",
      externalId: "test-external-id",
      repairEnabled,
      env: { account: "111111111111", region: "us-east-1" },
    });
    return Template.fromStack(stack);
  };

  const attachedManagedPolicyNames = (template: Template): string[] => {
    const policies = template.findResources("AWS::IAM::ManagedPolicy");
    const policyNamesByLogicalId = new Map(
      Object.entries(policies).map(([logicalId, resource]) => [
        logicalId,
        resource.Properties?.ManagedPolicyName as string,
      ])
    );
    const role = Object.values(template.findResources("AWS::IAM::Role"))[0] as {
      Properties?: { ManagedPolicyArns?: Array<{ Ref: string }> };
    };

    return (role.Properties?.ManagedPolicyArns ?? []).map(reference => {
      const policyName = policyNamesByLogicalId.get(reference.Ref);
      expect(policyName).toBeDefined();
      return policyName!;
    });
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

    it("should deny iam:PassRole on every standing agent role", () => {
      const template = createTemplate();

      template.hasResourceProperties("AWS::IAM::ManagedPolicy", {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Sid: "DenyPassRole",
              Effect: "Deny",
              Action: "iam:PassRole",
            }),
          ]),
        }),
      });
    });

    it("should scope standing AppSync access to Query fields", () => {
      const template = createTemplate();

      template.hasResourceProperties("AWS::IAM::ManagedPolicy", {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Sid: "AppSyncQueryAccess",
              Action: "appsync:GraphQL",
              Resource: "arn:aws:appsync:*:*:apis/*/types/Query/fields/*",
            }),
          ]),
        }),
      });
    });

    it("should create only the observer policy when repair is disabled", () => {
      const template = createTemplate();

      template.resourceCountIs("AWS::IAM::ManagedPolicy", 1);
      template.hasResourceProperties("AWS::IAM::ManagedPolicy", {
        ManagedPolicyName: "AgentOperationsPolicy",
      });
      expect(attachedManagedPolicyNames(template)).toEqual([
        "AgentOperationsPolicy",
      ]);
    });

    it("should exclude every direct repair action from observer allows", () => {
      const observerAllows = observerPolicy.Statement.filter(
        statement => statement.Effect === "Allow"
      ).flatMap(statement =>
        Array.isArray(statement.Action) ? statement.Action : [statement.Action]
      );
      const repairAllows = repairPolicy.Statement.filter(
        statement => statement.Effect === "Allow"
      ).flatMap(statement =>
        Array.isArray(statement.Action) ? statement.Action : [statement.Action]
      );
      const repairOnlyActions = repairAllows.filter(
        action => action !== "appsync:GraphQL"
      );

      expect(
        observerAllows.filter(action => repairOnlyActions.includes(action))
      ).toEqual([]);
      expect(observerAllows).not.toContain("iam:PassRole");
      expect(repairAllows).not.toContain("iam:PassRole");
    });

    it("should attach the separate repair policy when repair is enabled", () => {
      const template = createTemplate(true);

      template.resourceCountIs("AWS::IAM::ManagedPolicy", 2);
      template.hasResourceProperties("AWS::IAM::ManagedPolicy", {
        ManagedPolicyName: "AgentOperationsRepairPolicy",
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Sid: "RepairOperations",
              Action: Match.arrayWith([
                "ssm:StartSession",
                "cloudformation:UpdateStack",
                "lambda:UpdateFunctionCode",
              ]),
            }),
            Match.objectLike({
              Sid: "BedrockInvokeAnthropic",
            }),
          ]),
        }),
      });
      expect(attachedManagedPolicyNames(template)).toEqual([
        "AgentOperationsPolicy",
        "AgentOperationsRepairPolicy",
      ]);
    });
  });

  describe("Outputs", () => {
    it("should output the role ARN", () => {
      const template = createTemplate();

      template.hasOutput("RemoteAgentRoleArn", {});
    });
  });
});
