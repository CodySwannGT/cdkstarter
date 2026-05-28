/**
 * Dashboard Stack - CloudWatch Dashboard for Environment Monitoring
 *
 * This stack creates a CloudWatch dashboard providing at-a-glance visibility
 * into environment health across all monitored resources.
 *
 * ## Dashboard Layout
 *
 * The dashboard is organized into sections by resource type:
 * - Aurora: CPU Utilization, Connections, Freeable Memory
 * - Valkey: Cache Hit Rate, CPU Utilization, Evictions
 * - Alarms: Overview of all alarm states
 *
 * ## Cross-Stack References
 *
 * This stack imports:
 * - Cluster identifiers from database stacks
 * - Alarm references from alarm stacks
 * @see lib/stacks/observability/aurora-alarms-stack.ts
 * @see lib/stacks/observability/valkey-alarms-stack.ts
 * @module lib/stacks/observability/dashboard-stack
 */
import * as cdk from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import type { Construct } from "constructs";

/**
 * Configuration properties for DashboardStack.
 */
export interface DashboardStackProps extends cdk.StackProps {
  /**
   * Stage name for CloudFormation output prefixes.
   */
  readonly stageName: string;

  /**
   * Aurora cluster identifier for metric dimensions.
   * Optional - only include if Aurora is enabled.
   */
  readonly auroraClusterId?: string;

  /**
   * Valkey replication group ID for metric dimensions.
   * Optional - only include if Valkey is enabled.
   */
  readonly valkeyReplicationGroupId?: string;

  /**
   * CloudWatch alarms to include in alarm widgets.
   */
  readonly alarms?: cloudwatch.Alarm[];
}

/**
 * Dashboard Stack creating CloudWatch dashboard for environment monitoring.
 */
export class DashboardStack extends cdk.Stack {
  /**
   * The CloudWatch dashboard.
   */
  public readonly dashboard: cloudwatch.Dashboard;

  /**
   * Creates a new DashboardStack.
   * @param scope - Parent construct
   * @param id - Stack identifier
   * @param props - Stack configuration
   */
  constructor(scope: Construct, id: string, props: DashboardStackProps) {
    super(scope, id, props);

    const {
      stageName,
      auroraClusterId,
      valkeyReplicationGroupId,
      alarms = [],
    } = props;

    this.dashboard = new cloudwatch.Dashboard(this, "Dashboard");

    const widgets: cloudwatch.IWidget[] = [];

    // Title row
    widgets.push(
      new cloudwatch.TextWidget({
        markdown: `# ${stageName.toUpperCase()} Environment Dashboard`,
        width: 24,
        height: 1,
      })
    );

    // Alarm status widget
    if (alarms.length > 0) {
      widgets.push(
        new cloudwatch.AlarmStatusWidget({
          title: "Alarm Status",
          alarms,
          width: 24,
          height: 4,
        })
      );
    }

    // Aurora widgets
    if (auroraClusterId) {
      widgets.push(
        new cloudwatch.TextWidget({
          markdown: "## Aurora Database",
          width: 24,
          height: 1,
        })
      );
      widgets.push(...this.createAuroraWidgets(auroraClusterId));
    }

    // Valkey widgets
    if (valkeyReplicationGroupId) {
      widgets.push(
        new cloudwatch.TextWidget({
          markdown: "## Valkey Cache",
          width: 24,
          height: 1,
        })
      );
      widgets.push(...this.createValkeyWidgets(valkeyReplicationGroupId));
    }

    this.dashboard.addWidgets(...widgets);

    new cdk.CfnOutput(this, "DashboardUrl", {
      value: `https://${cdk.Stack.of(this).region}.console.aws.amazon.com/cloudwatch/home?region=${cdk.Stack.of(this).region}#dashboards:name=${this.dashboard.dashboardName}`,
      description: `CloudWatch dashboard URL for ${stageName}`,
      exportName: `${stageName}-dashboard-url`,
    });
  }

  /**
   * Creates Aurora monitoring widgets.
   * @param clusterId - Aurora cluster identifier for metric dimensions
   * @returns Array of CloudWatch widgets for Aurora metrics
   */
  private createAuroraWidgets(clusterId: string): cloudwatch.IWidget[] {
    const dimensions = { DBClusterIdentifier: clusterId };

    return [
      new cloudwatch.GraphWidget({
        title: "Aurora CPU Utilization",
        left: [
          new cloudwatch.Metric({
            namespace: "AWS/RDS",
            metricName: "CPUUtilization",
            dimensionsMap: dimensions,
            statistic: "Average",
          }),
        ],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: "Aurora Connections",
        left: [
          new cloudwatch.Metric({
            namespace: "AWS/RDS",
            metricName: "DatabaseConnections",
            dimensionsMap: dimensions,
            statistic: "Average",
          }),
        ],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: "Aurora Freeable Memory",
        left: [
          new cloudwatch.Metric({
            namespace: "AWS/RDS",
            metricName: "FreeableMemory",
            dimensionsMap: dimensions,
            statistic: "Average",
          }),
        ],
        width: 8,
        height: 6,
      }),
    ];
  }

  /**
   * Creates Valkey monitoring widgets.
   * @param replicationGroupId - Valkey replication group ID for metric dimensions
   * @returns Array of CloudWatch widgets for Valkey metrics
   */
  private createValkeyWidgets(
    replicationGroupId: string
  ): cloudwatch.IWidget[] {
    const dimensions = { ReplicationGroupId: replicationGroupId };
    const elastiCacheNamespace = "AWS/ElastiCache";

    return [
      new cloudwatch.GraphWidget({
        title: "Valkey Cache Hit Rate",
        left: [
          new cloudwatch.Metric({
            namespace: elastiCacheNamespace,
            metricName: "CacheHitRate",
            dimensionsMap: dimensions,
            statistic: "Average",
          }),
        ],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: "Valkey CPU",
        left: [
          new cloudwatch.Metric({
            namespace: elastiCacheNamespace,
            metricName: "CPUUtilization",
            dimensionsMap: dimensions,
            statistic: "Average",
          }),
        ],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: "Valkey Evictions",
        left: [
          new cloudwatch.Metric({
            namespace: elastiCacheNamespace,
            metricName: "Evictions",
            dimensionsMap: dimensions,
            statistic: "Sum",
          }),
        ],
        width: 8,
        height: 6,
      }),
    ];
  }
}
