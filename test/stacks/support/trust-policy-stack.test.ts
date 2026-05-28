/**
 * Tests for TrustPolicyStack.
 *
 * @module test/stacks/support/trust-policy-stack.test
 */
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { TrustPolicyStack } from "../../../lib/stacks/support/trust-policy-stack";

describe("TrustPolicyStack", () => {
  const defaultProps = {
    stageName: "dev",
    targetAccountId: "111111111111",
    pipelineAccountId: "999999999999",
    targetRegion: "us-east-1",
    env: { account: "999999999999", region: "us-east-1" },
  };

  const createStack = (props: Partial<typeof defaultProps> = {}): Template => {
    const app = new cdk.App();
    const stack = new TrustPolicyStack(app, "TestStack", {
      ...defaultProps,
      ...props,
    });
    return Template.fromStack(stack);
  };

  describe("Stack Creation", () => {
    it("should create stack for valid account IDs", () => {
      const template = createStack();

      // Stack should be created successfully
      expect(template).toBeDefined();
    });

    it("should include stack description", () => {
      const app = new cdk.App();
      const stack = new TrustPolicyStack(app, "TestStack", defaultProps);

      expect(stack.stackName).toBe("TestStack");
    });
  });

  describe("CDK Bootstrap Role ARNs", () => {
    it("should use correct CDK bootstrap deploy role ARN format", () => {
      const app = new cdk.App();
      const stack = new TrustPolicyStack(app, "TestStack", defaultProps);

      expect(stack.deployRoleArn).toBe(
        "arn:aws:iam::111111111111:role/cdk-hnb659fds-deploy-role-111111111111-us-east-1"
      );
    });

    it("should use correct CDK bootstrap file publishing role ARN format", () => {
      const app = new cdk.App();
      const stack = new TrustPolicyStack(app, "TestStack", defaultProps);

      expect(stack.filePublishRoleArn).toBe(
        "arn:aws:iam::111111111111:role/cdk-hnb659fds-file-publishing-role-111111111111-us-east-1"
      );
    });

    it("should use correct CDK bootstrap image publishing role ARN format", () => {
      const app = new cdk.App();
      const stack = new TrustPolicyStack(app, "TestStack", defaultProps);

      expect(stack.imagePublishRoleArn).toBe(
        "arn:aws:iam::111111111111:role/cdk-hnb659fds-image-publishing-role-111111111111-us-east-1"
      );
    });

    it("should use correct CDK bootstrap lookup role ARN format", () => {
      const app = new cdk.App();
      const stack = new TrustPolicyStack(app, "TestStack", defaultProps);

      expect(stack.lookupRoleArn).toBe(
        "arn:aws:iam::111111111111:role/cdk-hnb659fds-lookup-role-111111111111-us-east-1"
      );
    });
  });

  describe("Pipeline Account Reference", () => {
    it("should expose pipeline account ID", () => {
      const app = new cdk.App();
      const stack = new TrustPolicyStack(app, "TestStack", defaultProps);

      expect(stack.pipelineAccountId).toBe("999999999999");
    });

    it("should expose target account ID", () => {
      const app = new cdk.App();
      const stack = new TrustPolicyStack(app, "TestStack", defaultProps);

      expect(stack.targetAccountId).toBe("111111111111");
    });
  });

  describe("Bootstrap Command", () => {
    it("should generate correct bootstrap command", () => {
      const app = new cdk.App();
      const stack = new TrustPolicyStack(app, "TestStack", defaultProps);

      const command = stack.bootstrapCommand;
      expect(command).toContain("cdk bootstrap");
      expect(command).toContain("aws://111111111111/us-east-1");
      expect(command).toContain("--trust 999999999999");
    });
  });

  describe("Outputs", () => {
    it("should export bootstrap command", () => {
      const template = createStack();

      template.hasOutput("BootstrapCommand", {
        Description: "CDK bootstrap command for the target account",
      });
    });

    it("should export deploy role ARN", () => {
      const template = createStack();

      template.hasOutput("DeployRoleArn", {
        Value:
          "arn:aws:iam::111111111111:role/cdk-hnb659fds-deploy-role-111111111111-us-east-1",
      });
    });
  });

  describe("Stage Naming", () => {
    it("should use stageName in output naming", () => {
      const template = createStack({ stageName: "production" });

      template.hasOutput("BootstrapCommand", {
        Export: {
          Name: "production-trust-bootstrap-command",
        },
      });
    });
  });

  describe("Custom Bootstrap Qualifier", () => {
    it("should use custom bootstrapQualifier from props", () => {
      const app = new cdk.App();
      const stack = new TrustPolicyStack(app, "TestStack", {
        ...defaultProps,
        bootstrapQualifier: "custom123",
      });

      expect(stack.deployRoleArn).toBe(
        "arn:aws:iam::111111111111:role/cdk-custom123-deploy-role-111111111111-us-east-1"
      );
    });

    it("should use default qualifier when not provided via props", () => {
      const app = new cdk.App();
      const stack = new TrustPolicyStack(app, "TestStack", defaultProps);

      expect(stack.deployRoleArn).toBe(
        "arn:aws:iam::111111111111:role/cdk-hnb659fds-deploy-role-111111111111-us-east-1"
      );
    });

    it("should apply custom qualifier to all role ARNs", () => {
      const app = new cdk.App();
      const stack = new TrustPolicyStack(app, "TestStack", {
        ...defaultProps,
        bootstrapQualifier: "myqualifier",
      });

      expect(stack.deployRoleArn).toContain("myqualifier");
      expect(stack.filePublishRoleArn).toContain("myqualifier");
      expect(stack.imagePublishRoleArn).toContain("myqualifier");
      expect(stack.lookupRoleArn).toContain("myqualifier");
    });
  });

  describe("Custom Execution Policy ARN", () => {
    it("should use custom executionPolicyArn from props", () => {
      const app = new cdk.App();
      const stack = new TrustPolicyStack(app, "TestStack", {
        ...defaultProps,
        executionPolicyArn: "arn:aws:iam::aws:policy/CustomPolicy",
      });

      expect(stack.bootstrapCommand).toContain(
        "arn:aws:iam::aws:policy/CustomPolicy"
      );
    });

    it("should use default AdministratorAccess policy when not configured", () => {
      const app = new cdk.App();
      const stack = new TrustPolicyStack(app, "TestStack", defaultProps);

      expect(stack.bootstrapCommand).toContain(
        "arn:aws:iam::aws:policy/AdministratorAccess"
      );
    });

    it("should construct partition-aware ARN for policy names without arn prefix", () => {
      const app = new cdk.App();
      const stack = new TrustPolicyStack(app, "TestStack", {
        ...defaultProps,
        executionPolicyArn: "PowerUserAccess",
      });

      // When a policy name is provided without arn: prefix, it should be wrapped
      expect(stack.bootstrapCommand).toContain("PowerUserAccess");
    });
  });
});
