/**
 * Tests for CanaryStack.
 *
 * @module test/stacks/observability/canary-stack.test
 */
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import * as sns from "aws-cdk-lib/aws-sns";
import { CanaryStack } from "../../../lib/stacks/observability/canary-stack";

describe("CanaryStack", () => {
  const createStack = (intervalMinutes?: number): Template => {
    const app = new cdk.App();
    const helperStack = new cdk.Stack(app, "HelperStack", {
      env: { account: "123456789012", region: "us-east-1" },
    });
    const criticalTopic = new sns.Topic(helperStack, "CriticalTopic");
    const stack = new CanaryStack(app, "TestCanaryStack", {
      stageName: "test",
      urls: ["https://staging.example.com", "https://staging.example.org"],
      intervalMinutes,
      criticalTopic,
      env: { account: "123456789012", region: "us-east-1" },
    });
    return Template.fromStack(stack);
  };

  describe("Canary function", () => {
    it("should receive the probe URLs via environment", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::Lambda::Function", {
        Environment: Match.objectLike({
          Variables: Match.objectLike({
            CANARY_URLS: JSON.stringify([
              "https://staging.example.com",
              "https://staging.example.org",
            ]),
          }),
        }),
      });
    });

    it("should run on the default 5-minute schedule", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::Events::Rule", {
        ScheduleExpression: "rate(5 minutes)",
      });
    });

    it("should honor a configured interval", () => {
      const template = createStack(10);

      template.hasResourceProperties("AWS::Events::Rule", {
        ScheduleExpression: "rate(10 minutes)",
      });
    });
  });

  describe("Failure alarm", () => {
    it("should alarm on any canary error and treat missing data as breaching", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        AlarmName: "test-canary-endpoint-down",
        MetricName: "Errors",
        Namespace: "AWS/Lambda",
        Threshold: 1,
        EvaluationPeriods: 1,
        ComparisonOperator: "GreaterThanOrEqualToThreshold",
        TreatMissingData: "breaching",
      });
    });

    it("should notify the critical topic on alarm and recovery", () => {
      const template = createStack();

      const alarms = template.findResources("AWS::CloudWatch::Alarm");
      Object.values(alarms).forEach(alarm => {
        expect(alarm.Properties.AlarmActions).toBeDefined();
        expect(alarm.Properties.OKActions).toBeDefined();
      });
    });
  });
});
