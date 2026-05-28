/**
 * SNS Stack - Alarm Notification Topics
 *
 * This stack creates SNS topics for CloudWatch alarm notifications at different
 * severity levels: critical, warning, and info.
 *
 * ## Topic Hierarchy
 *
 * - **Critical**: Immediate action required (service down, data at risk)
 * - **Warning**: Degraded performance or approaching limits
 * - **Info**: Informational notifications (successful deployments, etc.)
 *
 * ## Email Subscriptions
 *
 * Topics are configured with email subscriptions from environment config.
 * Subscribers must confirm their subscription via email to receive notifications.
 *
 * ## Cross-Stack References
 *
 * This stack exports topic ARNs for use by alarm stacks:
 * - `{stageName}-sns-critical-topic-arn`
 * - `{stageName}-sns-warning-topic-arn`
 * - `{stageName}-sns-info-topic-arn`
 * @see lib/stacks/observability/aurora-alarms.ts - Uses these topics
 * @see lib/stacks/observability/valkey-alarms.ts - Uses these topics
 * @module lib/stacks/observability/sns-stack
 */
import * as cdk from "aws-cdk-lib";
import * as kms from "aws-cdk-lib/aws-kms";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import type { Construct } from "constructs";

/**
 * Configuration properties for SnsStack.
 */
export interface SnsStackProps extends cdk.StackProps {
  /**
   * Stage name for CloudFormation output prefixes.
   * Examples: "dev", "staging", "production"
   */
  readonly stageName: string;

  /**
   * Email addresses to subscribe to critical alerts.
   */
  readonly criticalEmails: readonly string[];

  /**
   * Email addresses to subscribe to warning alerts.
   */
  readonly warningEmails: readonly string[];

  /**
   * Email addresses to subscribe to info alerts.
   */
  readonly infoEmails: readonly string[];
}

/**
 * SNS Stack creating alarm notification topics.
 *
 * Creates three topics for different severity levels with email subscriptions.
 */
export class SnsStack extends cdk.Stack {
  /**
   * Critical alerts topic - immediate action required.
   */
  public readonly criticalTopic: sns.Topic;

  /**
   * Warning alerts topic - degraded performance.
   */
  public readonly warningTopic: sns.Topic;

  /**
   * Info alerts topic - informational notifications.
   */
  public readonly infoTopic: sns.Topic;

  /**
   * Creates a new SnsStack.
   * @param scope - Parent construct
   * @param id - Stack identifier
   * @param props - Stack configuration
   */
  constructor(scope: Construct, id: string, props: SnsStackProps) {
    super(scope, id, props);

    const { stageName, criticalEmails, warningEmails, infoEmails } = props;

    this.criticalTopic = this.createTopic(
      stageName,
      "critical",
      criticalEmails
    );
    this.warningTopic = this.createTopic(stageName, "warning", warningEmails);
    this.infoTopic = this.createTopic(stageName, "info", infoEmails);
    this.createOutputs(stageName);
  }

  /**
   * Creates an SNS topic with email subscriptions.
   * @param stageName - Stage name for resource naming
   * @param severity - Severity level (critical, warning, info)
   * @param emails - Email addresses to subscribe
   * @returns The created topic
   */
  private createTopic(
    stageName: string,
    severity: string,
    emails: readonly string[]
  ): sns.Topic {
    const topic = new sns.Topic(this, `${severity}Topic`, {
      displayName: `${stageName} ${severity} alerts`,
      masterKey: kms.Alias.fromAliasName(
        this,
        `${severity}Key`,
        "alias/aws/sns"
      ),
    });

    emails.forEach(email => {
      topic.addSubscription(
        new subscriptions.EmailSubscription(email, {
          json: false,
        })
      );
    });

    return topic;
  }

  /**
   * Creates CloudFormation outputs for cross-stack references.
   * @param stageName - Stage name for export name prefixes
   */
  private createOutputs(stageName: string): void {
    new cdk.CfnOutput(this, "CriticalTopicArn", {
      value: this.criticalTopic.topicArn,
      description: `Critical alerts topic ARN for ${stageName}`,
      exportName: `${stageName}-sns-critical-topic-arn`,
    });

    new cdk.CfnOutput(this, "WarningTopicArn", {
      value: this.warningTopic.topicArn,
      description: `Warning alerts topic ARN for ${stageName}`,
      exportName: `${stageName}-sns-warning-topic-arn`,
    });

    new cdk.CfnOutput(this, "InfoTopicArn", {
      value: this.infoTopic.topicArn,
      description: `Info alerts topic ARN for ${stageName}`,
      exportName: `${stageName}-sns-info-topic-arn`,
    });
  }
}
