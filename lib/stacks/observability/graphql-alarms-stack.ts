/** Caller-defined GraphQL operation alarms with an explicit metric contract. */
import { createHash } from "node:crypto";
import * as cdk from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as actions from "aws-cdk-lib/aws-cloudwatch-actions";
import type * as sns from "aws-cdk-lib/aws-sns";
import type { Construct } from "constructs";
import { validateGraphqlMonitoring } from "../../../util/graphql-monitoring";
import type { GraphqlMonitoringConfig } from "../../types";

/** Configuration and existing notification topics for operation alarms. */
export interface GraphqlAlarmsStackProps extends cdk.StackProps {
  /** Environment identity for cause metadata and alarm names. */
  readonly stageName: string;
  /** Caller-owned backend metric manifest and budgets. */
  readonly config: GraphqlMonitoringConfig;
  /** Existing warning route. */
  readonly warningTopic: sns.ITopic;
  /** Existing critical route. */
  readonly criticalTopic: sns.ITopic;
}

/** GraphQL error-rate and latency alarms; no backend instrumentation is created. */
export class GraphqlAlarmsStack extends cdk.Stack {
  /** Alarms reusable by the existing environment composite alarm. */
  public readonly alarms: readonly cloudwatch.Alarm[];

  /**
   * Build guarded five-minute operation alarms from caller metrics.
   * @param scope - Owning environment stage
   * @param id - Stable stack identity
   * @param props - Caller metric contract and notification routes
   */
  constructor(scope: Construct, id: string, props: GraphqlAlarmsStackProps) {
    super(scope, id, props);
    const config = validateGraphqlMonitoring(props.config);
    this.alarms = config
      ? config.operations.flatMap(operation =>
          this.createOperationAlarms(props, config, operation)
        )
      : [];
  }

  /**
   * Define independent traffic-selection expressions for count, errors and latency.
   * @param props - Notification and stage settings
   * @param config - Validated metric contract
   * @param operation - Explicit operation manifest entry
   * @returns Warning and critical alarms for error rate and latency
   */
  private createOperationAlarms(
    props: GraphqlAlarmsStackProps,
    config: GraphqlMonitoringConfig,
    operation: GraphqlMonitoringConfig["operations"][number]
  ): cloudwatch.Alarm[] {
    const period = cdk.Duration.minutes(5);
    const dimensionsMap = {
      OperationName: operation.name,
      OperationType: operation.type,
      Stage: config.stageDimension,
    };
    const metric = (
      name: string,
      statistic: string,
      authState?: string
    ): cloudwatch.Metric =>
      new cloudwatch.Metric({
        namespace: config.namespace,
        metricName: name,
        statistic,
        period,
        unit:
          name === "Errors"
            ? cloudwatch.Unit.COUNT
            : cloudwatch.Unit.MILLISECONDS,
        dimensionsMap: authState
          ? { ...dimensionsMap, AuthState: authState }
          : dimensionsMap,
      });
    const allCount = metric("Duration", "SampleCount");
    const allErrors = metric("Errors", "Sum");
    const allLatency = metric("Duration", config.latencyStatistic);
    const authCount = metric("Duration", "SampleCount", "authenticated");
    const anonCount = metric("Duration", "SampleCount", "anonymous");
    const authErrors = metric("Errors", "Sum", "authenticated");
    const authLatency = metric(
      "Duration",
      config.latencyStatistic,
      "authenticated"
    );
    const n = new cloudwatch.MathExpression({
      period,
      expression: operation.public
        ? "FILL(all_count,0)"
        : "IF(FILL(auth_count,0)+FILL(anon_count,0)>0,FILL(auth_count,0),FILL(all_count,0))",
      usingMetrics: operation.public
        ? { all_count: allCount }
        : { all_count: allCount, auth_count: authCount, anon_count: anonCount },
    });
    const e = new cloudwatch.MathExpression({
      period,
      expression: operation.public
        ? "FILL(all_errors,0)"
        : "IF(FILL(auth_count,0)+FILL(anon_count,0)>0,FILL(auth_errors,0),FILL(all_errors,0))",
      usingMetrics: operation.public
        ? { all_errors: allErrors }
        : {
            auth_count: authCount,
            anon_count: anonCount,
            auth_errors: authErrors,
            all_errors: allErrors,
          },
    });
    const l = new cloudwatch.MathExpression({
      period,
      expression: operation.public
        ? "FILL(all_latency,0)"
        : "IF(FILL(auth_count,0)+FILL(anon_count,0)>0,FILL(auth_latency,0),FILL(all_latency,0))",
      usingMetrics: operation.public
        ? { all_latency: allLatency }
        : {
            auth_count: authCount,
            anon_count: anonCount,
            auth_latency: authLatency,
            all_latency: allLatency,
          },
    });
    const rate = new cloudwatch.MathExpression({
      period,
      expression: `IF(n>=${config.minimumInvocations},100*e/IF(n>0,n,1),0)`,
      usingMetrics: { n, e },
    });
    const latency = new cloudwatch.MathExpression({
      period,
      expression: `IF(n>=${config.minimumInvocations},l,0)`,
      usingMetrics: { n, l },
    });
    const identity = `graphql:${config.namespace}:${operation.type}:${operation.name}`;
    const stableId = createHash("sha256")
      .update(identity)
      .digest("hex")
      .slice(0, 16);
    return (
      [
        {
          cause: "error-rate",
          metric: rate,
          thresholds: config.errorRatePercent,
        },
        {
          cause: "latency",
          metric: latency,
          thresholds: config.latencyMilliseconds,
        },
      ] as const
    ).flatMap(definition =>
      (["warning", "critical"] as const).map(severity => {
        const alarmName = `${props.stageName}-graphql-${operation.type}-${operation.name}-${definition.cause}-${severity}`;
        if (alarmName.length > 255)
          throw new Error(
            "GraphQL alarm name exceeds CloudWatch's 255-character limit."
          );
        const alarm = new cloudwatch.Alarm(
          this,
          `${stableId}-${definition.cause}-${severity}`,
          {
            alarmName,
            alarmDescription: JSON.stringify({
              version: 1,
              environment: props.stageName,
              identity,
              cause: definition.cause,
            }),
            metric: definition.metric,
            threshold: definition.thresholds[severity],
            evaluationPeriods: 1,
            comparisonOperator:
              cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
          }
        );
        alarm.addAlarmAction(
          new actions.SnsAction(
            severity === "warning" ? props.warningTopic : props.criticalTopic
          )
        );
        return alarm;
      })
    );
  }
}
