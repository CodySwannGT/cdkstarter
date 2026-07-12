/**
 * Unit tests for the CDN + WAF edge resolution helpers.
 *
 * Covers the trigger truth table (domain × stage × waf flag), the public /
 * origin host derivation (subdomain verbatim, apex → api.*), and the
 * dead-flag detection used by config validation.
 *
 * @module test/util/cdn.test
 */
import {
  findDeadWafFlags,
  getPrimaryDomainMappingForStage,
  resolveCdnForStage,
  resolveOriginHost,
  resolvePublicApiHost,
  shouldFrontApiWithCloudFront,
} from "../../util/cdn";
import type {
  DomainConfig,
  StageEnvironment,
  StageFeatures,
} from "../../lib/types";

const features = (waf: boolean): StageFeatures => ({
  aurora: true,
  valkey: true,
  cognito: true,
  xray: true,
  waf,
  shieldAdvanced: false,
  backup: false,
  ssmRelay: false,
  githubOidcDeploy: false,
  migrationRunner: false,
});

const stage = (name: string, waf = false): StageEnvironment => ({
  type: "stage",
  name,
  accountId: "123456789012",
  region: "us-east-1",
  features: features(waf),
  aurora: {
    minCapacity: 0.5,
    maxCapacity: 2,
    instanceCount: 1,
    deletionProtection: false,
    backupRetentionDays: 1,
    logRetentionDays: 3,
  },
  valkey: { nodeType: "cache.t4g.micro", numCacheNodes: 1 },
  network: { vpcCidr: "10.0.0.0/16" },
  observability: {
    alarmEmailEndpoints: [],
    dashboardEnabled: false,
    detailedMonitoring: false,
    logRetentionDays: 3,
  },
  deployment: { requireManualApproval: false },
});

const noDomains: DomainConfig = { domains: [] };

const withDomains: DomainConfig = {
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
};

describe("cdn helpers", () => {
  describe("getPrimaryDomainMappingForStage", () => {
    it("returns undefined when no domains are configured", () => {
      expect(
        getPrimaryDomainMappingForStage(noDomains, "production")
      ).toBeUndefined();
    });

    it("returns undefined for a stage the primary domain does not map", () => {
      expect(
        getPrimaryDomainMappingForStage(withDomains, "sandbox")
      ).toBeUndefined();
    });

    it("returns the mapping and domain name for a mapped stage", () => {
      expect(getPrimaryDomainMappingForStage(withDomains, "staging")).toEqual({
        domainName: "example.com",
        mapping: { subdomain: "staging" },
      });
    });
  });

  describe("shouldFrontApiWithCloudFront (trigger truth table)", () => {
    it("is false for every stage when no domain is configured", () => {
      expect(shouldFrontApiWithCloudFront(stage("production"), noDomains)).toBe(
        false
      );
      expect(
        shouldFrontApiWithCloudFront(stage("staging", true), noDomains)
      ).toBe(false);
    });

    it("is true for production with a domain regardless of the flag", () => {
      expect(
        shouldFrontApiWithCloudFront(stage("production", false), withDomains)
      ).toBe(true);
    });

    it("is true for a non-prod stage with a domain and waf:true", () => {
      expect(
        shouldFrontApiWithCloudFront(stage("staging", true), withDomains)
      ).toBe(true);
    });

    it("is false for a non-prod stage with a domain but waf:false", () => {
      expect(
        shouldFrontApiWithCloudFront(stage("staging", false), withDomains)
      ).toBe(false);
    });
  });

  describe("host derivation", () => {
    it("uses a subdomain mapping verbatim", () => {
      expect(
        resolvePublicApiHost("example.com", { subdomain: "staging" })
      ).toBe("staging.example.com");
    });

    it("maps an apex mapping to a dedicated api.* host", () => {
      expect(resolvePublicApiHost("example.com", { useApex: true })).toBe(
        "api.example.com"
      );
    });

    it("returns undefined for an empty mapping", () => {
      expect(resolvePublicApiHost("example.com", {})).toBeUndefined();
    });

    it("prefixes the origin host with origin.", () => {
      expect(resolveOriginHost("api.example.com")).toBe(
        "origin.api.example.com"
      );
    });
  });

  describe("resolveCdnForStage", () => {
    it("returns undefined for the no-op (no domain) case", () => {
      expect(
        resolveCdnForStage(stage("production"), noDomains)
      ).toBeUndefined();
    });

    it("resolves production apex to api.* public and origin hosts", () => {
      expect(resolveCdnForStage(stage("production"), withDomains)).toEqual({
        domainName: "example.com",
        publicHost: "api.example.com",
        originHost: "origin.api.example.com",
      });
    });

    it("resolves a rehearsing non-prod stage to its subdomain host", () => {
      expect(resolveCdnForStage(stage("staging", true), withDomains)).toEqual({
        domainName: "example.com",
        publicHost: "staging.example.com",
        originHost: "origin.staging.example.com",
      });
    });

    it("returns undefined for a non-prod stage that did not opt in", () => {
      expect(
        resolveCdnForStage(stage("staging", false), withDomains)
      ).toBeUndefined();
    });
  });

  describe("findDeadWafFlags", () => {
    it("flags a non-prod waf:true stage with no domain", () => {
      const dead = findDeadWafFlags([stage("staging", true)], noDomains);
      expect(dead.map(s => s.name)).toEqual(["staging"]);
    });

    it("does not flag production (it ignores the flag)", () => {
      expect(findDeadWafFlags([stage("production", true)], noDomains)).toEqual(
        []
      );
    });

    it("does not flag a non-prod waf:true stage that has a domain", () => {
      expect(findDeadWafFlags([stage("staging", true)], withDomains)).toEqual(
        []
      );
    });

    it("does not flag a non-prod stage with waf:false", () => {
      expect(findDeadWafFlags([stage("staging", false)], noDomains)).toEqual(
        []
      );
    });
  });
});
