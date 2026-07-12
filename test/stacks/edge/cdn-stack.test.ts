/**
 * Tests for CdnStack.
 *
 * Verifies the CloudFront + WAF edge: a CLOUDFRONT-scope WebACL with the four
 * rules attached to the distribution, caching disabled / all-viewer
 * forwarding for the HTTP-API origin, the regional origin custom domain, the
 * app-contract parameter, and the count-only rehearsal toggle.
 *
 * @module test/stacks/edge/cdn-stack.test
 */
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { CdnStack } from "../../../lib/stacks/edge/cdn-stack";
import type { WafOptions } from "../../../lib/types";
import type { ResolvedCdn } from "../../../util/cdn";

const prodCdn: ResolvedCdn = {
  domainName: "example.com",
  publicHost: "api.example.com",
  originHost: "origin.api.example.com",
};

const createTemplate = (
  stageName = "production",
  cdn: ResolvedCdn = prodCdn,
  wafOptions?: WafOptions
): Template => {
  const app = new cdk.App();
  const stack = new CdnStack(app, "TestCdnStack", {
    stageName,
    cdn,
    wafOptions,
    env: { account: "123456789012", region: "us-east-1" },
  });
  return Template.fromStack(stack);
};

describe("CdnStack", () => {
  describe("WAF WebACL", () => {
    it("creates one CLOUDFRONT-scope WebACL that defaults to allow", () => {
      const template = createTemplate();

      template.resourceCountIs("AWS::WAFv2::WebACL", 1);
      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        Scope: "CLOUDFRONT",
        DefaultAction: { Allow: {} },
      });
    });

    it("attaches the three managed groups plus a rate rule", () => {
      const template = createTemplate();

      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: "RateLimitPerIp",
            Action: { Block: {} },
            Statement: {
              RateBasedStatement: { Limit: 2000, AggregateKeyType: "IP" },
            },
          }),
          Match.objectLike({
            Name: "AWSManagedRulesCommonRuleSet",
            OverrideAction: { None: {} },
            Statement: {
              ManagedRuleGroupStatement: {
                VendorName: "AWS",
                Name: "AWSManagedRulesCommonRuleSet",
              },
            },
          }),
          Match.objectLike({
            Name: "AWSManagedRulesKnownBadInputsRuleSet",
            OverrideAction: { None: {} },
          }),
          Match.objectLike({
            Name: "AWSManagedRulesAmazonIpReputationList",
            OverrideAction: { None: {} },
          }),
        ]),
      });
    });

    it("uses the configured rate limit", () => {
      const template = createTemplate("production", prodCdn, {
        rateLimitPerFiveMinutes: 500,
      });

      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: "RateLimitPerIp",
            Statement: { RateBasedStatement: { Limit: 500 } },
          }),
        ]),
      });
    });

    it("puts every rule in count mode when countOnly is set", () => {
      const template = createTemplate("staging", prodCdn, { countOnly: true });

      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        Rules: Match.arrayWith([
          Match.objectLike({ Name: "RateLimitPerIp", Action: { Count: {} } }),
          Match.objectLike({
            Name: "AWSManagedRulesCommonRuleSet",
            OverrideAction: { Count: {} },
          }),
        ]),
      });
    });
  });

  describe("CloudFront distribution", () => {
    it("creates one distribution bound to the WebACL and public host", () => {
      const template = createTemplate();

      template.resourceCountIs("AWS::CloudFront::Distribution", 1);
      template.hasResourceProperties("AWS::CloudFront::Distribution", {
        DistributionConfig: {
          Aliases: ["api.example.com"],
          WebACLId: Match.anyValue(),
        },
      });
    });

    it("redirects to https and disables caching (managed CACHING_DISABLED)", () => {
      const template = createTemplate();

      template.hasResourceProperties("AWS::CloudFront::Distribution", {
        DistributionConfig: {
          DefaultCacheBehavior: {
            ViewerProtocolPolicy: "redirect-to-https",
            CachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
          },
        },
      });
    });

    it("forwards to the regional origin over https only", () => {
      const template = createTemplate();

      template.hasResourceProperties("AWS::CloudFront::Distribution", {
        DistributionConfig: {
          Origins: Match.arrayWith([
            Match.objectLike({
              DomainName: "origin.api.example.com",
              CustomOriginConfig: Match.objectLike({
                OriginProtocolPolicy: "https-only",
              }),
            }),
          ]),
        },
      });
    });
  });

  describe("Origin custom domain + DNS", () => {
    it("creates a regional API Gateway custom domain for the origin", () => {
      const template = createTemplate();

      template.hasResourceProperties("AWS::ApiGatewayV2::DomainName", {
        DomainName: "origin.api.example.com",
        DomainNameConfigurations: Match.arrayWith([
          Match.objectLike({ EndpointType: "REGIONAL" }),
        ]),
      });
    });

    it("creates the per-stage hosted zone and both alias records", () => {
      const template = createTemplate();

      template.hasResourceProperties("AWS::Route53::HostedZone", {
        Name: "api.example.com.",
      });
      template.resourceCountIs("AWS::Route53::RecordSet", 2);
    });
  });

  describe("App contract", () => {
    it("publishes the origin custom domain name under the default prefix", () => {
      const template = createTemplate();

      template.hasResourceProperties("AWS::SSM::Parameter", {
        Name: "/app/production/api/custom-domain-name",
        Value: "origin.api.example.com",
      });
    });

    it("honors a custom apiContractPrefix", () => {
      const app = new cdk.App();
      const stack = new CdnStack(app, "PrefixStack", {
        stageName: "production",
        cdn: prodCdn,
        apiContractPrefix: "/my-backend/production",
        env: { account: "123456789012", region: "us-east-1" },
      });

      Template.fromStack(stack).hasResourceProperties("AWS::SSM::Parameter", {
        Name: "/my-backend/production/api/custom-domain-name",
      });
    });
  });
});
