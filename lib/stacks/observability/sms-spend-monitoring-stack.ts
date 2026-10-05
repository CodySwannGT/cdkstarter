/** Optional account-level SMS counter monitoring and persisted enforcement. */
import * as cdk from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sns from "aws-cdk-lib/aws-sns";
import { validateSmsMonitoring } from "../../../util/sms-monitoring";
import type { EnabledSmsMonitoringConfig } from "../../../util/sms-monitoring";
import type { Construct } from "constructs";
import type { SmsMonitoringConfig } from "../../types";

/** Owning support account's explicit SMS settings. */
export interface SmsSpendMonitoringStackProps extends cdk.StackProps {
  /** Stable support-environment controller identifier. */
  readonly controllerName: string;
  /** Default-off module settings. */
  readonly monitoring: SmsMonitoringConfig;
}

/** No preference-setting custom resource; all changes require a real cap breach/recovery. */
export class SmsSpendMonitoringStack extends cdk.Stack {
  /**
   * Create the optional monitoring/effect resources.
   * @param scope - Parent support stage
   * @param id - Stable stack identifier
   * @param props - Explicit limits/destination and owning identity
   */
  constructor(
    scope: Construct,
    id: string,
    props: SmsSpendMonitoringStackProps
  ) {
    super(scope, id, props);
    validateSmsMonitoring(props.monitoring, this.account, this.region);
    if (!props.monitoring.enabled) return;
    const config = {
      ...props.monitoring,
      mode: props.monitoring.mode ?? "observe",
      account: this.account,
      region: this.region,
      controllerName: props.controllerName,
    } as EnabledSmsMonitoringConfig & {
      readonly account: string;
      readonly region: string;
      readonly controllerName: string;
    };
    const topic = sns.Topic.fromTopicArn(
      this,
      "NotificationTopic",
      config.notificationTopicArn
    );
    const table =
      config.mode === "enforce"
        ? new dynamodb.Table(this, "BreakerState", {
            partitionKey: {
              name: "controller",
              type: dynamodb.AttributeType.STRING,
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecoverySpecification: {
              pointInTimeRecoveryEnabled: true,
            },
            removalPolicy: cdk.RemovalPolicy.RETAIN,
          })
        : undefined;
    const evaluator = new lambda.Function(this, "Evaluator", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("resources/observability/sms-spend-monitor"),
      timeout: cdk.Duration.seconds(60),
      reservedConcurrentExecutions: 1,
      environment: {
        SMS_CONFIG: JSON.stringify(config),
        ...(table ? { STATE_TABLE: table.tableName } : {}),
      },
    });
    evaluator.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["cloudwatch:GetMetricStatistics"],
        resources: ["*"],
        conditions: { StringEquals: { "aws:RequestedRegion": this.region } },
      })
    );
    evaluator.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["cloudwatch:PutMetricData"],
        resources: ["*"],
        conditions: {
          StringEquals: {
            "aws:RequestedRegion": this.region,
            "cloudwatch:namespace": "Starter/SmsSpend",
          },
        },
      })
    );
    evaluator.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["sns:Publish"],
        resources: [config.notificationTopicArn],
      })
    );
    if (table) {
      evaluator.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["dynamodb:GetItem", "dynamodb:UpdateItem"],
          resources: [table.tableArn],
        })
      );
      evaluator.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["sns:GetSMSAttributes", "sns:SetSMSAttributes"],
          resources: ["*"],
          conditions: { StringEquals: { "aws:RequestedRegion": this.region } },
        })
      );
    }
    new events.Rule(this, "EvaluateEveryFiveMinutes", {
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
      targets: [
        new targets.LambdaFunction(evaluator, {
          event: events.RuleTargetInput.fromObject({ action: "evaluate" }),
        }),
      ],
    });
    this.createAlarm(
      "MonthlyWarning",
      new cloudwatch.Metric({
        namespace: "AWS/SNS",
        metricName: "SMSMonthToDateSpentUSD",
        statistic: "Maximum",
        period: cdk.Duration.minutes(5),
      }),
      config.monthlyPreferenceUsd * (config.warningPercent / 100),
      topic
    );
    this.createAlarm(
      "DailyCap",
      this.estimateMetric("DailyEstimateUsd", config.controllerName),
      config.dailyCapUsd,
      topic
    );
    this.createAlarm(
      "FiveMinuteSurge",
      this.estimateMetric("SurgeEstimateUsd", config.controllerName),
      config.fiveMinuteSurgeUsd,
      topic
    );
    this.createAlarm(
      "EvaluatorFailure",
      evaluator.metricErrors({
        statistic: "Sum",
        period: cdk.Duration.minutes(5),
      }),
      0,
      topic
    );
    new cdk.CfnOutput(this, "EvaluatorArn", {
      value: evaluator.functionArn,
      description:
        "Explicit operator recovery invocation target; never auto-restores.",
    });
  }

  /**
   * Build a same-controller estimate metric rather than inventing an SNS daily metric.
   * @param metricName - Published derived estimate
   * @param controllerName - Source-owned controller identity
   * @returns CloudWatch estimate metric
   */
  private estimateMetric(
    metricName: string,
    controllerName: string
  ): cloudwatch.Metric {
    return new cloudwatch.Metric({
      namespace: "Starter/SmsSpend",
      metricName,
      dimensionsMap: { Controller: controllerName },
      statistic: "Maximum",
      period: cdk.Duration.minutes(5),
    });
  }

  /**
   * Emit a missing-data-safe alarm using only the caller's topic.
   * @param id - Stable alarm ID
   * @param metric - Native counter or explicit estimate
   * @param threshold - Strict comparison threshold
   * @param topic - Existing notification destination
   */
  private createAlarm(
    id: string,
    metric: cloudwatch.Metric,
    threshold: number,
    topic: sns.ITopic
  ): void {
    const alarm = new cloudwatch.Alarm(this, id, {
      metric,
      threshold,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    alarm.addAlarmAction(new actions.SnsAction(topic));
  }
}
