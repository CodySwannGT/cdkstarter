/**
 * Tests for CostAnomalyStack.
 *
 * @module test/stacks/observability/cost-anomaly-stack.test
 */
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { CostAnomalyStack } from "../../../lib/stacks/observability/cost-anomaly-stack";

describe("CostAnomalyStack", () => {
  const createStack = (): Template => {
    const app = new cdk.App();
    const stack = new CostAnomalyStack(app, "TestCostAnomalyStack", {
      stageName: "test",
      thresholdUsd: 25,
      subscriberEmails: ["ops@example.com"],
      env: { account: "123456789012", region: "us-east-1" },
    });
    return Template.fromStack(stack);
  };

  it("should create a per-service anomaly monitor", () => {
    const template = createStack();

    template.hasResourceProperties("AWS::CE::AnomalyMonitor", {
      MonitorName: "test-service-costs",
      MonitorType: "DIMENSIONAL",
      MonitorDimension: "SERVICE",
    });
  });

  it("should subscribe the configured emails to a daily digest above the threshold", () => {
    const template = createStack();

    template.hasResourceProperties("AWS::CE::AnomalySubscription", {
      Frequency: "DAILY",
      Subscribers: [{ Type: "EMAIL", Address: "ops@example.com" }],
      ThresholdExpression: Match.stringLikeRegexp("25"),
    });
  });
});
