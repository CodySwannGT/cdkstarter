/**
 * Tests for IamStack.
 *
 * @module test/stacks/auth/iam-stack.test
 */
import { rmSync } from "node:fs";
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { IamStack } from "../../../lib/stacks/auth/iam-stack";

describe("IamStack", () => {
  const outdirs: string[] = [];
  afterEach(() => {
    outdirs
      .splice(0)
      .forEach(outdir => rmSync(outdir, { recursive: true, force: true }));
  });
  const defaultProps = {
    stageName: "test",
    databaseProxyArn:
      "arn:aws:rds:us-east-1:123456789012:db-proxy:prx-testproxy",
    applicationUsername: "application",
    applicationSecretArn:
      "arn:aws:secretsmanager:us-east-1:123456789012:secret:test-application-secret-AbCdEf",
    cognitoUserPoolArn:
      "arn:aws:cognito-idp:us-east-1:123456789012:userpool/us-east-1_test",
    env: { account: "123456789012", region: "us-east-1" },
  };

  const createStack = (props: Partial<typeof defaultProps> = {}): Template => {
    const app = new cdk.App();
    outdirs.push(app.outdir);
    const imports = new cdk.Stack(app, "Imports", { env: defaultProps.env });
    const stack = new IamStack(app, "TestStack", {
      ...defaultProps,
      ...props,
      databaseProxy: rds.DatabaseProxy.fromDatabaseProxyAttributes(
        imports,
        "Proxy",
        {
          dbProxyArn: defaultProps.databaseProxyArn,
          dbProxyName: "testproxy",
          endpoint: "fixture.example.test",
          securityGroups: [],
        }
      ),
      applicationSecret: secretsmanager.Secret.fromSecretCompleteArn(
        imports,
        "Credentials",
        defaultProps.applicationSecretArn
      ),
    });
    return Template.fromStack(stack);
  };

  it.each([
    "",
    "*",
    "clusteradmin",
    "pg_operator",
    "rds_operator",
    "A_user",
    "a".repeat(64),
  ])(
    "rejects unsupported runtime usernames before IAM grants: %s",
    applicationUsername => {
      expect(() => createStack({ applicationUsername })).toThrow(
        /Runtime IAM requires a specific non-administrative database username/
      );
    }
  );

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
              Resource: {
                "Fn::Join": [
                  "",
                  [
                    "arn:",
                    { Ref: "AWS::Partition" },
                    ":rds-db:us-east-1:123456789012:dbuser:prx-testproxy/application",
                  ],
                ],
              },
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
              Action: Match.arrayWith(["secretsmanager:GetSecretValue"]),
              Effect: "Allow",
              Resource:
                "arn:aws:secretsmanager:us-east-1:123456789012:secret:test-application-secret-AbCdEf",
            }),
          ]),
        },
      });
    });

    it("should use a specific proxy resource-ID and database user", () => {
      const template = createStack();

      const policies = template.findResources("AWS::IAM::Policy");
      const policyStatements = JSON.stringify(policies);

      expect(policyStatements).toContain("prx-testproxy/application");
      // Only the configured application dbuser on the real proxy is authorized.
      expect(policyStatements).toContain("dbuser:prx-testproxy/application");
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
