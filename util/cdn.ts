/**
 * CDN + WAF Edge Resolution
 *
 * Pure helpers that decide whether a stage's HTTP API is fronted by
 * CloudFront + an AWS WAF WebACL, and derive the hostnames that edge uses.
 * Kept free of CDK constructs so the trigger logic is unit-testable in
 * isolation and shared by both deploy paths (bin/app.ts and the pipeline).
 *
 * ## The trigger
 *
 * The edge is created for a stage when a domain is configured for it AND
 * either the stage is production (automatic — the point of the feature is
 * that WAF arrives with the production domain and cannot be forgotten) or
 * the stage opted in via `features.waf` (non-prod rehearsal, typically
 * staging). With no domain configured the whole feature is a no-op.
 *
 * ## Why the API always lives on a subdomain
 *
 * The edge is created in the STAGE account (per-stage blast-radius
 * isolation), so its public hostname must sit in a hosted zone the stage
 * account can own — a subdomain delegated from the primary zone in the
 * shared/DNS account. A production `useApex` mapping is
 * therefore mapped to a dedicated `api.<domain>` host (the apex stays the
 * marketing surface and cannot be delegated to a stage account); a
 * `subdomain` mapping is used verbatim.
 * @see lib/stacks/edge/cdn-stack.ts - CdnStack (the resolved edge)
 * @see config/domains.ts - Domain configuration and primary-domain lookup
 * @module util/cdn
 */
import type {
  DomainConfig,
  DomainEnvironmentMapping,
  StageEnvironment,
} from "../lib/types";

/**
 * The resolved edge plan for a stage: the public hostname CloudFront serves
 * and the origin hostname the backend maps its HTTP API onto.
 */
export interface ResolvedCdn {
  /**
   * Primary domain name (e.g. "tunnlai.com").
   */
  readonly domainName: string;

  /**
   * Public hostname served by the CloudFront distribution and pointed at it
   * by DNS (e.g. "staging.tunnlai.com" or "api.tunnlai.com").
   */
  readonly publicHost: string;

  /**
   * Origin hostname — a regional API Gateway custom domain the backend
   * attaches its HTTP API stage to via an ApiMapping. CloudFront forwards to
   * it (e.g. "origin.staging.tunnlai.com").
   */
  readonly originHost: string;
}

/**
 * Finds the environment mapping for a stage on the primary domain.
 * @param domainConfig - Domain configuration
 * @param stageName - Stage name (e.g. "production")
 * @returns The mapping and primary domain name, or undefined when no primary
 *   domain is configured or it has no mapping for the stage
 */
export const getPrimaryDomainMappingForStage = (
  domainConfig: DomainConfig,
  stageName: string
): { domainName: string; mapping: DomainEnvironmentMapping } | undefined => {
  const primary = domainConfig.domains.find(d => d.isPrimary);
  const mapping = primary?.environments[stageName];
  if (!primary || !mapping) {
    return undefined;
  }
  return { domainName: primary.name, mapping };
};

/**
 * Whether a stage's HTTP API should be fronted by CloudFront + WAF.
 *
 * True when a primary-domain mapping exists for the stage AND the stage is
 * production (automatic) or opted in via `features.waf` (non-prod). False
 * whenever no domain is configured for the stage — the no-op case.
 * @param environment - Stage environment configuration
 * @param domainConfig - Domain configuration
 * @returns True when the CdnStack should be created for this stage
 */
export const shouldFrontApiWithCloudFront = (
  environment: StageEnvironment,
  domainConfig: DomainConfig
): boolean => {
  const resolved = getPrimaryDomainMappingForStage(
    domainConfig,
    environment.name
  );
  if (!resolved) {
    return false;
  }
  return environment.name === "production" || environment.features.waf === true;
};

/**
 * Finds non-production stages whose `features.waf` is a dead flag — set true
 * but with no edge actually resolved for the stage, so it fronts nothing.
 *
 * Uses the full resolution chain (`resolveCdnForStage`) rather than a bare
 * mapping-exists check, so it also catches an empty mapping (neither
 * `subdomain` nor `useApex`) that has a domain entry but resolves to no host.
 * Production is never dead: it gets the edge automatically from its domain and
 * ignores the flag. Used by config validation to fail fast rather than let the
 * flag rot into a decorative no-op.
 * @param stages - Stage environments to check
 * @param domainConfig - Domain configuration
 * @returns The stages whose waf flag does nothing
 */
export const findDeadWafFlags = (
  stages: readonly StageEnvironment[],
  domainConfig: DomainConfig
): readonly StageEnvironment[] =>
  stages.filter(
    env =>
      env.name !== "production" &&
      env.features.waf === true &&
      !resolveCdnForStage(env, domainConfig)
  );

/**
 * Derives the public API hostname for a stage's domain mapping.
 *
 * A `subdomain` mapping is used verbatim (`sub.domain`); a `useApex` mapping
 * is mapped to a dedicated `api.domain` host (see module docs). Returns
 * undefined for a mapping that sets neither.
 * @param domainName - Primary domain name
 * @param mapping - The stage's environment mapping
 * @returns The public hostname, or undefined when the mapping is empty
 */
export const resolvePublicApiHost = (
  domainName: string,
  mapping: DomainEnvironmentMapping
): string | undefined => {
  if (mapping.subdomain) {
    return `${mapping.subdomain}.${domainName}`;
  }
  if (mapping.useApex) {
    return `api.${domainName}`;
  }
  return undefined;
};

/**
 * Derives the origin hostname (regional API Gateway custom domain) from the
 * public hostname.
 * @param publicHost - The public hostname CloudFront serves
 * @returns The origin hostname
 */
export const resolveOriginHost = (publicHost: string): string =>
  `origin.${publicHost}`;

/**
 * Resolves the full edge plan for a stage, or undefined when the stage gets
 * no edge (no domain, or a non-prod stage that did not opt in, or a mapping
 * that resolves to no host).
 * @param environment - Stage environment configuration
 * @param domainConfig - Domain configuration
 * @returns The resolved edge plan, or undefined for the no-op case
 */
export const resolveCdnForStage = (
  environment: StageEnvironment,
  domainConfig: DomainConfig
): ResolvedCdn | undefined => {
  if (!shouldFrontApiWithCloudFront(environment, domainConfig)) {
    return undefined;
  }
  const resolved = getPrimaryDomainMappingForStage(
    domainConfig,
    environment.name
  );
  if (!resolved) {
    return undefined;
  }
  const publicHost = resolvePublicApiHost(
    resolved.domainName,
    resolved.mapping
  );
  if (!publicHost) {
    return undefined;
  }
  return {
    domainName: resolved.domainName,
    publicHost,
    originHost: resolveOriginHost(publicHost),
  };
};
