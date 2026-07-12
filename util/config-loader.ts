/**
 * Configuration Loader - Unified Access to Infrastructure Configuration
 *
 * This module provides functions to load and validate all infrastructure
 * configuration. It serves as the single entry point for accessing environment,
 * domain, and observability settings throughout the CDK codebase.
 *
 * ## PLACEHOLDER Account ID Handling
 *
 * During development, environments may have "PLACEHOLDER" as their account ID.
 * The loader provides two sets of functions:
 *
 * - `getAllStageEnvironments()` - Returns all environments including PLACEHOLDER
 *   (use for `cdk synth` to validate CloudFormation template generation)
 * - `getDeployableStageEnvironments()` - Returns only environments with valid
 *   account IDs (use for actual deployment)
 *
 * ## Configuration Validation
 *
 * The `validateConfiguration()` function checks critical constraints:
 * - VPC CIDRs must be unique across all stage environments (enables VPC peering)
 * - If domains are configured, exactly one must be marked as primary
 *
 * Call `validateConfiguration()` at CDK app startup to fail fast on
 * configuration errors.
 * @see config/environments.ts - Environment definitions
 * @see config/domains.ts - Domain definitions
 * @see config/observability.ts - Alarm thresholds and dashboard widgets
 * @module util/config-loader
 */
import { agentOperationsConfig } from "../config/agent-operations";
import { domainConfig } from "../config/domains";
import { stageEnvironments, supportEnvironments } from "../config/environments";
import { githubConfig } from "../config/github";
import { alarmThresholds, dashboardWidgets } from "../config/observability";
import { findDeadWafFlags } from "./cdn";
import type {
  AgentOperationsConfig,
  AlarmThresholds,
  DashboardWidgets,
  DomainConfig,
  GitHubConfig,
  StageEnvironment,
  SupportEnvironment,
} from "../lib/types";

/**
 * Error thrown when configuration validation fails.
 *
 * Contains a descriptive message explaining the validation failure and
 * how to resolve it. Catch this error in the CDK app entry point to
 * provide clear feedback to operators.
 */
