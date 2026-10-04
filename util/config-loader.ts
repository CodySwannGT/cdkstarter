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
import { getDnsDelegations } from "./dns-delegation";
import { validateAmplifyHosting } from "./amplify-hosting";
import { validateAuroraConfig } from "./aurora-config";
import { agentOperationsConfig } from "../config/agent-operations";
import { domainConfig } from "../config/domains";
import { stageEnvironments, supportEnvironments } from "../config/environments";
import { githubConfig } from "../config/github";
import { alarmThresholds, dashboardWidgets } from "../config/observability";
import { findDeadWafFlags, resolveCdnForStage } from "./cdn";
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
 * A deployable account ID contains exactly 12 decimal digits.
 * This is used to filter environments for actual deployment while allowing
 * PLACEHOLDER values during synth for template validation.
 * @param accountId - The account ID to check
 * @returns True if the account ID is deployable
 */
export const isDeployableAccountId = (accountId: string): boolean =>
  /^\d{12}$/.test(accountId);

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
 * 4. Network-dependent features require `features.network`
 * 5. Amplify Hosting requires an `amplifyHosting` configuration block
 * 6. Observability extras must be coherent: a canary interval requires
 *    canary URLs, and a Sentry DSN must be a valid URL
 *
 * Call this function at CDK app startup to fail fast on configuration errors.
 * @param input - Complete configuration, defaulting to the checked-in files
 * @param input.stages - Stage environments to validate
 * @param input.supports - Shared environments to validate
 * @param input.dashboardWidgets - Reserved custom widget selections
 * @throws ConfigurationError if validation fails
 */
export const validateConfiguration = (
  input: {
    stages: readonly StageEnvironment[];
    supports: readonly SupportEnvironment[];
    dashboardWidgets: DashboardWidgets;
  } = {
    stages: stageEnvironments,
    supports: supportEnvironments,
    dashboardWidgets,
  }
): void => {
  validateEnvironmentContracts(
    input.stages,
    input.supports,
    input.dashboardWidgets
  );
  getDnsDelegations(domainConfig, input.stages);
  validatePrimaryDomain();
  validateWafFlag(input.stages);
  validateEdgeRegions(input.stages);
  validateNetworkDependencies(input.stages);
  validateAmplifyHostingFlag(input.stages);
  input.stages.forEach(stage => {
    if (stage.amplifyHosting) validateAmplifyHosting(stage.amplifyHosting);
  });
  validateObservabilityExtras(input.stages);
};

/**
 * Finds incoherent optional observability fields across stage environments.
 *
 * `canaryIntervalMinutes` without `canaryUrls` is a dead setting (nothing
 * would probe), and a malformed `sentryDsn` would only fail at runtime
 * inside the forwarder Lambda — both are cheaper to catch at synth.
 * @param environments - Stage environments to inspect
 * @returns One error message per incoherent field, empty when all valid
 */
export const findObservabilityConfigErrors = (
  environments: readonly StageEnvironment[]
): string[] =>
  environments.flatMap(env => {
    const {
      canaryUrls,
      canaryIntervalMinutes,
      sentryDsn,
      backupFailureAlerts,
      costAnomalyThresholdUsd,
    } = env.observability;
    return [
      ...(canaryIntervalMinutes !== undefined && !canaryUrls?.length
        ? [
            `Stage "${env.name}" sets observability.canaryIntervalMinutes ` +
              "but no canaryUrls. Add canaryUrls or remove the interval.",
          ]
        : []),
      ...(sentryDsn !== undefined && !URL.canParse(sentryDsn)
        ? [
            `Stage "${env.name}" has an invalid observability.sentryDsn — ` +
              "expected a URL like https://<key>@<org>.ingest.sentry.io/<project>.",
          ]
        : []),
      ...(backupFailureAlerts && sentryDsn === undefined
        ? [
            `Stage "${env.name}" sets observability.backupFailureAlerts but ` +
              "no sentryDsn — the events ride the Sentry forwarder. Add " +
              "sentryDsn or remove the flag.",
          ]
        : []),
      ...(costAnomalyThresholdUsd !== undefined && costAnomalyThresholdUsd <= 0
        ? [
            `Stage "${env.name}" sets a non-positive ` +
              "observability.costAnomalyThresholdUsd — use a positive USD " +
              "amount or omit to disable.",
          ]
        : []),
    ];
  });

