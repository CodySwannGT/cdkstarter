/**
 * Canary Stack - Synthetic Endpoint Monitoring
 *
 * Probes the environment's public URLs on a schedule and raises a critical
 * alarm when any is unreachable or returns a non-2xx/3xx status — catching
 * "site down" regardless of cause.
 *
 * ## Design
 *
 * A dependency-free Lambda fetches every configured URL each interval and
 * throws on any failure; the alarm watches the function's Errors metric.
 * Missing data is treated as breaching so a broken schedule (or deleted
 * function) cannot silently hide an outage.
 * @see lib/stacks/observability/sns-stack.ts - The critical topic alarms route to
 * @module lib/stacks/observability/canary-stack
 */
import * as cdk from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as events from "aws-cdk-lib/aws-events";
import * as eventsTargets from "aws-cdk-lib/aws-events-targets";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import type * as sns from "aws-cdk-lib/aws-sns";
import type { Construct } from "constructs";

/** Default minutes between canary probes when the config does not set one */
const DEFAULT_INTERVAL_MINUTES = 5;

/**
 * Configuration properties for CanaryStack.
 */
export interface CanaryStackProps extends cdk.StackProps {
  /**
   * Stage name for resource naming.
   * Examples: "dev", "staging", "production"
   */
  readonly stageName: string;

  /**
   * Public URLs the canary probes every interval.
   */
  readonly urls: readonly string[];

  /**
   * Minutes between probes (also the alarm period). Defaults to 5.
   */
  readonly intervalMinutes?: number;

  /**
   * Topic the canary-failure alarm notifies.
   */
  readonly criticalTopic: sns.ITopic;
}

/**
 * Canary Stack creating the synthetic probe Lambda, its schedule, and alarm.
 */
export class CanaryStack extends cdk.Stack {
  /**
   * The alarms this stack created, exposed for dashboard reuse.
   */
  public readonly alarms: cloudwatch.Alarm[] = [];

  /**
   * Creates a new CanaryStack.
   * @param scope - Parent construct
   * @param id - Stack identifier
   * @param props - Stack configuration
   */
  constructor(scope: Construct, id: string, props: CanaryStackProps) {
    super(scope, id, props);

    const { stageName, urls, criticalTopic } = props;
    const intervalMinutes = props.intervalMinutes ?? DEFAULT_INTERVAL_MINUTES;

    const canary = new lambda.Function(this, "CanaryFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("resources/observability/canary"),
      timeout: cdk.Duration.seconds(30),
      environment: { CANARY_URLS: JSON.stringify(urls) },
      logGroup: new logs.LogGroup(this, "CanaryLogs", {
        retention: logs.RetentionDays.ONE_MONTH,
      }),
      insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
    });

    new events.Rule(this, "CanarySchedule", {
      schedule: events.Schedule.rate(cdk.Duration.minutes(intervalMinutes)),
      targets: [new eventsTargets.LambdaFunction(canary)],
    });

    const alarm = new cloudwatch.Alarm(this, "CanaryFailureAlarm", {
      alarmName: `${stageName}-canary-endpoint-down`,
      alarmDescription:
        `A public endpoint failed the synthetic canary probe (non-2xx/3xx ` +
        `or unreachable). Failure detail is in the canary Lambda logs. ` +
        `Missing data also alarms so a broken canary cannot hide an outage.`,
      metric: canary.metricErrors({
        period: cdk.Duration.minutes(intervalMinutes),
        statistic: "Sum",
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });
    alarm.addAlarmAction(new cloudwatchActions.SnsAction(criticalTopic));
    alarm.addOkAction(new cloudwatchActions.SnsAction(criticalTopic));
    this.alarms.push(alarm);
  }
}
