/**
 * Tests for SnsStack.
 *
 * @module test/stacks/observability/sns-stack.test
 */
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { SnsStack } from "../../../lib/stacks/observability/sns-stack";

describe("SnsStack", () => {
  const defaultProps = {
    stageName: "test",
    criticalEmails: ["critical@example.com"],
    warningEmails: ["warning@example.com"],
    infoEmails: ["info@example.com"],
    env: { account: "123456789012", region: "us-east-1" },
  };

  const createStack = (props: Partial<typeof defaultProps> = {}): Template => {
    const app = new cdk.App();
    const stack = new SnsStack(app, "TestStack", {
      ...defaultProps,
      ...props,
    });
    return Template.fromStack(stack);
  };

  describe("Topics", () => {
    it("should create critical topic with display name", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::SNS::Topic", {
        DisplayName: "test critical alerts",
      });
    });

    it("should create warning topic with display name", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::SNS::Topic", {
        DisplayName: "test warning alerts",
      });
    });

    it("should create info topic with display name", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::SNS::Topic", {
        DisplayName: "test info alerts",
      });
    });

    it("should create three topics total", () => {
      const template = createStack();

      template.resourceCountIs("AWS::SNS::Topic", 3);
    });

    it("should not set explicit topic names (uses CDK-generated names)", () => {
      const template = createStack();

      const topics = template.findResources("AWS::SNS::Topic");
      Object.values(topics).forEach(topic => {
        // TopicName should not be set (CDK generates it)
        expect(topic.Properties.TopicName).toBeUndefined();
      });
    });
  });

  describe("Subscriptions", () => {
    it("should create email subscription for critical topic", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::SNS::Subscription", {
        Protocol: "email",
        Endpoint: "critical@example.com",
      });
    });

    it("should create email subscription for warning topic", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::SNS::Subscription", {
        Protocol: "email",
        Endpoint: "warning@example.com",
      });
    });

    it("should create email subscription for info topic", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::SNS::Subscription", {
        Protocol: "email",
        Endpoint: "info@example.com",
      });
    });

    it("should create multiple subscriptions for multiple emails", () => {
      const template = createStack({
        criticalEmails: ["admin1@example.com", "admin2@example.com"],
      });

      template.hasResourceProperties("AWS::SNS::Subscription", {
        Protocol: "email",
        Endpoint: "admin1@example.com",
      });

      template.hasResourceProperties("AWS::SNS::Subscription", {
        Protocol: "email",
        Endpoint: "admin2@example.com",
      });
    });

    it("should handle empty email arrays", () => {
      const template = createStack({
        criticalEmails: [],
        warningEmails: [],
        infoEmails: [],
      });

      // Should still create topics
      template.resourceCountIs("AWS::SNS::Topic", 3);
      // But no subscriptions
      template.resourceCountIs("AWS::SNS::Subscription", 0);
    });
  });

  describe("Outputs", () => {
    it("should export critical topic ARN", () => {
      const template = createStack();

      template.hasOutput("CriticalTopicArn", {
        Export: {
          Name: "test-sns-critical-topic-arn",
        },
      });
    });

    it("should export warning topic ARN", () => {
      const template = createStack();

      template.hasOutput("WarningTopicArn", {
        Export: {
          Name: "test-sns-warning-topic-arn",
        },
      });
    });

    it("should export info topic ARN", () => {
      const template = createStack();

      template.hasOutput("InfoTopicArn", {
        Export: {
          Name: "test-sns-info-topic-arn",
        },
      });
    });
  });

  describe("Stage naming", () => {
    it("should use stageName in display names", () => {
      const template = createStack({ stageName: "production" });

      template.hasResourceProperties("AWS::SNS::Topic", {
        DisplayName: "production critical alerts",
      });

      template.hasResourceProperties("AWS::SNS::Topic", {
        DisplayName: "production warning alerts",
      });

      template.hasResourceProperties("AWS::SNS::Topic", {
        DisplayName: "production info alerts",
      });
    });
  });
});
