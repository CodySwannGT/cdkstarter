/**
 * Environment Stage - Complete Per-Environment Composition for the Pipeline
 *
 * Composes EVERYTHING one environment needs — network, application, and
 * observability stacks — inside a single `cdk.Stage`. Used exclusively by
 * the CDK Pipeline (lib/stacks/support/pipeline-stack.ts).
 *
 * ## Why One Stage Per Environment
 *
 * CDK forbids construct references across stage boundaries (each stage is
 * its own cloud assembly). The VPC and security-group objects must therefore
 * be created and consumed within the same stage. One stage per environment
 * is also the canonical CDK Pipelines pattern: pipeline gates (manual
 * approval, permissions-broadening checks) attach at the environment
 * boundary by construction.
 *
 * The direct-deploy entry point (bin/app.ts) instead uses the finer-grained
 * NetworkStage/AppStage/ObservabilityStage split.
 *
 * ## Stack Order
 *
 * 1. VpcStack → SecurityGroupsStack → SsmRelayStack / MigrationRunnerStack
 * 2. CognitoStack / AuroraStack / ValkeyStack / IamStack / BackupStack
 * 3. SnsStack → alarm stacks → DashboardStack
 * @see lib/stacks/support/pipeline-stack.ts - The consuming pipeline
 * @module lib/stages/environment-stage
 */
import * as cdk from "aws-cdk-lib";
import type * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import type { Construct } from "constructs";
import {
  toAuroraAlarmsThresholds,
  toValkeyAlarmsThresholds,
} from "../../util/alarm-threshold-mapping";
import { CognitoStack } from "../stacks/auth/cognito-stack";
import { IamStack } from "../stacks/auth/iam-stack";
import { MigrationRunnerStack } from "../stacks/cicd/migration-runner-stack";
import { AuroraStack } from "../stacks/database/aurora-stack";
import { BackupStack } from "../stacks/database/backup-stack";
import { ValkeyStack } from "../stacks/database/valkey-stack";
import { SecurityGroupsStack } from "../stacks/network/security-groups-stack";
import { SsmRelayStack } from "../stacks/network/ssm-relay-stack";
import { VpcStack } from "../stacks/network/vpc-stack";
import { AuroraAlarmsStack } from "../stacks/observability/aurora-alarms-stack";
import { DashboardStack } from "../stacks/observability/dashboard-stack";
import { SnsStack } from "../stacks/observability/sns-stack";
import { ValkeyAlarmsStack } from "../stacks/observability/valkey-alarms-stack";
import type { AlarmThresholds, GitHubConfig, StageEnvironment } from "../types";

/**
 * Configuration properties for EnvironmentStage.
 */
export interface EnvironmentStageProps extends cdk.StageProps {
  /**
   * Stage environment configuration.
   */
  readonly environment: StageEnvironment;

  /**
   * Alarm thresholds from config/observability.ts.
   */
  readonly alarmThresholds: AlarmThresholds;

  /**
   * GitHub configuration; required when features.migrationRunner is enabled.
   */
  readonly github?: GitHubConfig;
}

/**
 * Environment Stage composing all infrastructure for one environment.
 */
export class EnvironmentStage extends cdk.Stage {
  /**
   * The VPC stack.
   */
  public readonly vpcStack: VpcStack;

  /**
   * The security groups stack.
   */
  public readonly securityGroupsStack: SecurityGroupsStack;

  /**
   * Creates a new EnvironmentStage.
   * @param scope - Parent construct
   * @param id - Stage identifier
   * @param props - Stage configuration
   */
  constructor(scope: Construct, id: string, props: EnvironmentStageProps) {
    super(scope, id, props);

    const { environment, alarmThresholds, github } = props;
    const { name: stageName, features } = environment;

    // --- Network ---------------------------------------------------------
    const natGatewayCount = stageName === "production" ? 2 : 1;
    const enableFlowLogs = stageName !== "dev";

    this.vpcStack = new VpcStack(this, "VpcStack", {
      stageName,
      vpcCidr: environment.network.vpcCidr,
      natGatewayCount,
      enableFlowLogs,
      stackName: `${stageName}-vpc`,
    });

    this.securityGroupsStack = new SecurityGroupsStack(
      this,
      "SecurityGroupsStack",
      {
        stageName,
        vpc: this.vpcStack.vpc,
        createSsmRelaySecurityGroup: features.ssmRelay,
        createMigrationRunnerSecurityGroup: features.migrationRunner,
        stackName: `${stageName}-security-groups`,
      }
    );
    this.securityGroupsStack.addDependency(this.vpcStack);

    if (features.ssmRelay && this.securityGroupsStack.ssmRelaySecurityGroup) {
      const ssmRelayStack = new SsmRelayStack(this, "SsmRelayStack", {
        stageName,
        vpc: this.vpcStack.vpc,
        securityGroup: this.securityGroupsStack.ssmRelaySecurityGroup,
        stackName: `${stageName}-ssm-relay`,
      });
      ssmRelayStack.addDependency(this.securityGroupsStack);
    }

    if (
      features.migrationRunner &&
      github &&
      this.securityGroupsStack.migrationRunnerSecurityGroup
    ) {
      const migrationRunnerStack = new MigrationRunnerStack(
        this,
        "MigrationRunnerStack",
        {
          stageName,
          github,
          vpc: this.vpcStack.vpc,
          securityGroup: this.securityGroupsStack.migrationRunnerSecurityGroup,
          stackName: `${stageName}-migration-runner`,
        }
      );
      migrationRunnerStack.addDependency(this.securityGroupsStack);
    }

    // --- Application -----------------------------------------------------
    this.createApplicationStacks(environment);

    // --- Observability ---------------------------------------------------
    this.createObservabilityStacks(environment, alarmThresholds);
  }

