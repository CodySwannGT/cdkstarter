/**
 * Valkey Alarms Stack - CloudWatch Alarms for ElastiCache Valkey
 *
 * This stack creates CloudWatch alarms for monitoring Valkey cache health
 * and performance. Alarms route to SNS topics based on severity.
 *
 * ## Alarm Categories
 *
 * ### Critical
 * - CPU Utilization > critical threshold (e.g., 95%)
 * - Cache Hit Rate < critical threshold (e.g., 50%)
 * - Evictions > critical threshold (e.g., 1000)
 *
 * ### Warning
 * - CPU Utilization > warning threshold (e.g., 80%)
 * - Cache Hit Rate < warning threshold (e.g., 80%)
 * - Evictions > warning threshold (e.g., 0)
 *
 * ## Cross-Stack References
 *
 * This stack imports:
 * - Valkey replication group ID from ValkeyStack
 * - SNS topic ARNs from SnsStack
 * @see lib/stacks/database/valkey-stack.ts - Monitored resource
 * @see lib/stacks/observability/sns-stack.ts - Notification targets
 * @module lib/stacks/observability/valkey-alarms-stack
 */
import * as cdk from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import type { Construct } from "constructs";

/** CloudWatch namespace for ElastiCache metrics. */
const ELASTICACHE_NAMESPACE = "AWS/ElastiCache";

/**
 * Props interface thresholds for Valkey monitoring.
 */
export interface ValkeyAlarmsThresholds {
  /** CPU utilization percentage to trigger warning alarm. */
  readonly cpuWarningPercent: number;
  /** CPU utilization percentage to trigger critical alarm. */
  readonly cpuCriticalPercent: number;
  /** Cache hit rate percentage below which warning triggers. */
  readonly cacheHitRateWarningPercent: number;
  /** Cache hit rate percentage below which critical triggers. */
  readonly cacheHitRateCriticalPercent: number;
  /** Eviction count above which warning triggers. */
  readonly evictionsWarning: number;
  /** Eviction count above which critical triggers. */
  readonly evictionsCritical: number;
}

/**
 * Configuration properties for ValkeyAlarmsStack.
 */
export interface ValkeyAlarmsStackProps extends cdk.StackProps {
  /**
   * Stage name (unused, kept for interface consistency).
   */
  readonly stageName: string;

  /**
   * Valkey replication group ID for metric dimensions.
   */
  readonly replicationGroupId: string;

  /**
   * Alarm thresholds for Valkey monitoring.
   */
  readonly thresholds: ValkeyAlarmsThresholds;

  /**
   * SNS topic for warning alarms.
   */
  readonly warningTopic: sns.ITopic;

  /**
   * SNS topic for critical alarms.
   */
  readonly criticalTopic: sns.ITopic;
}

/**
 * Valkey Alarms Stack creating CloudWatch alarms for cache monitoring.
 */
export class ValkeyAlarmsStack extends cdk.Stack {
  /**
   * All created alarms for dashboard reference.
   */
  public readonly alarms: cloudwatch.Alarm[] = [];

  /**
   * Creates a new ValkeyAlarmsStack.
   * @param scope - Parent construct
   * @param id - Stack identifier
   * @param props - Stack configuration
   */
  constructor(scope: Construct, id: string, props: ValkeyAlarmsStackProps) {
    super(scope, id, props);

    const {
      stageName,
      replicationGroupId,
      thresholds,
      warningTopic,
      criticalTopic,
    } = props;

    this.createCpuAlarms(
      stageName,
      replicationGroupId,
      thresholds,
      warningTopic,
      criticalTopic
    );
    this.createCacheHitRateAlarms(
      stageName,
      replicationGroupId,
      thresholds,
      warningTopic,
      criticalTopic
    );
    this.createEvictionsAlarms(
      stageName,
      replicationGroupId,
      thresholds,
      warningTopic,
      criticalTopic
    );
  }

