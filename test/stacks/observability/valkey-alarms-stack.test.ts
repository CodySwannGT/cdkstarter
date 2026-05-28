/**
 * Tests for ValkeyAlarmsStack.
 *
 * @module test/stacks/observability/valkey-alarms-stack.test
 */
import * as cdk from "aws-cdk-lib";
import * as sns from "aws-cdk-lib/aws-sns";
import { Template } from "aws-cdk-lib/assertions";
import { ValkeyAlarmsStack } from "../../../lib/stacks/observability/valkey-alarms-stack";

describe("ValkeyAlarmsStack", () => {
  const createStack = (stageName = "test"): Template => {
    const app = new cdk.App();

    const helperStack = new cdk.Stack(app, "HelperStack", {
      env: { account: "123456789012", region: "us-east-1" },
    });

    const criticalTopic = new sns.Topic(helperStack, "CriticalTopic", {
      topicName: "test-critical-alerts",
    });
    const warningTopic = new sns.Topic(helperStack, "WarningTopic", {
      topicName: "test-warning-alerts",
    });

    const alarmsStack = new ValkeyAlarmsStack(app, "AlarmsStack", {
      stageName,
      replicationGroupId: `${stageName}-valkey-replication-group`,
      thresholds: {
        cpuWarningPercent: 80,
        cpuCriticalPercent: 95,
        cacheHitRateWarningPercent: 80,
        cacheHitRateCriticalPercent: 50,
        evictionsWarning: 0,
        evictionsCritical: 1000,
      },
      warningTopic,
      criticalTopic,
      env: { account: "123456789012", region: "us-east-1" },
    });

    return Template.fromStack(alarmsStack);
  };

  describe("CPU Alarms", () => {
    it("should create CPU warning alarm", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        Threshold: 80,
        MetricName: "CPUUtilization",
        ComparisonOperator: "GreaterThanOrEqualToThreshold",
      });
    });

    it("should create CPU critical alarm", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        Threshold: 95,
        MetricName: "CPUUtilization",
        ComparisonOperator: "GreaterThanOrEqualToThreshold",
      });
    });

    it("should use CPUUtilization metric with ElastiCache namespace", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        MetricName: "CPUUtilization",
        Namespace: "AWS/ElastiCache",
      });
    });
  });

  describe("Cache Hit Rate Alarms", () => {
    it("should create cache hit rate warning alarm", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        Threshold: 80,
        MetricName: "CacheHitRate",
        ComparisonOperator: "LessThanOrEqualToThreshold",
      });
    });

    it("should create cache hit rate critical alarm", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        Threshold: 50,
        MetricName: "CacheHitRate",
        ComparisonOperator: "LessThanOrEqualToThreshold",
      });
    });

    it("should use CacheHitRate metric with ElastiCache namespace", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        MetricName: "CacheHitRate",
        Namespace: "AWS/ElastiCache",
      });
    });
  });

  describe("Evictions Alarms", () => {
    it("should create evictions warning alarm", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        Threshold: 0,
        MetricName: "Evictions",
        ComparisonOperator: "GreaterThanThreshold",
      });
    });

    it("should create evictions critical alarm", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        Threshold: 1000,
        MetricName: "Evictions",
        ComparisonOperator: "GreaterThanThreshold",
      });
    });

    it("should use Evictions metric with ElastiCache namespace", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        MetricName: "Evictions",
        Namespace: "AWS/ElastiCache",
      });
    });
  });

  describe("Alarm Configuration", () => {
    it("should use replication group ID in dimensions", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        MetricName: "CPUUtilization",
        Dimensions: [
          {
            Name: "ReplicationGroupId",
            Value: "test-valkey-replication-group",
          },
        ],
      });
    });

    it("should treat missing data as not breaching", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        MetricName: "CPUUtilization",
        TreatMissingData: "notBreaching",
      });
    });

    it("should have alarm actions configured on all alarms", () => {
      const template = createStack();

      const alarms = template.findResources("AWS::CloudWatch::Alarm");
      Object.values(alarms).forEach(alarm => {
        expect(alarm.Properties.AlarmActions).toBeDefined();
        expect(alarm.Properties.AlarmActions.length).toBeGreaterThan(0);
      });
    });

    it("should create six alarms total (warning and critical for each metric)", () => {
      const template = createStack();

      template.resourceCountIs("AWS::CloudWatch::Alarm", 6);
    });

    it("should not set explicit alarm names (uses CDK-generated names)", () => {
      const template = createStack();

      const alarms = template.findResources("AWS::CloudWatch::Alarm");
      Object.values(alarms).forEach(alarm => {
        expect(alarm.Properties.AlarmName).toBeUndefined();
      });
    });
  });

  describe("Stage-specific dimensions", () => {
    it("should use provided stage name in replication group ID dimension", () => {
      const template = createStack("staging");

      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        Dimensions: [
          {
            Name: "ReplicationGroupId",
            Value: "staging-valkey-replication-group",
          },
        ],
      });
    });
  });
});
