/**
 * Tests for AuroraAlarmsStack.
 *
 * @module test/stacks/observability/aurora-alarms-stack.test
 */
import * as cdk from "aws-cdk-lib";
import * as sns from "aws-cdk-lib/aws-sns";
import { Template } from "aws-cdk-lib/assertions";
import { AuroraAlarmsStack } from "../../../lib/stacks/observability/aurora-alarms-stack";

describe("AuroraAlarmsStack", () => {
  const createStack = (stageName = "test"): Template => {
    const app = new cdk.App();

    // Create a helper stack to hold the imported topics
    const helperStack = new cdk.Stack(app, "HelperStack", {
      env: { account: "123456789012", region: "us-east-1" },
    });

    const criticalTopic = new sns.Topic(helperStack, "CriticalTopic", {
      topicName: "test-critical-alerts",
    });
    const warningTopic = new sns.Topic(helperStack, "WarningTopic", {
      topicName: "test-warning-alerts",
    });

    const alarmsStack = new AuroraAlarmsStack(app, "AlarmsStack", {
      stageName,
      clusterIdentifier: `${stageName}-aurora-cluster`,
      thresholds: {
        cpuCriticalPercent: 90,
        cpuWarningPercent: 70,
        storageCriticalGB: 10,
        storageWarningGB: 20,
        connectionsCritical: 180,
        connectionsWarning: 150,
        replicationLagMs: 1000,
      },
      criticalTopic,
      warningTopic,
      env: { account: "123456789012", region: "us-east-1" },
    });

    return Template.fromStack(alarmsStack);
  };

  describe("CPU Alarms", () => {
    it("should create CPU critical alarm", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        Threshold: 90,
        MetricName: "CPUUtilization",
        ComparisonOperator: "GreaterThanOrEqualToThreshold",
      });
    });

    it("should create CPU warning alarm", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        Threshold: 70,
        MetricName: "CPUUtilization",
        ComparisonOperator: "GreaterThanOrEqualToThreshold",
      });
    });

    it("should use CPUUtilization metric with RDS namespace", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        MetricName: "CPUUtilization",
        Namespace: "AWS/RDS",
      });
    });
  });

  describe("Serverless Capacity Alarms", () => {
    it("should create serverless capacity critical alarm", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        Threshold: 10,
        MetricName: "ServerlessDatabaseCapacity",
        ComparisonOperator: "LessThanOrEqualToThreshold",
      });
    });

    it("should create serverless capacity warning alarm", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        Threshold: 20,
        MetricName: "ServerlessDatabaseCapacity",
        ComparisonOperator: "LessThanOrEqualToThreshold",
      });
    });

    it("should use ServerlessDatabaseCapacity metric with RDS namespace", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        MetricName: "ServerlessDatabaseCapacity",
        Namespace: "AWS/RDS",
      });
    });
  });

  describe("Connection Alarms", () => {
    it("should create connections critical alarm", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        Threshold: 180,
        MetricName: "DatabaseConnections",
      });
    });

    it("should create connections warning alarm", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        Threshold: 150,
        MetricName: "DatabaseConnections",
      });
    });

    it("should use DatabaseConnections metric with RDS namespace", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        MetricName: "DatabaseConnections",
        Namespace: "AWS/RDS",
      });
    });
  });

  describe("Replication Alarm", () => {
    it("should create replication lag alarm", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        Threshold: 1000,
        MetricName: "AuroraReplicaLag",
      });
    });

    it("should use AuroraReplicaLag metric with RDS namespace", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        MetricName: "AuroraReplicaLag",
        Namespace: "AWS/RDS",
      });
    });
  });

  describe("Alarm Configuration", () => {
    it("should use cluster identifier in dimensions", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        MetricName: "CPUUtilization",
        Dimensions: [
          {
            Name: "DBClusterIdentifier",
            Value: "test-aurora-cluster",
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

    it("should have alarm actions configured", () => {
      const template = createStack();

      // All alarms should have an action configured
      const alarms = template.findResources("AWS::CloudWatch::Alarm");
      Object.values(alarms).forEach(alarm => {
        expect(alarm.Properties.AlarmActions).toBeDefined();
        expect(alarm.Properties.AlarmActions.length).toBeGreaterThan(0);
      });
    });

    it("should not set explicit alarm names (uses CDK-generated names)", () => {
      const template = createStack();

      // Verify alarms exist but don't have hardcoded AlarmName
      const alarms = template.findResources("AWS::CloudWatch::Alarm");
      expect(Object.keys(alarms).length).toBeGreaterThan(0);

      // AlarmName should not be set in the template (CDK generates it)
      Object.values(alarms).forEach(alarm => {
        expect(alarm.Properties.AlarmName).toBeUndefined();
      });
    });
  });

  describe("Cluster identifier dimension", () => {
    it("should use provided cluster identifier in dimensions", () => {
      const template = createStack("staging");

      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        Dimensions: [
          {
            Name: "DBClusterIdentifier",
            Value: "staging-aurora-cluster",
          },
        ],
      });
    });
  });
});
