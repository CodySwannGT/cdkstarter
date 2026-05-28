/**
 * Aurora Alarms Stack - CloudWatch Alarms for Aurora Serverless v2
 *
 * This stack creates CloudWatch alarms for monitoring Aurora database health
 * and performance. Alarms are configured with thresholds from observability
 * config and route to SNS topics based on severity.
 *
 * ## Alarm Categories
 *
 * ### Critical (Immediate Action)
 * - CPU Utilization > 90%
 * - Storage Space < 10%
 * - Connection count > 90% of max
 *
 * ### Warning (Investigation Required)
 * - CPU Utilization > 70%
 * - Storage Space < 20%
 * - Replication lag > threshold
 *
 * ## Cross-Stack References
 *
 * This stack imports:
 * - Aurora cluster identifier from AuroraStack
 * - SNS topic ARNs from SnsStack
 * @see lib/stacks/database/aurora-stack.ts - Monitored resource
 * @see lib/stacks/observability/sns-stack.ts - Notification targets
 * @module lib/stacks/observability/aurora-alarms-stack
 */
import * as cdk from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import type { Construct } from "constructs";

/**
 * Props interface thresholds - maps config file format to stack expectations.
 * This interface uses simplified naming for the stack implementation.
 */
export interface AuroraAlarmsThresholds {
  /** CPU utilization percentage to trigger critical alarm. */
  readonly cpuCriticalPercent: number;
  /** CPU utilization percentage to trigger warning alarm. */
  readonly cpuWarningPercent: number;
  /** Free storage in GB below which critical alarm triggers. */
  readonly storageCriticalGB: number;
  /** Free storage in GB below which warning alarm triggers. */
  readonly storageWarningGB: number;
  /** Connection count to trigger critical alarm. */
  readonly connectionsCritical: number;
  /** Connection count to trigger warning alarm. */
  readonly connectionsWarning: number;
  /** Replication lag in ms to trigger alarm. */
  readonly replicationLagMs: number;
}

/**
 * Configuration properties for AuroraAlarmsStack.
 */
export interface AuroraAlarmsStackProps extends cdk.StackProps {
  /**
   * Stage name (unused, kept for interface consistency).
   * Examples: "dev", "staging", "production"
   */
  readonly stageName: string;

  /**
   * Aurora cluster identifier for metric dimensions.
   */
  readonly clusterIdentifier: string;

  /**
   * Alarm thresholds for Aurora monitoring.
   */
  readonly thresholds: AuroraAlarmsThresholds;

  /**
   * SNS topic for critical alarms.
   */
  readonly criticalTopic: sns.ITopic;

  /**
   * SNS topic for warning alarms.
   */
  readonly warningTopic: sns.ITopic;
}

/**
 * Aurora Alarms Stack creating CloudWatch alarms for database monitoring.
 *
 * Creates alarms for CPU, storage, connections, and replication lag
 * with configurable thresholds and SNS notifications.
 */
export class AuroraAlarmsStack extends cdk.Stack {
  /**
   * All created alarms for dashboard reference.
   */
  public readonly alarms: cloudwatch.Alarm[] = [];

  /**
   * Creates a new AuroraAlarmsStack.
   * @param scope - Parent construct
   * @param id - Stack identifier
   * @param props - Stack configuration
   */
  constructor(scope: Construct, id: string, props: AuroraAlarmsStackProps) {
    super(scope, id, props);

    const {
      stageName,
      clusterIdentifier,
      thresholds,
      criticalTopic,
      warningTopic,
    } = props;

    this.createCpuAlarms(
      stageName,
      clusterIdentifier,
      thresholds,
      criticalTopic,
      warningTopic
    );
    this.createStorageAlarms(
      stageName,
      clusterIdentifier,
      thresholds,
      criticalTopic,
      warningTopic
    );
    this.createConnectionAlarms(
      stageName,
      clusterIdentifier,
      thresholds,
      criticalTopic,
      warningTopic
    );
    this.createReplicationAlarm(
      stageName,
      clusterIdentifier,
      thresholds,
      warningTopic
    );
  }

