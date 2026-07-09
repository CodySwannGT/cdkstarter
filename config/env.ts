/**
 * Type-safe environment variable configuration using Zod validation.
 *
 * This module validates CDK-related environment variables at module load time,
 * providing type-safe access with full TypeScript inference.
 * @remarks
 * - Variables are validated regardless of source (.env, CI/CD)
 * - Add new variables to the schema below, then access via `env.VARIABLE_NAME`
 * @example
 * ```typescript
 * import { env } from "../config/env";
 *
 * const qualifier = env.CDK_BOOTSTRAP_QUALIFIER;
 * ```
 * @module config/env
 */
import { z } from "zod";

/**
 * Default CDK bootstrap qualifier.
 * This is the default value used by CDK if not customized.
 */
const DEFAULT_CDK_BOOTSTRAP_QUALIFIER = "hnb659fds";

/**
 * Default CloudFormation execution policy ARN.
 */
const DEFAULT_EXECUTION_POLICY_ARN =
  "arn:aws:iam::aws:policy/AdministratorAccess";

/**
 * Environment variable schema for CDK configuration.
 * @remarks
 * Add new environment variables here. Use appropriate Zod types:
 * - `z.string()` for required strings
 * - `z.string().optional()` for optional strings
 */
const envSchema = z.object({
  /**
   * CDK bootstrap qualifier for role naming.
   * Used in bootstrap role names: cdk-{qualifier}-{roleName}-{accountId}-{region}
   */
  CDK_BOOTSTRAP_QUALIFIER: z
    .string()
    .optional()
    .default(DEFAULT_CDK_BOOTSTRAP_QUALIFIER),

  /**
   * CloudFormation execution policy ARN for bootstrap.
   * Used when running cdk bootstrap with --cloudformation-execution-policies.
   */
  CDK_BOOTSTRAP_EXECUTION_POLICY_ARN: z
    .string()
    .optional()
    .default(DEFAULT_EXECUTION_POLICY_ARN),

  /**
   * ExternalId required on sts:AssumeRole for the remote-agent roles
   * (confused-deputy protection). Required when agent operations are
   * enabled in config/agent-operations.ts. Generate with:
   * `openssl rand -hex 16`
   */
  AGENT_OPERATIONS_EXTERNAL_ID: z.string().optional(),
});

/**
 * Parses and validates environment variables with helpful error messages.
 * @returns Validated environment configuration
 * @throws Error with formatted message listing all validation failures
 */
function parseEnv(): z.infer<typeof envSchema> {
  // eslint-disable-next-line no-restricted-syntax -- This is the single source of truth for env access
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map(issue => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Environment validation failed:\n${formatted}\n\nCheck your environment configuration.`
    );
  }

  return result.data;
}

/**
 * Validated environment configuration.
 * @remarks
 * Access environment variables through this object for type safety.
 * Validation occurs at module load time - if this module loads,
 * all variables are guaranteed to be valid.
 * @example
 * ```typescript
 * import { env } from "../config/env";
 *
 * const qualifier = env.CDK_BOOTSTRAP_QUALIFIER;
 * ```
 */
export const env = parseEnv();

/**
 * Type representing the validated environment configuration.
 * Use this when typing functions that accept env config.
 */
export type Env = z.infer<typeof envSchema>;
