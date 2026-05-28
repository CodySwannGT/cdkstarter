/**
 * Tests for CognitoStack.
 *
 * @module test/stacks/auth/cognito-stack.test
 */
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { CognitoStack } from "../../../lib/stacks/auth/cognito-stack";

describe("CognitoStack", () => {
  const createStack = (stageName = "test"): Template => {
    const app = new cdk.App();
    const stack = new CognitoStack(app, "TestStack", {
      stageName,
      env: { account: "123456789012", region: "us-east-1" },
    });
    return Template.fromStack(stack);
  };

  describe("User Pool", () => {
    it("should create user pool", () => {
      const template = createStack();

      template.resourceCountIs("AWS::Cognito::UserPool", 1);
    });

    it("should not set explicit user pool name (uses CDK-generated name)", () => {
      const template = createStack();

      const userPools = template.findResources("AWS::Cognito::UserPool");
      const [userPoolKey] = Object.keys(userPools);
      const userPool = userPools[userPoolKey];

      // UserPoolName should not be set (CDK generates it)
      expect(userPool.Properties.UserPoolName).toBeUndefined();
    });

    it("should enable email sign-in", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::Cognito::UserPool", {
        UsernameAttributes: ["email"],
      });
    });

    it("should auto-verify email", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::Cognito::UserPool", {
        AutoVerifiedAttributes: ["email"],
      });
    });

    it("should have correct password policy", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::Cognito::UserPool", {
        Policies: {
          PasswordPolicy: {
            MinimumLength: 8,
            RequireLowercase: true,
            RequireUppercase: true,
            RequireNumbers: true,
            RequireSymbols: true,
          },
        },
      });
    });

    it("should configure optional MFA with TOTP", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::Cognito::UserPool", {
        MfaConfiguration: "OPTIONAL",
        EnabledMfas: ["SOFTWARE_TOKEN_MFA"],
      });
    });

    it("should configure email-only account recovery", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::Cognito::UserPool", {
        AccountRecoverySetting: {
          RecoveryMechanisms: [
            {
              Name: "verified_email",
              Priority: 1,
            },
          ],
        },
      });
    });

    it("should not configure Lambda triggers", () => {
      const template = createStack();

      const userPools = template.findResources("AWS::Cognito::UserPool");
      const [userPoolKey] = Object.keys(userPools);
      const userPool = userPools[userPoolKey];

      expect(userPool.Properties.LambdaConfig).toBeUndefined();
    });

    it("should retain user pool in production", () => {
      const template = createStack("production");

      template.hasResource("AWS::Cognito::UserPool", {
        DeletionPolicy: "Retain",
        UpdateReplacePolicy: "Retain",
      });
    });

    it("should destroy user pool in non-production", () => {
      const template = createStack("dev");

      template.hasResource("AWS::Cognito::UserPool", {
        DeletionPolicy: "Delete",
      });
    });
  });

  describe("App Client", () => {
    it("should create app client", () => {
      const template = createStack();

      template.resourceCountIs("AWS::Cognito::UserPoolClient", 1);
    });

    it("should not set explicit client name (uses CDK-generated name)", () => {
      const template = createStack();

      const clients = template.findResources("AWS::Cognito::UserPoolClient");
      const [clientKey] = Object.keys(clients);
      const client = clients[clientKey];

      // ClientName should not be set (CDK generates it)
      expect(client.Properties.ClientName).toBeUndefined();
    });

    it("should enable SRP and password auth flows", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
        ExplicitAuthFlows: [
          "ALLOW_USER_PASSWORD_AUTH",
          "ALLOW_USER_SRP_AUTH",
          "ALLOW_REFRESH_TOKEN_AUTH",
        ],
      });
    });

    it("should not generate client secret", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
        GenerateSecret: false,
      });
    });

    it("should configure token validity", () => {
      const template = createStack();

      // CDK converts durations to minutes internally
      template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
        AccessTokenValidity: 60, // 1 hour in minutes
        IdTokenValidity: 60, // 1 hour in minutes
        RefreshTokenValidity: 43200, // 30 days in minutes
        TokenValidityUnits: {
          AccessToken: "minutes",
          IdToken: "minutes",
          RefreshToken: "minutes",
        },
      });
    });
  });

  describe("Outputs", () => {
    it("should export user pool ID", () => {
      const template = createStack();

      template.hasOutput("UserPoolId", {
        Export: {
          Name: "test-cognito-user-pool-id",
        },
      });
    });

    it("should export user pool ARN", () => {
      const template = createStack();

      template.hasOutput("UserPoolArn", {
        Export: {
          Name: "test-cognito-user-pool-arn",
        },
      });
    });

    it("should export app client ID", () => {
      const template = createStack();

      template.hasOutput("AppClientId", {
        Export: {
          Name: "test-cognito-app-client-id",
        },
      });
    });

    it("should use stageName in output export names", () => {
      const template = createStack("staging");

      template.hasOutput("UserPoolId", {
        Export: {
          Name: "staging-cognito-user-pool-id",
        },
      });
    });
  });
});
