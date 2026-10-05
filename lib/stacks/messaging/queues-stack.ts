/** Standard queues, dedicated DLQs and opt-in existing-worker bindings. */
import * as cdk from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sources from "aws-cdk-lib/aws-lambda-event-sources";
import * as sns from "aws-cdk-lib/aws-sns";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { queueName, validateQueues } from "../../../util/queues";
import type { Construct } from "constructs";
import type { QueueDefinition, QueuesConfig } from "../../types";

/** Optional module settings and owning stage. */
export interface QueuesStackProps extends cdk.StackProps {
  /** Owning stage used in physical names. */
  readonly stageName: string;
  /** Explicit queue configuration. */
  readonly queues: QueuesConfig;
}

/** Keeps queues, alarms and worker grants in one stack with no cross-stack exports. */
export class QueuesStack extends cdk.Stack {
  /**
   * Creates only explicitly enabled standard queue resources.
   * @param scope - Parent construct
   * @param id - Stable stack identifier
   * @param props - Module settings and deployment environment
   */
  constructor(scope: Construct, id: string, props: QueuesStackProps) {
    super(scope, id, props);
    validateQueues(props.queues, {
      stageName: props.stageName,
      account: this.account,
      region: this.region,
    });
    if (!props.queues.enabled) return;
    [...(props.queues.definitions ?? [])]
      .sort((left, right) => left.key.localeCompare(right.key))
      .forEach(definition => this.createQueue(definition, props.stageName));
  }

  /**
   * Creates a keyed queue pair and its configured alarms/binding.
   * @param definition - Source queue configuration
   * @param stageName - Default name prefix
   */
  private createQueue(definition: QueueDefinition, stageName: string): void {
    const name = queueName(definition, stageName);
    const dlq = new sqs.Queue(this, `${definition.key}-Dlq`, {
      queueName: `${name}-dlq`,
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      retentionPeriod: cdk.Duration.seconds(
        definition.deadLetterRetentionSeconds ?? 1209600
      ),
    });
    const queue = new sqs.Queue(this, `${definition.key}-Queue`, {
      queueName: name,
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      retentionPeriod: cdk.Duration.seconds(
        definition.retentionSeconds ?? 345600
      ),
      visibilityTimeout: cdk.Duration.seconds(
        definition.visibilityTimeoutSeconds ?? 180
      ),
      deadLetterQueue: {
        queue: dlq,
        maxReceiveCount: definition.maxReceiveCount ?? 3,
      },
    });
    const topics = (definition.notificationTopicArns ?? []).map((arn, index) =>
      sns.Topic.fromTopicArn(this, `${definition.key}-Topic-${index}`, arn)
    );
    this.createAlarm(
      `${definition.key}-DlqDepth`,
      dlq.metricApproximateNumberOfMessagesVisible({
        statistic: "Maximum",
        period: cdk.Duration.minutes(5),
      }),
      0,
      topics
    );
    this.createAlarm(
      `${definition.key}-BacklogAge`,
      queue.metricApproximateAgeOfOldestMessage({
        statistic: "Maximum",
        period: cdk.Duration.minutes(5),
      }),
      definition.backlogAgeThresholdSeconds ?? 300,
      topics
    );
    this.bindWorker(definition, queue, stageName, topics);
  }

  /**
   * Attach a real event source and narrowly scoped consume grant to an imported role.
   * @param definition - Optional worker and signals
   * @param queue - Source queue only
   * @param stageName - Stable role-policy prefix
   * @param topics - Explicit alarm destinations
   */
  private bindWorker(
    definition: QueueDefinition,
    queue: sqs.Queue,
    stageName: string,
    topics: readonly sns.ITopic[]
  ): void {
    if (!definition.worker) return;
    const role = iam.Role.fromRoleArn(
      this,
      `${definition.key}-WorkerRole`,
      definition.worker.executionRoleArn,
      {
        mutable: true,
        defaultPolicyName: `queues-${stageName}-${definition.key}-consume`,
      }
    );
    const worker = lambda.Function.fromFunctionAttributes(
      this,
      `${definition.key}-Worker`,
      {
        functionArn: definition.worker.functionArn,
        role,
        sameEnvironment: true,
      }
    );
    worker.addEventSource(
      new sources.SqsEventSource(queue, {
        batchSize: 10,
        maxBatchingWindow: cdk.Duration.seconds(0),
      })
    );
    if (definition.worker.alarms?.errors)
      this.createAlarm(
        `${definition.key}-WorkerErrors`,
        worker.metricErrors({
          statistic: "Sum",
          period: cdk.Duration.minutes(5),
        }),
        0,
        topics
      );
    if (definition.worker.alarms?.throttles)
      this.createAlarm(
        `${definition.key}-WorkerThrottles`,
        worker.metricThrottles({
          statistic: "Sum",
          period: cdk.Duration.minutes(5),
        }),
        0,
        topics
      );
  }

  /**
   * Create a one-period missing-data-safe alarm and only supplied topic actions.
   * @param id - Stable keyed alarm identifier
   * @param metric - Actual queue/function metric identity
   * @param threshold - Strict greater-than trigger
   * @param topics - Explicit alarm destinations
   */
  private createAlarm(
    id: string,
    metric: cloudwatch.Metric,
    threshold: number,
    topics: readonly sns.ITopic[]
  ): void {
    const alarm = new cloudwatch.Alarm(this, id, {
      metric,
      threshold,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    topics.forEach(topic => alarm.addAlarmAction(new actions.SnsAction(topic)));
  }
}
