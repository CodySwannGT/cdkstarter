/**
 * Composite Alarm Stack - One Root Signal Per Environment
 *
 * Rolls every baseline alarm in the environment into a single
 * `<stage>-environment-unhealthy` composite alarm. During an incident,
 * pages and agents get one root signal while the child alarms carry the
 * detail — preventing an alert storm from drowning the response.
 * @see lib/stacks/observability/sns-stack.ts - The critical topic this notifies
 * @module lib/stacks/observability/composite-alarm-stack
 */
import * as cdk from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import type * as sns from "aws-cdk-lib/aws-sns";
import type { Construct } from "constructs";

/**
 * Configuration properties for CompositeAlarmStack.
 */
export interface CompositeAlarmStackProps extends cdk.StackProps {
  /**
   * Stage name for resource naming.
   * Examples: "dev", "staging", "production"
   */
  readonly stageName: string;

  /**
   * The alarms rolled into the composite.
   */
  readonly alarms: readonly cloudwatch.Alarm[];

  /**
   * Topic the composite alarm notifies.
   */
  readonly criticalTopic: sns.ITopic;
}

/**
 * Composite Alarm Stack creating the environment-unhealthy root signal.
 */
export class CompositeAlarmStack extends cdk.Stack {
  /**
   * Creates a new CompositeAlarmStack.
   * @param scope - Parent construct
   * @param id - Stack identifier
   * @param props - Stack configuration
   */
  constructor(scope: Construct, id: string, props: CompositeAlarmStackProps) {
    super(scope, id, props);

    const { stageName, alarms, criticalTopic } = props;

    const composite = new cloudwatch.CompositeAlarm(
      this,
      "EnvironmentUnhealthyAlarm",
      {
        compositeAlarmName: `${stageName}-environment-unhealthy`,
        alarmDescription:
          `At least one baseline alarm in ${stageName} is firing — open ` +
          `the child alarms (or the dashboard) for detail.`,
        alarmRule: cloudwatch.AlarmRule.anyOf(
          ...alarms.map(alarm =>
            cloudwatch.AlarmRule.fromAlarm(alarm, cloudwatch.AlarmState.ALARM)
          )
        ),
      }
    );
    composite.addAlarmAction(new cloudwatchActions.SnsAction(criticalTopic));
  }
}
