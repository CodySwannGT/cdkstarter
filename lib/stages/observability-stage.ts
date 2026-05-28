/**
 * Observability Stage - Monitoring Infrastructure Orchestration
 *
 * This stage creates the monitoring infrastructure for an environment,
 * including SNS topics, CloudWatch alarms, and dashboards.
 *
 * ## Deployment Order
 *
 * 1. SnsStack - Creates notification topics
 * 2. AuroraAlarmsStack (if aurora enabled)
 * 3. ValkeyAlarmsStack (if valkey enabled)
 * 4. DashboardStack - Creates CloudWatch dashboard
 *
 * ## Cross-Stage Dependencies
 *
 * This stage depends on:
 * - AppStage for Aurora and Valkey resource identifiers
 * @see lib/stacks/observability/sns-stack.ts
 * @see lib/stacks/observability/aurora-alarms-stack.ts
 * @see lib/stacks/observability/valkey-alarms-stack.ts
 * @see lib/stacks/observability/dashboard-stack.ts
 * @module lib/stages/observability-stage
 */
import * as cdk from "aws-cdk-lib";
import type * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import type { Construct } from "constructs";
import {
  AuroraAlarmsStack,
  type AuroraAlarmsThresholds,
} from "../stacks/observability/aurora-alarms-stack";
import { DashboardStack } from "../stacks/observability/dashboard-stack";
import { SnsStack } from "../stacks/observability/sns-stack";
import {
  ValkeyAlarmsStack,
  type ValkeyAlarmsThresholds,
} from "../stacks/observability/valkey-alarms-stack";
import type { StageEnvironment } from "../types";

/**
 * Configuration properties for ObservabilityStage.
 */
export interface ObservabilityStageProps extends cdk.StageProps {
  /**
   * Stage environment configuration.
   */
  readonly environment: StageEnvironment;

  /**
   * Aurora cluster identifier (if Aurora enabled).
   */
  readonly auroraClusterId?: string;

  /**
   * Valkey replication group ID (if Valkey enabled).
   */
  readonly valkeyReplicationGroupId?: string;

  /**
   * Aurora alarm thresholds.
   */
  readonly auroraThresholds?: AuroraAlarmsThresholds;

  /**
   * Valkey alarm thresholds.
   */
  readonly valkeyThresholds?: ValkeyAlarmsThresholds;
}

/**
 * Observability Stage creating monitoring infrastructure for an environment.
 */
export class ObservabilityStage extends cdk.Stage {
  /**
   * The SNS stack.
   */
  public readonly snsStack: SnsStack;

  /**
   * The Aurora alarms stack (if enabled).
   */
  public readonly auroraAlarmsStack?: AuroraAlarmsStack;

  /**
   * The Valkey alarms stack (if enabled).
   */
  public readonly valkeyAlarmsStack?: ValkeyAlarmsStack;

  /**
   * The dashboard stack (if dashboardEnabled is true in observability config).
   */
  public readonly dashboardStack?: DashboardStack;

  /**
   * Creates a new ObservabilityStage.
   * @param scope - Parent construct
   * @param id - Stage identifier
   * @param props - Stage configuration
   */
  constructor(scope: Construct, id: string, props: ObservabilityStageProps) {
    super(scope, id, props);

    const {
      environment,
      auroraClusterId,
      valkeyReplicationGroupId,
      auroraThresholds,
      valkeyThresholds,
    } = props;
    const { name: stageName, observability } = environment;

    // Create SNS stack for notifications
    this.snsStack = new SnsStack(this, "SnsStack", {
      stageName,
      criticalEmails: [...observability.alarmEmailEndpoints],
      warningEmails: [...observability.alarmEmailEndpoints],
      infoEmails: [],
      stackName: `${stageName}-sns`,
    });

    const allAlarms: cloudwatch.Alarm[] = [];

    // Create Aurora alarms if enabled
    if (auroraClusterId && auroraThresholds) {
      this.auroraAlarmsStack = new AuroraAlarmsStack(
        this,
        "AuroraAlarmsStack",
        {
          stageName,
          clusterIdentifier: auroraClusterId,
          thresholds: auroraThresholds,
          criticalTopic: this.snsStack.criticalTopic,
          warningTopic: this.snsStack.warningTopic,
          stackName: `${stageName}-aurora-alarms`,
        }
      );
      this.auroraAlarmsStack.addDependency(this.snsStack);
      allAlarms.push(...this.auroraAlarmsStack.alarms);
    }

    // Create Valkey alarms if enabled
    if (valkeyReplicationGroupId && valkeyThresholds) {
      this.valkeyAlarmsStack = new ValkeyAlarmsStack(
        this,
        "ValkeyAlarmsStack",
        {
          stageName,
          replicationGroupId: valkeyReplicationGroupId,
          thresholds: valkeyThresholds,
          warningTopic: this.snsStack.warningTopic,
          criticalTopic: this.snsStack.criticalTopic,
          stackName: `${stageName}-valkey-alarms`,
        }
      );
      this.valkeyAlarmsStack.addDependency(this.snsStack);
      allAlarms.push(...this.valkeyAlarmsStack.alarms);
    }

    // Create dashboard if enabled
    if (observability.dashboardEnabled) {
      this.dashboardStack = new DashboardStack(this, "DashboardStack", {
        stageName,
        auroraClusterId,
        valkeyReplicationGroupId,
        alarms: allAlarms,
        stackName: `${stageName}-dashboard`,
      });

      if (this.auroraAlarmsStack) {
        this.dashboardStack.addDependency(this.auroraAlarmsStack);
      }
      if (this.valkeyAlarmsStack) {
        this.dashboardStack.addDependency(this.valkeyAlarmsStack);
      }
    }
  }
}