/**
 * Validates the optional observability fields on each stage environment.
 * @param stages - Stage environments to inspect
 * @throws ConfigurationError if an observability field is incoherent
 */
const validateObservabilityExtras = (
  stages: readonly StageEnvironment[]
): void => {
  const errors = findObservabilityConfigErrors(stages);
  if (errors.length > 0) {
    throw new ConfigurationError(errors.join(" "));
  }
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
 * Validate the supported feature paths for one stage.
 * @param env - Stage configuration to validate
 */
const validateStageFeatures = (env: StageEnvironment): void => {
  if (env.features.aurora) validateAuroraConfig(env.aurora);
  if (env.features.shieldAdvanced) {
    throw new ConfigurationError(
      `Stage "${env.name}" shieldAdvanced is unsupported; disable it until Shield resources are implemented.`
    );
  }
  if (
    env.disasterRecovery?.enableCrossRegionReplica ||
    env.disasterRecovery?.enableCrossRegionBackup
  ) {
    throw new ConfigurationError(
      `Stage "${env.name}" disasterRecovery is unsupported; disable cross-region replica and backup settings.`
    );
  }
  if (env.features.xray && !(env.features.aurora && env.features.cognito)) {
    throw new ConfigurationError(
      `Stage "${env.name}" xray requires Aurora and Cognito to create the application execution role; disable xray for this path.`
    );
  }
};

/**
 * Parse an aligned IPv4 VPC range for overlap detection.
 * @param env - Stage with networking enabled
 * @returns Inclusive address range with its environment name
 */
const vpcRange = (
  env: StageEnvironment
): { name: string; start: number; end: number } => {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(
    env.network.vpcCidr
  );
  const octets = match?.slice(1, 5).map(Number);
  const prefix = Number(match?.[5]);
  const address = octets?.reduce((value, octet) => value * 256 + octet, 0);
  const size = 2 ** (32 - prefix);
  if (
    !octets ||
    octets.some(octet => octet > 255) ||
    prefix < 16 ||
    prefix > 28 ||
    address === undefined ||
    address % size !== 0
  ) {
    throw new ConfigurationError(
      `Stage "${env.name}" requires a valid IPv4 VPC CIDR with an aligned network address and prefix /16 through /28.`
    );
  }
  return { name: env.name, start: address, end: address + size - 1 };
};

/**
 * Validate configuration identities, address ranges and implemented features.
 * @param stages - All configured stage environments
 * @param supports - All configured shared environments
 * @param widgets - Reserved custom widget selections
 */
const validateEnvironmentContracts = (
  stages: readonly StageEnvironment[],
  supports: readonly SupportEnvironment[],
  widgets: DashboardWidgets
): void => {
  if (supports.length > 1) {
    throw new ConfigurationError(
      "Configure at most one support environment; multiple support environments are unsupported."
    );
  }
  const environments = [...stages, ...supports];
  const names = environments.map(env => env.name);
  for (const [index, env] of environments.entries()) {
    if (names.indexOf(env.name) !== index) {
      throw new ConfigurationError(
        `Duplicate environment name "${env.name}"; use unique names.`
      );
    }
    if (
      env.accountId !== "PLACEHOLDER" &&
      !isDeployableAccountId(env.accountId)
    ) {
      throw new ConfigurationError(
        `Environment "${env.name}" accountId must contain exactly 12 digits or the exact PLACEHOLDER sentinel.`
      );
    }
  }
  const ranges = stages
    .filter(env => env.features.network !== false)
    .map(vpcRange);
  stages.forEach(validateStageFeatures);
  for (const [index, range] of ranges.entries()) {
    const other = ranges
      .slice(index + 1)
      .find(
        candidate =>
          range.start <= candidate.end && candidate.start <= range.end
      );
    if (other) {
      throw new ConfigurationError(
        `Stages "${other.name}" and "${range.name}" have overlapping VPC CIDRs; configure disjoint ranges for peering.`
      );
    }
  }
  if (Object.values(widgets).some(selection => selection.length > 0)) {
    throw new ConfigurationError(
      "Custom dashboardWidgets selections are unsupported; leave every list empty and use the built-in dashboardEnabled metrics."
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
 * @param stages - Stage environments to inspect
 *
 * The `waf` flag only fronts a non-prod stage with CloudFront + WAF when a
 * domain is also configured for that stage; with no domain mapping the flag
 * is inert. Rejecting that combination keeps the flag from rotting into a
 * decorative no-op. Production is exempt: it gets the edge automatically from
 * its domain and ignores the flag.
 * @throws ConfigurationError if a non-prod stage sets waf without a domain
 */
const validateWafFlag = (stages: readonly StageEnvironment[]): void => {
  const dead = findDeadWafFlags(stages, domainConfig);

  if (dead.length > 0) {
    throw new ConfigurationError(
      `features.waf is set on ${dead.map(e => e.name).join(", ")} but no ` +
        "usable domain mapping is configured for those stages (missing, or " +
        "empty — neither subdomain nor useApex), so the flag does nothing. " +
        "Configure a domain mapping for the stage (config/domains.ts) or set " +
        "waf: false."
    );
  }
};

/**
 * Reject effective CloudFront edges outside the region required by their WAF.
 * Production activates from its domain even when the waf flag is false.
 * @param stages - Stage environments to inspect
 */
const validateEdgeRegions = (stages: readonly StageEnvironment[]): void => {
  for (const stage of stages) {
    if (
      resolveCdnForStage(stage, domainConfig) &&
      stage.region !== "us-east-1"
    ) {
      throw new ConfigurationError(
        `Stage "${stage.name}" in "${stage.region}" enables CloudFront WAF; ` +
          "this edge requires us-east-1. Set the stage region to us-east-1 " +
          "or remove its effective edge configuration. Regional stages " +
          "without an edge may use other regions."
      );
    }
  }
};

/**
 * Returns stages that disable networking while enabling a feature that must
 * run inside a VPC.
 * @param stages - Stage environments to inspect
 * @returns Invalid stage environments
 */
export const findNetworkDependencyViolations = (
  stages: readonly StageEnvironment[]
): readonly StageEnvironment[] =>
  stages.filter(
    environment =>
      environment.features.network === false &&
      (environment.features.aurora ||
        environment.features.valkey ||
        environment.features.ssmRelay ||
        environment.features.migrationRunner)
  );

/**
 * Validates dependencies on the optional network layer.
 * @param stages - Stage environments to inspect
 */
const validateNetworkDependencies = (
  stages: readonly StageEnvironment[]
): void => {
  const invalid = findNetworkDependencyViolations(stages);
  if (invalid.length === 0) {
    return;
  }

  throw new ConfigurationError(
    `features.network is false on ${invalid.map(e => e.name).join(", ")} ` +
      "while Aurora, Valkey, the SSM relay, or the migration runner is " +
      "enabled. Disable those network-dependent features or enable networking."
  );
};

/**
 * Returns stages that enable Amplify Hosting without its required repository
 * and build configuration.
 * @param stages - Stage environments to inspect
 * @returns Invalid stage environments
 */
export const findDeadAmplifyHostingFlags = (
  stages: readonly StageEnvironment[]
): readonly StageEnvironment[] =>
  stages.filter(
    environment =>
      environment.features.amplifyHosting === true &&
      !environment.amplifyHosting
  );

/**
 * Validates the optional Amplify Hosting feature.
 * @param stages - Stage environments to inspect
 */
const validateAmplifyHostingFlag = (
  stages: readonly StageEnvironment[]
): void => {
  const invalid = findDeadAmplifyHostingFlags(stages);
  if (invalid.length === 0) {
    return;
  }

  throw new ConfigurationError(
    `features.amplifyHosting is true on ${invalid
      .map(e => e.name)
      .join(", ")} but no amplifyHosting configuration block is present.`
  );
};
