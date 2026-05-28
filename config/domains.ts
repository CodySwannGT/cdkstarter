/**
 * Domain Configuration - Optional and Expandable
 *
 * This file defines domain configuration for Route53 hosted zones and
 * ACM certificates. Domain configuration is OPTIONAL - if no domains are
 * configured, DNS-related stacks are simply skipped during deployment.
 *
 * ## Adding/Removing Domains
 *
 * Domains can be added or removed without breaking existing deployments:
 * - Adding a domain: Add to the domains array, deploy
 * - Removing a domain: Remove from array, deploy (cleans up DNS resources)
 *
 * ## Primary Domain
 *
 * Exactly one domain must be marked as `isPrimary: true`. The primary domain
 * is used for:
 * - Main ACM certificate creation
 * - Default API Gateway custom domain
 * - CloudFront distribution aliases
 *
 * ## Environment Mappings
 *
 * Each domain maps environments to either:
 * - `subdomain: "name"` - Creates name.domain.com (e.g., dev.example.com)
 * - `useApex: true` - Uses the root domain (e.g., example.com for production)
 * @see lib/types.ts - DomainConfig, Domain interface definitions
 * @see lib/stacks/support/dns-stack.ts - Route53 hosted zone creation
 * @module config/domains
 */
import type { Domain, DomainConfig } from "../lib/types";

/**
 * Domain configuration defining all domains and their environment mappings.
 *
 * The primary domain (isPrimary: true) is used for main certificate creation
 * and default custom domain routing. Additional domains can be added for
 * vanity URLs, development domains, or regional variations.
 */
export const domainConfig: DomainConfig = {
  domains: [
    {
      name: "example.com",
      isPrimary: true,
      environments: {
        dev: { subdomain: "dev" },
        staging: { subdomain: "staging" },
        production: { useApex: true },
      },
    },
  ],
} as const;

/**
 * Returns the primary domain configuration.
 *
 * The primary domain is used for main ACM certificate creation and serves
 * as the default custom domain for API Gateway. Returns undefined if no
 * domains are configured (allows infrastructure to deploy without DNS).
 * @returns The primary domain, or undefined if no domains configured
 */
export const getPrimaryDomain = (): Domain | undefined =>
  domainConfig.domains.find(d => d.isPrimary);

/**
 * Returns whether any domains are configured.
 *
 * Used by the config loader to determine whether to create DNS-related
 * stacks (Route53 hosted zones, ACM certificates). When false, DNS stacks
 * are skipped entirely, allowing infrastructure to deploy without domains.
 * @returns True if domains array has at least one entry
 */
export const hasDomainsConfigured = (): boolean =>
  domainConfig.domains.length > 0;