export class ConfigurationError extends Error {
  /**
   * Creates a new configuration error.
   * @param message - Description of the validation failure
   */
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

/**
 * Checks if an account ID is deployable (not a placeholder).
 *
 * A deployable account ID is a non-empty string that is not "PLACEHOLDER".
 * This is used to filter environments for actual deployment while allowing
 * PLACEHOLDER values during synth for template validation.
 * @param accountId - The account ID to check
 * @returns True if the account ID is deployable
 */
export const isDeployableAccountId = (accountId: string): boolean =>
  accountId !== "PLACEHOLDER" && accountId.length > 0;

/**
 * Returns all stage environments including those with PLACEHOLDER account IDs.
 *
 * Use this function when you need access to all environment configurations,
 * such as during `cdk synth` to validate CloudFormation template generation
 * or for displaying configuration information.
 * @returns All stage environments from config/environments.ts
 */
export const getAllStageEnvironments = (): readonly StageEnvironment[] =>
  stageEnvironments;

/**
 * Returns only stage environments with deployable (non-PLACEHOLDER) account IDs.
 *
 * Use this function when creating actual CDK stacks for deployment. Environments
 * with PLACEHOLDER account IDs are filtered out, preventing deployment attempts
 * to non-existent accounts.
 * @returns Stage environments with valid account IDs
 */
export const getDeployableStageEnvironments = (): readonly StageEnvironment[] =>
  stageEnvironments.filter(env => isDeployableAccountId(env.accountId));

/**
 * Returns all support environments.
 *
 * Support environments host shared infrastructure like the CDK Pipeline,
 * DNS hosted zones, and CodeConnections.
 * @returns All support environments from config/environments.ts
 */
export const getSupportEnvironments = (): readonly SupportEnvironment[] =>
  supportEnvironments;

/**
 * Returns the shared support environment if it has a deployable account ID.
 *
 * The shared environment is required for the CDK Pipeline and DNS management.
 * Returns undefined if the shared environment has a PLACEHOLDER account ID.
 * @returns The shared environment, or undefined if PLACEHOLDER
 */
export const getDeployableSharedEnvironment = ():
  | SupportEnvironment
  | undefined =>
  supportEnvironments.find(
    env => env.name === "shared" && isDeployableAccountId(env.accountId)
  );

/**
 * Returns the domain configuration.
 * @returns Domain configuration from config/domains.ts
 */
export const getDomainConfig = (): DomainConfig => domainConfig;

/**
 * Returns the GitHub integration configuration.
 * @returns GitHub configuration from config/github.ts
 */
export const getGitHubConfig = (): GitHubConfig => githubConfig;

/**
 * Returns the agent operations configuration.
 * @returns Agent operations configuration from config/agent-operations.ts
 */
export const getAgentOperationsConfig = (): AgentOperationsConfig =>
  agentOperationsConfig;

/**
 * Checks if the CodeConnections connection ARN is configured (not a
 * placeholder). Pipeline mode, the migration runner, and the RAM share
 * all require a real connection ARN.
 * @returns True if a real connection ARN is configured
 */
export const isCodeConnectionConfigured = (): boolean =>
  githubConfig.codeConnectionArn !== "PLACEHOLDER" &&
  githubConfig.codeConnectionArn.startsWith("arn:");

/**
 * Returns alarm threshold configuration.
 * @returns Alarm thresholds from config/observability.ts
 */
export const getAlarmThresholds = (): AlarmThresholds => alarmThresholds;

/**
 * Returns dashboard widget configuration.
 * @returns Dashboard widgets from config/observability.ts
 */
export const getDashboardWidgets = (): DashboardWidgets => dashboardWidgets;

/**
 * Validates all configuration and throws ConfigurationError if invalid.
 *
 * Validation rules:
 * 1. VPC CIDRs must be unique across all stage environments to enable
 *    future VPC peering if needed
 * 2. If domains are configured, exactly one must be marked as primary
 * 3. A non-prod stage's `features.waf` must not be a dead flag — it only
 *    does anything when a domain is also configured for that stage
 *
 * Call this function at CDK app startup to fail fast on configuration errors.
 * @throws ConfigurationError if validation fails
 */
export const validateConfiguration = (): void => {
  validateUniqueCidrs();
  validatePrimaryDomain();
  validateWafFlag();
};

/**
 * Loads deployable environments from the environments config.
 * @param config - Environment configuration object with stages
 * @param config.stages - Array of stage environments to filter
 * @returns Array of stage environments with valid account IDs
 */
export const loadDeployableEnvironments = (config: {
  stages: readonly StageEnvironment[];
}): readonly StageEnvironment[] =>
  config.stages.filter(env => isDeployableAccountId(env.accountId));

/**
 * Validates that all VPC CIDRs are unique across stage environments.
 * @throws ConfigurationError if duplicate CIDRs are found
 */
const validateUniqueCidrs = (): void => {
  const cidrs = stageEnvironments.map(env => env.network.vpcCidr);
  const uniqueCidrs = new Set(cidrs);

  if (uniqueCidrs.size !== cidrs.length) {
    const duplicates = cidrs.filter(
      (cidr, index) => cidrs.indexOf(cidr) !== index
    );
    throw new ConfigurationError(
      `Duplicate VPC CIDRs detected: ${duplicates.join(", ")}. ` +
        "Each environment must have a unique CIDR to enable VPC peering."
    );
  }
};

/**
 * Validates that exactly one domain is marked as primary when domains exist.
 * @throws ConfigurationError if multiple or no primary domains found
 */
const validatePrimaryDomain = (): void => {
  if (domainConfig.domains.length === 0) {
    return; // No domains configured is valid
  }

  const primaryDomains = domainConfig.domains.filter(d => d.isPrimary);
  const primaryCount = primaryDomains.length;

  if (primaryCount !== 1) {
    const message =
      primaryCount === 0
        ? "No primary domain configured. When domains are present, exactly one must have isPrimary: true."
        : `Multiple primary domains configured: ${primaryDomains.map(d => d.name).join(", ")}. Only one domain can be marked as isPrimary: true.`;
    throw new ConfigurationError(message);
  }
};

/**
 * Validates that no non-production stage carries a decorative `features.waf`.
 *
 * The `waf` flag only fronts a non-prod stage with CloudFront + WAF when a
 * domain is also configured for that stage; with no domain mapping the flag
 * is inert. Rejecting that combination keeps the flag from rotting into a
 * decorative no-op. Production is exempt: it gets the edge automatically from
 * its domain and ignores the flag.
 * @throws ConfigurationError if a non-prod stage sets waf without a domain
 */
const validateWafFlag = (): void => {
  const dead = findDeadWafFlags(stageEnvironments, domainConfig);

  if (dead.length > 0) {
    throw new ConfigurationError(
      `features.waf is set on ${dead.map(e => e.name).join(", ")} but no ` +
        "domain is configured for those stages, so the flag does nothing. " +
        "Configure a domain mapping for the stage (config/domains.ts) or set " +
        "waf: false."
    );
  }
};