  /**
   * Creates CPU utilization alarms.
   * @param _stageName - Stage name (unused, kept for interface consistency)
   * @param clusterIdentifier - Aurora cluster identifier for metric dimensions
   * @param thresholds - Alarm threshold configuration
   * @param criticalTopic - SNS topic for critical alerts
   * @param warningTopic - SNS topic for warning alerts
   */
  private createCpuAlarms(
    _stageName: string,
    clusterIdentifier: string,
    thresholds: AuroraAlarmsThresholds,
    criticalTopic: sns.ITopic,
    warningTopic: sns.ITopic
  ): void {
    const cpuMetric = new cloudwatch.Metric({
      namespace: "AWS/RDS",
      metricName: "CPUUtilization",
      dimensionsMap: {
        DBClusterIdentifier: clusterIdentifier,
      },
      statistic: "Average",
      period: cdk.Duration.minutes(5),
    });

    const cpuCriticalAlarm = new cloudwatch.Alarm(this, "CpuCriticalAlarm", {
      alarmDescription: `Aurora CPU utilization exceeds ${thresholds.cpuCriticalPercent}%`,
      metric: cpuMetric,
      threshold: thresholds.cpuCriticalPercent,
      evaluationPeriods: 3,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    cpuCriticalAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(criticalTopic)
    );
    this.alarms.push(cpuCriticalAlarm);

    const cpuWarningAlarm = new cloudwatch.Alarm(this, "CpuWarningAlarm", {
      alarmDescription: `Aurora CPU utilization exceeds ${thresholds.cpuWarningPercent}%`,
      metric: cpuMetric,
      threshold: thresholds.cpuWarningPercent,
      evaluationPeriods: 3,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    cpuWarningAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(warningTopic)
    );
    this.alarms.push(cpuWarningAlarm);
  }

  /**
   * Creates serverless capacity alarms for Aurora Serverless v2.
   *
   * ServerlessDatabaseCapacity measures the Aurora capacity units (ACUs) in use.
   * Alarms trigger when capacity drops below thresholds, indicating resource
   * constraints or scaling issues.
   * @param _stageName - Stage name (unused, kept for interface consistency)
   * @param clusterIdentifier - Aurora cluster identifier for metric dimensions
   * @param thresholds - Alarm threshold configuration
   * @param criticalTopic - SNS topic for critical alerts
   * @param warningTopic - SNS topic for warning alerts
   */
  private createStorageAlarms(
    _stageName: string,
    clusterIdentifier: string,
    thresholds: AuroraAlarmsThresholds,
    criticalTopic: sns.ITopic,
    warningTopic: sns.ITopic
  ): void {
    // ServerlessDatabaseCapacity measures Aurora Capacity Units (ACUs) in use
    const capacityMetric = new cloudwatch.Metric({
      namespace: "AWS/RDS",
      metricName: "ServerlessDatabaseCapacity",
      dimensionsMap: {
        DBClusterIdentifier: clusterIdentifier,
      },
      statistic: "Average",
      period: cdk.Duration.minutes(5),
    });

    const serverlessCriticalAlarm = new cloudwatch.Alarm(
      this,
      "ServerlessCriticalAlarm",
      {
        alarmDescription: `Aurora Serverless capacity below ${thresholds.storageCriticalGB} ACU`,
        metric: capacityMetric,
        threshold: thresholds.storageCriticalGB,
        evaluationPeriods: 2,
        comparisonOperator:
          cloudwatch.ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );
    serverlessCriticalAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(criticalTopic)
    );
    this.alarms.push(serverlessCriticalAlarm);

    const serverlessWarningAlarm = new cloudwatch.Alarm(
      this,
      "ServerlessWarningAlarm",
      {
        alarmDescription: `Aurora Serverless capacity below ${thresholds.storageWarningGB} ACU`,
        metric: capacityMetric,
        threshold: thresholds.storageWarningGB,
        evaluationPeriods: 2,
        comparisonOperator:
          cloudwatch.ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );
    serverlessWarningAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(warningTopic)
    );
    this.alarms.push(serverlessWarningAlarm);
  }

  /**
   * Creates database connection alarms.
   * @param _stageName - Stage name (unused, kept for interface consistency)
   * @param clusterIdentifier - Aurora cluster identifier for metric dimensions
   * @param thresholds - Alarm threshold configuration
   * @param criticalTopic - SNS topic for critical alerts
   * @param warningTopic - SNS topic for warning alerts
   */
  private createConnectionAlarms(
    _stageName: string,
    clusterIdentifier: string,
    thresholds: AuroraAlarmsThresholds,
    criticalTopic: sns.ITopic,
    warningTopic: sns.ITopic
  ): void {
    const connectionsMetric = new cloudwatch.Metric({
      namespace: "AWS/RDS",
      metricName: "DatabaseConnections",
      dimensionsMap: {
        DBClusterIdentifier: clusterIdentifier,
      },
      statistic: "Average",
      period: cdk.Duration.minutes(5),
    });

    const connectionsCriticalAlarm = new cloudwatch.Alarm(
      this,
      "ConnectionsCriticalAlarm",
      {
        alarmDescription: `Aurora connections exceed ${thresholds.connectionsCritical}`,
        metric: connectionsMetric,
        threshold: thresholds.connectionsCritical,
        evaluationPeriods: 2,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );
    connectionsCriticalAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(criticalTopic)
    );
    this.alarms.push(connectionsCriticalAlarm);

    const connectionsWarningAlarm = new cloudwatch.Alarm(
      this,
      "ConnectionsWarningAlarm",
      {
        alarmDescription: `Aurora connections exceed ${thresholds.connectionsWarning}`,
        metric: connectionsMetric,
        threshold: thresholds.connectionsWarning,
        evaluationPeriods: 2,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );
    connectionsWarningAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(warningTopic)
    );
    this.alarms.push(connectionsWarningAlarm);
  }

  /**
   * Creates replication lag alarm (warning only).
   * @param _stageName - Stage name (unused, kept for interface consistency)
   * @param clusterIdentifier - Aurora cluster identifier for metric dimensions
   * @param thresholds - Alarm threshold configuration
   * @param warningTopic - SNS topic for warning alerts
   */
  private createReplicationAlarm(
    _stageName: string,
    clusterIdentifier: string,
    thresholds: AuroraAlarmsThresholds,
    warningTopic: sns.ITopic
  ): void {
    const replicationMetric = new cloudwatch.Metric({
      namespace: "AWS/RDS",
      metricName: "AuroraReplicaLag",
      dimensionsMap: {
        DBClusterIdentifier: clusterIdentifier,
      },
      statistic: "Average",
      period: cdk.Duration.minutes(5),
    });

    const replicationAlarm = new cloudwatch.Alarm(this, "ReplicationLagAlarm", {
      alarmDescription: `Aurora replication lag exceeds ${thresholds.replicationLagMs}ms`,
      metric: replicationMetric,
      threshold: thresholds.replicationLagMs,
      evaluationPeriods: 3,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    replicationAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(warningTopic)
    );
    this.alarms.push(replicationAlarm);
  }
}
