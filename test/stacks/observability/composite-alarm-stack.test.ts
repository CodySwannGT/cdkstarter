/**
 * Tests for CompositeAlarmStack.
 *
 * @module test/stacks/observability/composite-alarm-stack.test
 */
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as sns from "aws-cdk-lib/aws-sns";
import { CompositeAlarmStack } from "../../../lib/stacks/observability/composite-alarm-stack";

describe("CompositeAlarmStack", () => {
  const createStack = (): Template => {
    const app = new cdk.App();
    const helperStack = new cdk.Stack(app, "HelperStack", {
      env: { account: "123456789012", region: "us-east-1" },
    });
    const criticalTopic = new sns.Topic(helperStack, "CriticalTopic");
    const alarms = [
      new cloudwatch.Alarm(helperStack, "AlarmA", {
        metric: new cloudwatch.Metric({
          namespace: "Test",
          metricName: "MetricA",
        }),
        threshold: 1,
        evaluationPeriods: 1,
      }),
      new cloudwatch.Alarm(helperStack, "AlarmB", {
        metric: new cloudwatch.Metric({
          namespace: "Test",
          metricName: "MetricB",
        }),
        threshold: 1,
        evaluationPeriods: 1,
      }),
    ];
    const stack = new CompositeAlarmStack(app, "TestCompositeStack", {
      stageName: "test",
      alarms,
      criticalTopic,
      env: { account: "123456789012", region: "us-east-1" },
    });
    return Template.fromStack(stack);
  };

  it("should roll the child alarms into one OR composite", () => {
    const template = createStack();

    template.resourceCountIs("AWS::CloudWatch::CompositeAlarm", 1);
    template.hasResourceProperties("AWS::CloudWatch::CompositeAlarm", {
      AlarmName: "test-environment-unhealthy",
      AlarmRule: Match.objectLike({
        "Fn::Join": Match.arrayWith([
          Match.arrayWith([Match.stringLikeRegexp("OR")]),
        ]),
      }),
    });
  });

  it("should notify the critical topic", () => {
    const template = createStack();

    const composites = template.findResources(
      "AWS::CloudWatch::CompositeAlarm"
    );
    Object.values(composites).forEach(composite => {
      expect(composite.Properties.AlarmActions).toBeDefined();
    });
  });
});