  /**
   * Creates CPU utilization alarms (warning and critical).
   * @param _stageName - Stage name (unused, kept for interface consistency)
   * @param replicationGroupId - Valkey replication group ID for metric dimensions
   * @param thresholds - Alarm threshold configuration
   * @param warningTopic - SNS topic for warning alerts
   * @param criticalTopic - SNS topic for critical alerts
   */
  private createCpuAlarms(
    _stageName: string,
    replicationGroupId: string,
    thresholds: ValkeyAlarmsThresholds,
    warningTopic: sns.ITopic,
    criticalTopic: sns.ITopic
  ): void {
    const cpuMetric = new cloudwatch.Metric({
      namespace: ELASTICACHE_NAMESPACE,
      metricName: "CPUUtilization",
      dimensionsMap: {
        ReplicationGroupId: replicationGroupId,
      },
      statistic: "Average",
      period: cdk.Duration.minutes(5),
    });

    const cpuWarningAlarm = new cloudwatch.Alarm(this, "CpuWarningAlarm", {
      alarmDescription: `Valkey CPU utilization exceeds ${thresholds.cpuWarningPercent}%`,
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

    const cpuCriticalAlarm = new cloudwatch.Alarm(this, "CpuCriticalAlarm", {
      alarmDescription: `CRITICAL: Valkey CPU utilization exceeds ${thresholds.cpuCriticalPercent}%`,
      metric: cpuMetric,
      threshold: thresholds.cpuCriticalPercent,
      evaluationPeriods: 2,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    cpuCriticalAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(criticalTopic)
    );
    this.alarms.push(cpuCriticalAlarm);
  }

  /**
   * Creates cache hit rate alarms (warning and critical).
   * @param _stageName - Stage name (unused, kept for interface consistency)
   * @param replicationGroupId - Valkey replication group ID for metric dimensions
   * @param thresholds - Alarm threshold configuration
   * @param warningTopic - SNS topic for warning alerts
   * @param criticalTopic - SNS topic for critical alerts
   */
  private createCacheHitRateAlarms(
    _stageName: string,
    replicationGroupId: string,
    thresholds: ValkeyAlarmsThresholds,
    warningTopic: sns.ITopic,
    criticalTopic: sns.ITopic
  ): void {
    const hitRateMetric = new cloudwatch.Metric({
      namespace: ELASTICACHE_NAMESPACE,
      metricName: "CacheHitRate",
      dimensionsMap: {
        ReplicationGroupId: replicationGroupId,
      },
      statistic: "Average",
      period: cdk.Duration.minutes(5),
    });

    const hitRateWarningAlarm = new cloudwatch.Alarm(
      this,
      "CacheHitRateWarningAlarm",
      {
        alarmDescription: `Valkey cache hit rate below ${thresholds.cacheHitRateWarningPercent}%`,
        metric: hitRateMetric,
        threshold: thresholds.cacheHitRateWarningPercent,
        evaluationPeriods: 3,
        comparisonOperator:
          cloudwatch.ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );
    hitRateWarningAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(warningTopic)
    );
    this.alarms.push(hitRateWarningAlarm);

    const hitRateCriticalAlarm = new cloudwatch.Alarm(
      this,
      "CacheHitRateCriticalAlarm",
      {
        alarmDescription: `CRITICAL: Valkey cache hit rate below ${thresholds.cacheHitRateCriticalPercent}%`,
        metric: hitRateMetric,
        threshold: thresholds.cacheHitRateCriticalPercent,
        evaluationPeriods: 2,
        comparisonOperator:
          cloudwatch.ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );
    hitRateCriticalAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(criticalTopic)
    );
    this.alarms.push(hitRateCriticalAlarm);
  }

  /**
   * Creates evictions alarms (warning and critical).
   * @param _stageName - Stage name (unused, kept for interface consistency)
   * @param replicationGroupId - Valkey replication group ID for metric dimensions
   * @param thresholds - Alarm threshold configuration
   * @param warningTopic - SNS topic for warning alerts
   * @param criticalTopic - SNS topic for critical alerts
   */
  private createEvictionsAlarms(
    _stageName: string,
    replicationGroupId: string,
    thresholds: ValkeyAlarmsThresholds,
    warningTopic: sns.ITopic,
    criticalTopic: sns.ITopic
  ): void {
    const evictionsMetric = new cloudwatch.Metric({
      namespace: ELASTICACHE_NAMESPACE,
      metricName: "Evictions",
      dimensionsMap: {
        ReplicationGroupId: replicationGroupId,
      },
      statistic: "Sum",
      period: cdk.Duration.minutes(5),
    });

    const evictionsWarningAlarm = new cloudwatch.Alarm(
      this,
      "EvictionsWarningAlarm",
      {
        alarmDescription: `Valkey evictions exceed ${thresholds.evictionsWarning}`,
        metric: evictionsMetric,
        threshold: thresholds.evictionsWarning,
        evaluationPeriods: 2,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );
    evictionsWarningAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(warningTopic)
    );
    this.alarms.push(evictionsWarningAlarm);

    const evictionsCriticalAlarm = new cloudwatch.Alarm(
      this,
      "EvictionsCriticalAlarm",
      {
        alarmDescription: `CRITICAL: Valkey evictions exceed ${thresholds.evictionsCritical}`,
        metric: evictionsMetric,
        threshold: thresholds.evictionsCritical,
        evaluationPeriods: 2,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );
    evictionsCriticalAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(criticalTopic)
    );
    this.alarms.push(evictionsCriticalAlarm);
  }
}
