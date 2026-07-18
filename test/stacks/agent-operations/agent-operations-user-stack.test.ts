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
    repairPolicyName: "AgentOperationsRepairPolicy",
    repairEnvironmentNames: ["dev", "staging"],
    userName: "remote-agent",
    secretName: "remote-agent-credentials",
  };

  const roleArns = [
    "arn:aws:iam::111111111111:role/RemoteAgent",
    "arn:aws:iam::999999999999:role/RemoteAgent",
  ];

  const profiles = {
    dev: {
      roleArn: roleArns[0],
      region: "us-east-1",
    },
    shared: {
      roleArn: roleArns[1],
      region: "us-west-2",
    },
  };

  const createTemplate = (): Template => {
    const app = new cdk.App();
    const stack = new AgentOperationsUserStack(app, "TestStack", {
      agentOperations,
      roleArns,
      externalId: "test-external-id",
      profiles,
      env: { account: "999999999999", region: "us-east-1" },
    });
    return Template.fromStack(stack);
  };

  const parseBootstrapBundle = (template: Template) => {
    const secrets = template.findResources("AWS::SecretsManager::Secret");
    const secret = Object.values(secrets)[0] as {
      Properties?: {
        SecretString?: { "Fn::Join": [string, unknown[]] };
      };
    };
    const [delimiter, fragments] = secret.Properties!.SecretString!["Fn::Join"];
    const rendered = fragments
      .map(fragment =>
        typeof fragment === "string" ? fragment : "DYNAMIC_VALUE"
      )
      .join(delimiter);

    return JSON.parse(rendered) as Record<string, string>;
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
        Description: Match.stringLikeRegexp(".*LISA_AWS_BOOTSTRAP_JSON.*"),
      });
    });

    it("should store a complete vendor-neutral bootstrap bundle", () => {
      const template = createTemplate();
      const bundle = parseBootstrapBundle(template);

      expect(Object.keys(bundle).sort()).toEqual(
        [
          "accessKeyId",
          "secretAccessKey",
          "externalId",
          "roleName",
          "profiles",
        ].sort()
      );
      expect(bundle).toMatchObject({
        accessKeyId: "DYNAMIC_VALUE",
        secretAccessKey: "DYNAMIC_VALUE",
        externalId: "test-external-id",
        roleName: "RemoteAgent",
      });
      expect(JSON.parse(bundle.profiles)).toEqual(profiles);
    });
  });
});
