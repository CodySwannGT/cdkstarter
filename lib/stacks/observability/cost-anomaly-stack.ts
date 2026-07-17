/**
 * Cost Anomaly Stack - Runaway-Spend Detection
 *
 * Creates an AWS Cost Anomaly Detection monitor (per-service dimension)
 * with a daily email digest. Catches runaway spend — retry storms,
 * forgotten resources, misconfigured scaling — within a day, without any
 * static budget to maintain.
 * @module lib/stacks/observability/cost-anomaly-stack
 */
import * as cdk from "aws-cdk-lib";
import * as ce from "aws-cdk-lib/aws-ce";
import type { Construct } from "constructs";

/**
 * Configuration properties for CostAnomalyStack.
 */
export interface CostAnomalyStackProps extends cdk.StackProps {
  /**
   * Stage name for resource naming.
   * Examples: "dev", "staging", "production"
   */
  readonly stageName: string;

  /**
   * Anomalies below this total USD impact are not reported.
   */
  readonly thresholdUsd: number;

  /**
   * Email addresses receiving the daily anomaly digest.
   */
  readonly subscriberEmails: readonly string[];
}

/**
 * Cost Anomaly Stack creating the monitor and its daily subscription.
 */
export class CostAnomalyStack extends cdk.Stack {
  /**
   * Creates a new CostAnomalyStack.
   * @param scope - Parent construct
   * @param id - Stack identifier
   * @param props - Stack configuration
   */
  constructor(scope: Construct, id: string, props: CostAnomalyStackProps) {
    super(scope, id, props);

    const { stageName, thresholdUsd, subscriberEmails } = props;

    const monitor = new ce.CfnAnomalyMonitor(this, "CostAnomalyMonitor", {
      monitorName: `${stageName}-service-costs`,
      monitorType: "DIMENSIONAL",
      monitorDimension: "SERVICE",
    });

    new ce.CfnAnomalySubscription(this, "CostAnomalySubscription", {
      subscriptionName: `${stageName}-cost-anomalies`,
      frequency: "DAILY",
      monitorArnList: [monitor.attrMonitorArn],
      subscribers: subscriberEmails.map(address => ({
        type: "EMAIL",
        address,
      })),
      thresholdExpression: JSON.stringify({
        Dimensions: {
          Key: "ANOMALY_TOTAL_IMPACT_ABSOLUTE",
          MatchOptions: ["GREATER_THAN_OR_EQUAL"],
          Values: [String(thresholdUsd)],
        },
      }),
    });
  }
}
