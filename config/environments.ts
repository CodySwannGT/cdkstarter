/**
 * Environment Configuration - Source of Truth
 *
 * This file defines all AWS environments that the CDK infrastructure
 * will deploy to. It serves as the single source of truth for:
 * - Which AWS accounts exist and their purposes
 * - Resource capacity settings per environment
 * - Feature flags controlling which resources are created
 *
 * ## Environment Types
 *
 * **Stage Environments** (dev, staging, production):
 * Each stage runs in an isolated AWS account for blast radius containment.
 * Issues in dev cannot impact production. Each stage has environment-specific
 * resource sizing optimized for its workload and budget.
 *
 * **Support Environments** (shared):
 * The shared account hosts centralized infrastructure that all stage
 * environments depend on, including the CDK Pipeline, DNS hosted zones,
 * and AWS CodeConnections for GitHub integration.
 *
 * ## PLACEHOLDER Account IDs
 *
 * During development, accountId values are set to "PLACEHOLDER". This allows
 * `cdk synth` to run for testing CloudFormation template generation.
 * Deployment will skip environments with PLACEHOLDER accountIds - only
 * environments with valid 12-digit account IDs will be deployed.
 *
 * ## VPC CIDR Uniqueness
 *
 * IMPORTANT: Each environment MUST have a unique VPC CIDR to enable future
 * VPC peering if needed. The suggested pattern is 10.{env}.0.0/16:
 * - dev: 10.0.0.0/16 (65,536 IPs)
 * - staging: 10.1.0.0/16 (65,536 IPs)
 * - production: 10.2.0.0/16 (65,536 IPs)
 * @see lib/types.ts - TypeScript interface definitions
 * @see util/config-loader.ts - Configuration loading and validation
 * @module config/environments
 */
import type { StageEnvironment, SupportEnvironment } from "../lib/types";

/**
 * Stage environments where application workloads run.
 *
 * Each environment is deployed to an isolated AWS account, providing:
 * - Blast radius containment (dev issues cannot impact production)
 * - Independent scaling and resource allocation
 * - Environment-specific security policies
 * - Separate billing and cost tracking
 */
export const stageEnvironments: readonly StageEnvironment[] = [
  {
    type: "stage",
    name: "dev",
    accountId: "PLACEHOLDER",
    region: "us-east-1",
    features: {
      aurora: true,
      valkey: true,
      cognito: true,
      xray: true,
      waf: false,
      shieldAdvanced: false,
      backup: false,
      ssmRelay: true,
      githubOidcDeploy: true,
      migrationRunner: false,
    },
    aurora: {
      minCapacity: 0.5,
      maxCapacity: 2,
      instanceCount: 1,
      deletionProtection: false,
      backupRetentionDays: 1,
      logRetentionDays: 3,
    },
    valkey: {
      nodeType: "cache.t4g.micro",
      numCacheNodes: 1,
    },
    network: {
      vpcCidr: "10.0.0.0/16",
      vpcEndpoints: ["s3", "dynamodb"],
    },
    observability: {
      alarmEmailEndpoints: [],
      dashboardEnabled: false,
      detailedMonitoring: false,
      logRetentionDays: 3,
    },
    deployment: {
      requireManualApproval: false,
    },
  },
  {
    type: "stage",
    name: "staging",
    accountId: "PLACEHOLDER",
    region: "us-east-1",
    features: {
      aurora: true,
      valkey: true,
      cognito: true,
      xray: true,
      waf: false,
      shieldAdvanced: false,
      backup: true,
      ssmRelay: true,
      githubOidcDeploy: true,
      migrationRunner: false,
    },
    aurora: {
      minCapacity: 1,
      maxCapacity: 8,
      instanceCount: 2,
      deletionProtection: true,
      backupRetentionDays: 7,
      logRetentionDays: 30,
    },
    valkey: {
      nodeType: "cache.t4g.small",
      numCacheNodes: 2,
    },
    network: {
      vpcCidr: "10.1.0.0/16",
      vpcEndpoints: ["s3", "dynamodb"],
    },
    observability: {
      alarmEmailEndpoints: ["alerts@example.com"],
      dashboardEnabled: true,
      detailedMonitoring: true,
      logRetentionDays: 30,
    },
    deployment: {
      requireManualApproval: false,
    },
  },
  {
    type: "stage",
    name: "production",
    accountId: "PLACEHOLDER",
    region: "us-east-1",
    features: {
      aurora: true,
      valkey: true,
      cognito: true,
      xray: true,
      waf: false,
      shieldAdvanced: false,
      backup: true,
      ssmRelay: true,
      githubOidcDeploy: true,
      migrationRunner: false,
    },
    aurora: {
      minCapacity: 2,
      maxCapacity: 64,
      instanceCount: 2,
      deletionProtection: true,
      backupRetentionDays: 35,
      logRetentionDays: 365,
    },
    valkey: {
      nodeType: "cache.r7g.large",
      numCacheNodes: 2,
    },
    network: {
      vpcCidr: "10.2.0.0/16",
      vpcEndpoints: ["s3", "dynamodb"],
    },
    observability: {
      alarmEmailEndpoints: ["alerts@example.com", "oncall@example.com"],
      dashboardEnabled: true,
      detailedMonitoring: true,
      logRetentionDays: 365,
    },
    deployment: {
      requireManualApproval: true,
    },
    disasterRecovery: {
      enableCrossRegionReplica: false,
      secondaryRegion: "us-west-2",
      enableCrossRegionBackup: false,
    },
  },
] as const;

/**
 * Support environments hosting shared infrastructure.
 *
 * The shared account provides centralized resources that all stage
 * environments depend on. This enables:
 * - Single CDK Pipeline that deploys to all stage accounts
 * - Centralized DNS management with Route53 hosted zones
 * - Shared AWS CodeConnections for GitHub repository access
 */
export const supportEnvironments: readonly SupportEnvironment[] = [
  {
    type: "support",
    name: "shared",
    accountId: "PLACEHOLDER",
    region: "us-east-1",
    purpose: {
      pipeline: true,
      dns: true,
      codeConnections: true,
      flowLogs: true,
    },
  },
] as const;

/**
 * Combined environments configuration export.
 * Used by the entry point to load all environments at once.
 */
export const environments = {
  stages: stageEnvironments,
  support: supportEnvironments,
} as const;
