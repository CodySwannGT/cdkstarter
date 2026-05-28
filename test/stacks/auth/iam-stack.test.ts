/**
 * Tests for IamStack.
 *
 * @module test/stacks/auth/iam-stack.test
 */
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { IamStack } from "../../../lib/stacks/auth/iam-stack";

describe("IamStack", () => {
  const defaultProps = {
    stageName: "test",
    auroraClusterArn:
      "arn:aws:rds:us-east-1:123456789012:cluster:test-aurora-cluster",
    auroraSecretArn:
      "arn:aws:secretsmanager:us-east-1:123456789012:secret:test-aurora-secret",
    cognitoUserPoolArn:
      "arn:aws:cognito-idp:us-east-1:123456789012:userpool/us-east-1_test",
    env: { account: "123456789012", region: "us-east-1" },
  };

  const createStack = (props: Partial<typeof defaultProps> = {}): Template => {
    const app = new cdk.App();
    const stack = new IamStack(app, "TestStack", {
      ...defaultProps,
      ...props,
    });
    return Template.fromStack(stack);
  };

  describe("Lambda Execution Role", () => {
    it("should create Lambda execution role", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::IAM::Role", {
        AssumeRolePolicyDocument: {
          Statement: [
            {
              Action: "sts:AssumeRole",
              Effect: "Allow",
              Principal: {
                Service: "lambda.amazonaws.com",
              },
            },
          ],
        },
      });
    });

    it("should not set explicit role name (uses CDK-generated name)", () => {
      const template = createStack();

      const roles = template.findResources("AWS::IAM::Role");
      const lambdaRole = Object.values(roles).find(
        role =>
          role.Properties.Description ===
          "SOC2-compliant Lambda execution role with least-privilege access"
      );

      // RoleName should not be set (CDK generates it)
      expect(lambdaRole?.Properties.RoleName).toBeUndefined();
    });

    it("should have descriptive role description for SOC2 auditing", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::IAM::Role", {
        Description:
          "SOC2-compliant Lambda execution role with least-privilege access",
      });
    });
  });

  describe("Managed Policies", () => {
    it("should have basic Lambda execution policy", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::IAM::Role", {
        ManagedPolicyArns: Match.arrayWith([
          {
            "Fn::Join": Match.arrayWith([
              Match.arrayWith([
                Match.stringLikeRegexp("AWSLambdaBasicExecutionRole"),
              ]),
            ]),
          },
        ]),
      });
    });

    it("should have VPC access policy", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::IAM::Role", {
        ManagedPolicyArns: Match.arrayWith([
          {
            "Fn::Join": Match.arrayWith([
              Match.arrayWith([
                Match.stringLikeRegexp("AWSLambdaVPCAccessExecutionRole"),
              ]),
            ]),
          },
        ]),
      });
    });
  });

  describe("Aurora Policy", () => {
    it("should allow RDS IAM auth", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: "rds-db:connect",
              Effect: "Allow",
              Resource:
                "arn:aws:rds:us-east-1:123456789012:cluster:test-aurora-cluster/*",
            }),
          ]),
        },
      });
    });

    it("should allow Secrets Manager access for Aurora secret", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: "secretsmanager:GetSecretValue",
              Effect: "Allow",
              Resource:
                "arn:aws:secretsmanager:us-east-1:123456789012:secret:test-aurora-secret",
            }),
          ]),
        },
      });
    });

    it("should use specific Aurora cluster ARN (not wildcard)", () => {
      const template = createStack();

      const policies = template.findResources("AWS::IAM::Policy");
      const policyStatements = JSON.stringify(policies);

      expect(policyStatements).toContain("test-aurora-cluster");
      // RDS connect uses cluster ARN with wildcard suffix for db user
      // This is intentional - grants access to any db user on the specific cluster
      expect(policyStatements).toContain("cluster:test-aurora-cluster/*");
    });
  });

  describe("Cognito Policy", () => {
    it("should allow Cognito admin actions", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: [
                "cognito-idp:AdminGetUser",
                "cognito-idp:AdminUpdateUserAttributes",
                "cognito-idp:AdminCreateUser",
              ],
              Effect: "Allow",
              Resource:
                "arn:aws:cognito-idp:us-east-1:123456789012:userpool/us-east-1_test",
            }),
          ]),
        },
      });
    });

    it("should use specific Cognito user pool ARN", () => {
      const template = createStack();

      const policies = template.findResources("AWS::IAM::Policy");
      const policyStatements = JSON.stringify(policies);

      expect(policyStatements).toContain("userpool/us-east-1_test");
    });
  });

  describe("X-Ray Policy", () => {
    it("should allow X-Ray tracing", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: ["xray:PutTraceSegments", "xray:PutTelemetryRecords"],
              Effect: "Allow",
            }),
          ]),
        },
      });
    });

    it("should use wildcard for X-Ray (required by AWS)", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: ["xray:PutTraceSegments", "xray:PutTelemetryRecords"],
              Resource: "*",
            }),
          ]),
        },
      });
    });
  });

  describe("Outputs", () => {
    it("should export Lambda execution role ARN", () => {
      const template = createStack();

      template.hasOutput("LambdaExecutionRoleArn", {
        Export: {
          Name: "test-lambda-execution-role-arn",
        },
      });
    });

    it("should export Lambda execution role name", () => {
      const template = createStack();

      template.hasOutput("LambdaExecutionRoleName", {
        Export: {
          Name: "test-lambda-execution-role-name",
        },
      });
    });
  });
});