  /**
   * Creates the application stacks (auth, database, cache, backup) per
   * the environment's feature flags.
   * @param environment - Stage environment configuration
   */
  private createApplicationStacks(environment: StageEnvironment): void {
    const { name: stageName, features, aurora, valkey } = environment;

    const cognitoStack = features.cognito
      ? new CognitoStack(this, "CognitoStack", {
          stageName,
          stackName: `${stageName}-cognito`,
        })
      : undefined;

    const auroraStack = features.aurora
      ? new AuroraStack(this, "AuroraStack", {
          stageName,
          vpc: this.vpcStack.vpc,
          securityGroup: this.securityGroupsStack.auroraSecurityGroup,
          aurora,
          stackName: `${stageName}-aurora`,
        })
      : undefined;

    if (features.valkey) {
      new ValkeyStack(this, "ValkeyStack", {
        stageName,
        vpc: this.vpcStack.vpc,
        securityGroup: this.securityGroupsStack.valkeySecurityGroup,
        valkey,
        stackName: `${stageName}-valkey`,
      });
    }

    if (auroraStack && cognitoStack) {
      const iamStack = new IamStack(this, "IamStack", {
        stageName,
        auroraClusterArn: auroraStack.cluster.clusterArn,
        auroraSecretArn: auroraStack.secret.secretArn,
        cognitoUserPoolArn: cognitoStack.userPool.userPoolArn,
        stackName: `${stageName}-iam`,
      });
      iamStack.addDependency(auroraStack);
      iamStack.addDependency(cognitoStack);
    }

    if (features.backup) {
      new BackupStack(this, "BackupStack", {
        stageName,
        stackName: `${stageName}-backup`,
      });
    }
  }

  /**
   * Creates the observability stacks (SNS topics, alarms, dashboard).
   * @param environment - Stage environment configuration
   * @param alarmThresholds - Alarm thresholds from config
   */
  private createObservabilityStacks(
    environment: StageEnvironment,
    alarmThresholds: AlarmThresholds
  ): void {
    const { name: stageName, features, observability } = environment;

    const snsStack = new SnsStack(this, "SnsStack", {
      stageName,
      criticalEmails: [...observability.alarmEmailEndpoints],
      warningEmails: [...observability.alarmEmailEndpoints],
      infoEmails: [],
      stackName: `${stageName}-sns`,
    });

    const allAlarms: cloudwatch.Alarm[] = [];
    const auroraClusterId = features.aurora
      ? `${stageName}-aurora-cluster`
      : undefined;
    const valkeyReplicationGroupId = features.valkey
      ? `${stageName}-valkey`
      : undefined;

    const auroraAlarmsStack = auroraClusterId
      ? new AuroraAlarmsStack(this, "AuroraAlarmsStack", {
          stageName,
          clusterIdentifier: auroraClusterId,
          thresholds: toAuroraAlarmsThresholds(alarmThresholds),
          criticalTopic: snsStack.criticalTopic,
          warningTopic: snsStack.warningTopic,
          stackName: `${stageName}-aurora-alarms`,
        })
      : undefined;
    if (auroraAlarmsStack) {
      auroraAlarmsStack.addDependency(snsStack);
      allAlarms.push(...auroraAlarmsStack.alarms);
    }

    const valkeyAlarmsStack = valkeyReplicationGroupId
      ? new ValkeyAlarmsStack(this, "ValkeyAlarmsStack", {
          stageName,
          replicationGroupId: valkeyReplicationGroupId,
          thresholds: toValkeyAlarmsThresholds(alarmThresholds),
          warningTopic: snsStack.warningTopic,
          criticalTopic: snsStack.criticalTopic,
          stackName: `${stageName}-valkey-alarms`,
        })
      : undefined;
    if (valkeyAlarmsStack) {
      valkeyAlarmsStack.addDependency(snsStack);
      allAlarms.push(...valkeyAlarmsStack.alarms);
    }

    if (observability.dashboardEnabled) {
      const dashboardStack = new DashboardStack(this, "DashboardStack", {
        stageName,
        auroraClusterId,
        valkeyReplicationGroupId,
        alarms: allAlarms,
        stackName: `${stageName}-dashboard`,
      });
      if (auroraAlarmsStack) {
        dashboardStack.addDependency(auroraAlarmsStack);
      }
      if (valkeyAlarmsStack) {
        dashboardStack.addDependency(valkeyAlarmsStack);
      }
    }
  }
}
