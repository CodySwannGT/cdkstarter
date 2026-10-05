/** Validate caller-defined GraphQL monitoring without backend defaults. */
import type { GraphqlMonitoringConfig } from "../lib/types";

const boundedText = (value: string, maximum: number): boolean =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= maximum &&
  value.trim() === value &&
  !/[\u0000-\u001f\u007f]/.test(value);
const validPair = (
  pair: { readonly warning: number; readonly critical: number },
  maximum = Infinity
): boolean =>
  !!pair &&
  Number.isFinite(pair.warning) &&
  Number.isFinite(pair.critical) &&
  pair.warning >= 0 &&
  pair.warning < pair.critical &&
  pair.critical <= maximum;

/**
 * Reject ambiguous manifests and incoherent thresholds before synthesis.
 * @param config - Optional caller configuration
 * @returns Enabled configuration, or undefined for absent/disabled monitoring
 */
export const validateGraphqlMonitoring = (
  config?: GraphqlMonitoringConfig
): GraphqlMonitoringConfig | undefined => {
  if (config?.enabled !== true) return undefined;
  if (
    !boundedText(config.namespace, 255) ||
    config.namespace.startsWith("AWS/")
  )
    throw new Error(
      "graphqlMonitoring.namespace must be a nonempty custom CloudWatch namespace (maximum 255 characters, no control characters or AWS/ prefix)."
    );
  if (!boundedText(config.stageDimension, 255))
    throw new Error(
      "graphqlMonitoring.stageDimension must be the explicit nonempty Stage dimension (maximum 255 characters)."
    );
  if (
    !Number.isInteger(config.minimumInvocations) ||
    config.minimumInvocations <= 0
  )
    throw new Error(
      "graphqlMonitoring.minimumInvocations must be a positive integer."
    );
  if (!validPair(config.errorRatePercent, 100))
    throw new Error(
      "graphqlMonitoring.errorRatePercent requires finite 0..100 percentages with warning strictly below critical."
    );
  if (!validPair(config.latencyMilliseconds))
    throw new Error(
      "graphqlMonitoring.latencyMilliseconds requires finite nonnegative millisecond values with warning strictly below critical."
    );
  if (!["Average", "Maximum", "p95", "p99"].includes(config.latencyStatistic))
    throw new Error(
      "graphqlMonitoring.latencyStatistic must be Average, Maximum, p95 or p99."
    );
  if (!Array.isArray(config.operations) || config.operations.length === 0)
    throw new Error(
      "graphqlMonitoring.operations must explicitly list at least one operation."
    );
  for (const operation of config.operations) {
    if (
      !/^[_A-Za-z]\w{0,127}$/.test(operation.name) ||
      !["query", "mutation"].includes(operation.type) ||
      typeof operation.public !== "boolean"
    )
      throw new Error(
        "graphqlMonitoring.operations requires a valid GraphQL name, query/mutation type and explicit public boolean."
      );
  }
  if (
    new Set(
      config.operations.map(operation => `${operation.type}:${operation.name}`)
    ).size !== config.operations.length
  )
    throw new Error(
      "graphqlMonitoring.operations must have unique operation name/type definitions; duplicate operations are not allowed."
    );
  return config;
};
