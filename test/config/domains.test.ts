/**
 * Unit tests for domain configuration.
 *
 * These tests verify the domain configuration structure, ensure exactly
 * one primary domain is defined, and validate the helper functions work
 * correctly for domain lookups.
 *
 * @module test/config/domains.test
 */
import {
  domainConfig,
  getPrimaryDomain,
  hasDomainsConfigured,
} from "../../config/domains";

describe("domains", () => {
  describe("domainConfig", () => {
    it("should export domainConfig", () => {
      expect(domainConfig).toBeDefined();
      expect(domainConfig.domains).toBeDefined();
      expect(Array.isArray(domainConfig.domains)).toBe(true);
    });

    it("should have exactly one primary domain when domains are configured", () => {
      const primaryDomains = domainConfig.domains.filter(d => d.isPrimary);
      if (domainConfig.domains.length > 0) {
        expect(primaryDomains.length).toBe(1);
      }
    });

    it("should have valid environment mappings for each domain", () => {
      domainConfig.domains.forEach(domain => {
        expect(domain.name).toBeDefined();
        expect(typeof domain.name).toBe("string");
        expect(domain.environments).toBeDefined();
      });
    });

    it("should have correct structure for environment mappings", () => {
      const primaryDomain = domainConfig.domains.find(d => d.isPrimary);
      if (primaryDomain) {
        // Check that dev has subdomain
        if (primaryDomain.environments.dev) {
          expect(primaryDomain.environments.dev.subdomain).toBeDefined();
        }
        // Check that production uses apex
        if (primaryDomain.environments.production) {
          expect(primaryDomain.environments.production.useApex).toBe(true);
        }
      }
    });
  });

  describe("getPrimaryDomain", () => {
    it("should return the primary domain when domains are configured", () => {
      const primary = getPrimaryDomain();
      if (domainConfig.domains.length > 0) {
        expect(primary).toBeDefined();
        expect(primary?.isPrimary).toBe(true);
      }
    });

    it("should return a domain with the correct name", () => {
      const primary = getPrimaryDomain();
      if (primary) {
        expect(primary.name).toBe("example.com");
      }
    });
  });

  describe("hasDomainsConfigured", () => {
    it("should return true when domains exist", () => {
      const result = hasDomainsConfigured();
      expect(result).toBe(domainConfig.domains.length > 0);
    });

    it("should return a boolean value", () => {
      const result = hasDomainsConfigured();
      expect(typeof result).toBe("boolean");
    });
  });
});
