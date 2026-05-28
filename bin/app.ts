#!/usr/bin/env node
/**
 * CDK Infrastructure Entry Point
 *
 * This is the main entry point for the CDK application. It loads configuration
 * from TypeScript files and creates infrastructure stacks for each configured
 * environment.
 *
 * ## Configuration
 *
 * Configuration is loaded from:
 * - `config/environments.ts` - Environment definitions (dev, staging, production)
 * - `config/domains.ts` - Domain configurations (optional)
 * - `config/observability.ts` - Alarm thresholds and dashboard settings
 *
 * ## Environment Filtering
 *
 * Only environments with valid (non-PLACEHOLDER) account IDs are deployed.
 * This allows the CDK app to synth with placeholder values but only deploy
 * configured environments.
 *
 * ## Stack Structure
 *
 * For each stage environment:
 * 1. NetworkStage (VPC, Security Groups)
 * 2. AppStage (Aurora, Valkey, Cognito, IAM)
 * 3. ObservabilityStage (SNS, Alarms, Dashboard)
 * @see config/environments.ts
 * @see config/observability.ts
 * @module bin/app
 */
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { domainConfig } from "../config/domains";
import { env } from "../config/env";
import { environments } from "../config/environments";
import { alarmThresholds } from "../config/observability";
import type { AuroraAlarmsThresholds } from "../lib/stacks/observability/aurora-alarms-stack";
import type { ValkeyAlarmsThresholds } from "../lib/stacks/observability/valkey-alarms-stack";
import { AppStage } from "../lib/stages/app-stage";
import { NetworkStage } from "../lib/stages/network-stage";
import { ObservabilityStage } from "../lib/stages/observability-stage";
import { SupportStage } from "../lib/stages/support-stage";
import {
  loadDeployableEnvironments,
  validateConfiguration,
} from "../util/config-loader";

const app = new cdk.App();

// Fail fast on configuration errors (duplicate CIDRs, invalid primary domain)
validateConfiguration();

// Load only environments with valid account IDs
const deployableStages = loadDeployableEnvironments(environments);

if (deployableStages.length === 0) {
  console.log(
    "No deployable environments found. Configure account IDs in config/environments.ts"
  );
}

// Create stacks for each deployable stage environment
deployableStages.forEach(env => {
  const stageName = env.name;

  // Network stage - VPC and security groups
  const networkStage = new NetworkStage(app, `${stageName}-network`, {
    environment: env,
    env: { account: env.accountId, region: env.region },
  });

  // App stage - databases, cache, auth
  const appStage = new AppStage(app, `${stageName}-app`, {
    environment: env,
    vpc: networkStage.vpcStack.vpc,
    auroraSecurityGroup: networkStage.securityGroupsStack.auroraSecurityGroup,
    valkeySecurityGroup: networkStage.securityGroupsStack.valkeySecurityGroup,
    env: { account: env.accountId, region: env.region },
  });

  // Transform alarm thresholds to match stack prop interfaces
  const auroraThresholds: AuroraAlarmsThresholds = {
    cpuCriticalPercent: alarmThresholds.aurora.cpuCritical,
    cpuWarningPercent: alarmThresholds.aurora.cpuWarning,
    storageCriticalGB: alarmThresholds.aurora.freeStorageCriticalGB,
    storageWarningGB: alarmThresholds.aurora.freeStorageCriticalGB * 2,
    connectionsCritical: alarmThresholds.aurora.connectionsCritical,
    connectionsWarning: alarmThresholds.aurora.connectionsWarning,
    replicationLagMs: alarmThresholds.aurora.replicationLagCriticalMs,
  };

  const valkeyThresholds: ValkeyAlarmsThresholds = {
    cpuWarningPercent: alarmThresholds.valkey.cpuWarning,
    cpuCriticalPercent: alarmThresholds.valkey.cpuCritical,
    cacheHitRateWarningPercent: alarmThresholds.valkey.cacheHitRateWarning,
    cacheHitRateCriticalPercent: alarmThresholds.valkey.cacheHitRateCritical,
    evictionsWarning: alarmThresholds.valkey.evictionsWarning,
    evictionsCritical: alarmThresholds.valkey.evictionsCritical,
  };

  // Observability stage - monitoring and alerting
  const observabilityStage = new ObservabilityStage(
    app,
    `${stageName}-observability`,
    {
      environment: env,
      auroraClusterId: env.features.aurora
        ? `${stageName}-aurora-cluster`
        : undefined,
      valkeyReplicationGroupId: env.features.valkey
        ? `${stageName}-valkey`
        : undefined,
      auroraThresholds: env.features.aurora ? auroraThresholds : undefined,
      valkeyThresholds: env.features.valkey ? valkeyThresholds : undefined,
      env: { account: env.accountId, region: env.region },
    }
  );

  // Log environment creation
  console.log(`Created infrastructure for ${stageName} environment`);
  console.log(`  - Network stage: ${networkStage.stageName}`);
  console.log(`  - App stage: ${appStage.stageName}`);
  console.log(`  - Observability stage: ${observabilityStage.stageName}`);
});

// Support stage - shared account infrastructure (DNS, trust policies, pipeline)
const supportEnv = environments.support[0];
if (supportEnv) {
  const supportStage = new SupportStage(app, `${supportEnv.name}-support`, {
    supportEnvironment: supportEnv,
    domainConfig,
    deployableEnvironments: deployableStages,
    bootstrapQualifier: env.CDK_BOOTSTRAP_QUALIFIER,
    executionPolicyArn: env.CDK_BOOTSTRAP_EXECUTION_POLICY_ARN,
    env: { account: supportEnv.accountId, region: supportEnv.region },
  });

  console.log(`Created infrastructure for ${supportEnv.name} environment`);
  console.log(`  - Support stage: ${supportStage.stageName}`);
}

app.synth();
