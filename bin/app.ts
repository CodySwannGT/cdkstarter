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
 * - `config/github.ts` - GitHub/CodeConnections integration (optional)
 * - `config/agent-operations.ts` - Headless agent IAM kit (optional)
 *
 * ## Deploy Modes
 *
 * **Pipeline mode** — chosen when the shared environment is deployable, its
 * `purpose.pipeline` flag is set, and a real CodeConnections connection ARN
 * is configured. A single self-mutating CDK Pipeline (in the shared account)
 * deploys everything: pushes to the configured branch roll out to every
 * environment in order, with approval gates at environment boundaries.
 *
 * **Direct mode** — otherwise. Stages are instantiated directly and deployed
 * with `cdk deploy` (typically from CI such as GitHub Actions). Only
 * environments with valid (non-PLACEHOLDER) account IDs are created.
 * @see config/environments.ts
 * @see lib/stacks/support/pipeline-stack.ts - Pipeline mode
 * @module bin/app
 */
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { agentOperationsConfig } from "../config/agent-operations";
import { domainConfig } from "../config/domains";
import { env } from "../config/env";
import { environments } from "../config/environments";
import { githubConfig } from "../config/github";
import { alarmThresholds } from "../config/observability";
import { PipelineStack } from "../lib/stacks/support/pipeline-stack";
import { AgentOperationsStage } from "../lib/stages/agent-operations-stage";
import { AppStage } from "../lib/stages/app-stage";
import { CicdStage } from "../lib/stages/cicd-stage";
import { NetworkStage } from "../lib/stages/network-stage";
import { ObservabilityStage } from "../lib/stages/observability-stage";
import { SupportStage } from "../lib/stages/support-stage";
import type { StageEnvironment, SupportEnvironment } from "../lib/types";
import {
  toAuroraAlarmsThresholds,
  toValkeyAlarmsThresholds,
} from "../util/alarm-threshold-mapping";
import {
  isCodeConnectionConfigured,
  isDeployableAccountId,
  loadDeployableEnvironments,
  validateConfiguration,
} from "../util/config-loader";

const app = new cdk.App();

// Fail fast on configuration errors (duplicate CIDRs, invalid primary domain)
validateConfiguration();

// Load only environments with valid account IDs
const deployableStages = loadDeployableEnvironments(environments);
const supportEnv = environments.support[0];
const supportDeployable =
  supportEnv !== undefined && isDeployableAccountId(supportEnv.accountId);

if (deployableStages.length === 0) {
  console.log(
    "No deployable environments found. Configure account IDs in config/environments.ts"
  );
}

const pipelineMode =
  supportDeployable &&
  supportEnv.purpose.pipeline &&
  isCodeConnectionConfigured();

/**
 * Creates the direct-mode stages for one environment
 * (network, app, observability, and optional CI/CD).
 * @param environment - Stage environment configuration
 */
const createDirectStages = (environment: StageEnvironment): void => {
  const stageName = environment.name;
  const stageEnv = {
    account: environment.accountId,
    region: environment.region,
  };

  // Network stage - VPC, security groups, SSM relay, migration runner
  const networkStage = new NetworkStage(app, `${stageName}-network`, {
    environment,
    github: githubConfig,
    env: stageEnv,
  });

  // App stage - databases, cache, auth, backup
  new AppStage(app, `${stageName}-app`, {
    environment,
    vpc: networkStage.vpcStack.vpc,
    auroraSecurityGroup: networkStage.securityGroupsStack.auroraSecurityGroup,
    valkeySecurityGroup: networkStage.securityGroupsStack.valkeySecurityGroup,
    env: stageEnv,
  });

  // Observability stage - monitoring and alerting
  new ObservabilityStage(app, `${stageName}-observability`, {
    environment,
    auroraClusterId: environment.features.aurora
      ? `${stageName}-aurora-cluster`
      : undefined,
    valkeyReplicationGroupId: environment.features.valkey
      ? `${stageName}-valkey`
      : undefined,
    auroraThresholds: environment.features.aurora
      ? toAuroraAlarmsThresholds(alarmThresholds)
      : undefined,
    valkeyThresholds: environment.features.valkey
      ? toValkeyAlarmsThresholds(alarmThresholds)
      : undefined,
    env: stageEnv,
  });

  // CI/CD stage - GitHub Actions OIDC deploy role + bootstrap trust
  if (environment.features.githubOidcDeploy && supportDeployable) {
    new CicdStage(app, `${stageName}-cicd`, {
      environment,
      github: githubConfig,
      sharedAccountId: supportEnv.accountId,
      bootstrapQualifier: env.CDK_BOOTSTRAP_QUALIFIER,
      env: stageEnv,
    });
  }

  console.log(`Created infrastructure for ${stageName} environment`);
};

/**
 * Creates the direct-mode shared account stages (support + agent operations).
 * @param sharedEnvironment - The deployable shared environment
 */
const createSharedStages = (sharedEnvironment: SupportEnvironment): void => {
  new SupportStage(app, `${sharedEnvironment.name}-support`, {
    supportEnvironment: sharedEnvironment,
    domainConfig,
    deployableEnvironments: deployableStages,
    bootstrapQualifier: env.CDK_BOOTSTRAP_QUALIFIER,
    executionPolicyArn: env.CDK_BOOTSTRAP_EXECUTION_POLICY_ARN,
    github: githubConfig,
    codeConnectionConfigured: isCodeConnectionConfigured(),
    env: {
      account: sharedEnvironment.accountId,
      region: sharedEnvironment.region,
    },
  });

  if (agentOperationsConfig.enabled && env.AGENT_OPERATIONS_EXTERNAL_ID) {
    new AgentOperationsStage(app, "agent-operations", {
      agentOperations: agentOperationsConfig,
      externalId: env.AGENT_OPERATIONS_EXTERNAL_ID,
      stageEnvironments: deployableStages,
      sharedEnvironment,
    });
  }

  console.log(
    `Created infrastructure for ${sharedEnvironment.name} environment`
  );
};

if (pipelineMode) {
  // Pipeline mode: one self-mutating pipeline in the shared account
  // contains every stage; deploy the pipeline once, then push to deploy.
  new PipelineStack(app, "PipelineStack", {
    github: githubConfig,
    stageEnvironments: deployableStages,
    supportEnvironment: supportEnv,
    domainConfig,
    alarmThresholds,
    bootstrapQualifier: env.CDK_BOOTSTRAP_QUALIFIER,
    executionPolicyArn: env.CDK_BOOTSTRAP_EXECUTION_POLICY_ARN,
    agentOperations: agentOperationsConfig,
    agentOperationsExternalId: env.AGENT_OPERATIONS_EXTERNAL_ID,
    env: { account: supportEnv.accountId, region: supportEnv.region },
  });

  console.log("Created CDK Pipeline (pipeline mode)");
} else {
  // Direct mode: instantiate stages directly for cdk deploy.
  deployableStages.forEach(createDirectStages);

  if (supportDeployable) {
    createSharedStages(supportEnv);
  }
}

app.synth();
