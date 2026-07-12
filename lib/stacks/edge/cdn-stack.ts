/**
 * CDN Stack - CloudFront + AWS WAF Edge for an HTTP API
 *
 * Fronts the application's HTTP API (API Gateway v2, deployed separately from
 * this CDK app) with a CloudFront distribution and attaches an AWS WAF WebACL
 * to that distribution. This is the ONLY way to put WAF in front of an HTTP
 * API: WAFv2 cannot associate with API Gateway v2 directly, so coverage
 * requires CloudFront with the WebACL on the distribution (CLOUDFRONT scope,
 * us-east-1).
 *
 * ## When this stack exists
 *
 * Only when a domain is configured for the stage AND the stage is production
 * (automatic) or opted in via `features.waf` (non-prod rehearsal). The
 * trigger lives in `util/cdn.ts`; with no domain configured this stack is
 * never created and the feature is a complete no-op. (The starter ships a
 * sample `example.com` domain but PLACEHOLDER account ids, so nothing
 * deploys until a real domain + accounts are configured.)
 *
 * ## Origin model (why a regional custom domain)
 *
 * When the HTTP API is deployed by a separate tool (Serverless Framework, SAM,
 * another CDK app), this CDK app does not see the API's generated id, so
 * CloudFront cannot target the raw `execute-api` endpoint. Instead CDK owns a
 * stable regional API Gateway custom domain (`originHost`) and the application
 * attaches its HTTP API stage to it via an `ApiMapping` — the domain name is
 * published as an SSM parameter (`{apiContractPrefix}/api/custom-domain-name`)
 * for the application deploy to read. CloudFront forwards to `originHost`; DNS
 * resolves it to the regional endpoint.
 *
 * ## DNS placement (per-stage delegated zone)
 *
 * The edge lives in the stage account for blast-radius isolation, so it owns a
 * per-stage public hosted zone for `publicHost` (a subdomain delegated from
 * the primary zone in the shared/DNS account). The parent NS delegation and
 * the application-side `ApiMapping` are the two cross-boundary steps performed
 * when domains are configured — see specs/cloudfront-waf-edge.md.
 *
 * ## Deferred (activate when domains are configured)
 *
 * The CloudFront→origin shared-secret header (and its validation in the API)
 * that closes the origin-bypass gap is intentionally NOT installed here: a
 * half-installed secret enforces nothing and everything is inert until domains
 * exist. It is a numbered step in the runbook.
 * @see util/cdn.ts - Trigger predicate and host derivation
 * @see specs/cloudfront-waf-edge.md - Design + activation runbook
 * @module lib/stacks/edge/cdn-stack
 */
import * as cdk from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import type { Construct } from "constructs";
import type { ResolvedCdn } from "../../../util/cdn";
import type { WafOptions } from "../../types";

/**
 * Default per-IP request cap over a rolling 5-minute window.
 */
const DEFAULT_RATE_LIMIT = 2000;

/**
 * Configuration properties for CdnStack.
 */
export interface CdnStackProps extends cdk.StackProps {
  /**
   * Stage name (e.g. "production"), used for resource naming and the backend
   * contract parameter prefix.
   */
  readonly stageName: string;

  /**
   * Resolved edge plan (public + origin hostnames) from util/cdn.ts.
   */
  readonly cdn: ResolvedCdn;

  /**
   * Optional WAF tuning (rate limit, count-only rehearsal mode).
   */
  readonly wafOptions?: WafOptions;

  /**
   * SSM parameter-name prefix under which the origin custom domain name is
   * published for the application deploy to read (it attaches its HTTP API to
   * that domain via an ApiMapping). Defaults to `/app/{stageName}`; point it
   * at your application's contract prefix.
   */
  readonly apiContractPrefix?: string;
}

/**
 * CDN Stack creating the CloudFront + WAF edge for a stage's HTTP API.
 */
export class CdnStack extends cdk.Stack {
  /**
   * The per-stage public hosted zone for the API subdomain.
   */
  public readonly hostedZone: route53.PublicHostedZone;

  /**
   * The WAF WebACL attached to the distribution.
   */
  public readonly webAcl: wafv2.CfnWebACL;

  /**
   * The CloudFront distribution fronting the HTTP API.
   */
  public readonly distribution: cloudfront.Distribution;

  /**
   * Creates a new CdnStack.
   * @param scope - Parent construct
   * @param id - Stack identifier
   * @param props - Stack configuration
   */
  constructor(scope: Construct, id: string, props: CdnStackProps) {
    super(scope, id, props);

    const { stageName, cdn, wafOptions } = props;
    const apiContractPrefix = props.apiContractPrefix ?? `/app/${stageName}`;

    // Per-stage delegated zone for the API subdomain. The parent NS
    // delegation from the shared-account primary zone is added when domains
    // are configured (see the runbook) — until then cert validation cannot
    // complete, which is fine because this stack only exists once a domain
    // is configured.
    this.hostedZone = new route53.PublicHostedZone(this, "ApiZone", {
      zoneName: cdn.publicHost,
    });

    // One us-east-1 certificate covers both the public (CloudFront viewer)
    // host and the regional origin host, and is reused by both endpoints.
    const certificate = new acm.Certificate(this, "EdgeCertificate", {
      domainName: cdn.publicHost,
      subjectAlternativeNames: [cdn.originHost],
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
    });

    this.webAcl = this.createWebAcl(stageName, wafOptions);

    const originHost = this.createOrigin(cdn, certificate);

    this.distribution = this.createDistribution(cdn, originHost, certificate);

    // Public host → CloudFront.
    new route53.ARecord(this, "PublicAliasRecord", {
      zone: this.hostedZone,
      recordName: cdn.publicHost,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(this.distribution)
      ),
    });

    this.publishContract(apiContractPrefix, cdn.originHost);
    this.createOutputs(stageName, cdn.publicHost);
  }

  /**
   * Creates the CLOUDFRONT-scope WebACL: three AWS managed rule groups plus a
   * rate-based rule. Managed groups run in the group's own actions (Block)
   * unless `countOnly` overrides them to Count for rehearsal.
   * @param stageName - Stage name for naming/metrics
   * @param wafOptions - Optional rate limit and count-only toggle
   * @returns The WebACL
   */
  private createWebAcl(
    stageName: string,
    wafOptions?: WafOptions
  ): wafv2.CfnWebACL {
    const countOnly = wafOptions?.countOnly === true;
    const rateLimit = wafOptions?.rateLimitPerFiveMinutes ?? DEFAULT_RATE_LIMIT;
    const metricPrefix = `${stageName}-api`;

    const managedGroup = (
      priority: number,
      name: string
    ): wafv2.CfnWebACL.RuleProperty => ({
      name,
      priority,
      statement: {
        managedRuleGroupStatement: { vendorName: "AWS", name },
      },
      // overrideAction (not action) is required for managed-group rules.
      overrideAction: countOnly ? { count: {} } : { none: {} },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: `${metricPrefix}-${name}`,
      },
    });

    const rateRule: wafv2.CfnWebACL.RuleProperty = {
      name: "RateLimitPerIp",
      priority: 0,
      statement: {
        rateBasedStatement: { limit: rateLimit, aggregateKeyType: "IP" },
      },
      action: countOnly ? { count: {} } : { block: {} },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: `${metricPrefix}-RateLimitPerIp`,
      },
    };

    return new wafv2.CfnWebACL(this, "ApiWebAcl", {
      name: `${stageName}-api-web-acl`,
      scope: "CLOUDFRONT",
      defaultAction: { allow: {} },
      rules: [
        rateRule,
        managedGroup(1, "AWSManagedRulesCommonRuleSet"),
        managedGroup(2, "AWSManagedRulesKnownBadInputsRuleSet"),
        managedGroup(3, "AWSManagedRulesAmazonIpReputationList"),
      ],
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: `${stageName}-api-web-acl`,
      },
    });
  }

  /**
   * Creates the regional API Gateway custom domain that serves as the origin
   * and the DNS record resolving it to that regional endpoint. The backend
   * attaches its HTTP API to this domain via an ApiMapping.
   * @param cdn - Resolved edge plan
   * @param certificate - Shared us-east-1 certificate
   * @returns The origin hostname
   */
  private createOrigin(
    cdn: ResolvedCdn,
    certificate: acm.ICertificate
  ): string {
    const originDomain = new apigwv2.CfnDomainName(this, "OriginApiDomain", {
      domainName: cdn.originHost,
      domainNameConfigurations: [
        {
          certificateArn: certificate.certificateArn,
          endpointType: "REGIONAL",
          securityPolicy: "TLS_1_2",
        },
      ],
    });

    new route53.ARecord(this, "OriginAliasRecord", {
      zone: this.hostedZone,
      recordName: cdn.originHost,
      target: route53.RecordTarget.fromAlias(
        new targets.ApiGatewayv2DomainProperties(
          originDomain.attrRegionalDomainName,
          originDomain.attrRegionalHostedZoneId
        )
      ),
    });

    return cdn.originHost;
  }

  /**
   * Creates the CloudFront distribution: WAF attached, caching disabled, and
   * viewer-headers/methods forwarded so GraphQL POSTs and auth/tracing
   * headers reach the origin intact.
   * @param cdn - Resolved edge plan
   * @param originHost - Origin hostname
   * @param certificate - Shared us-east-1 certificate
   * @returns The distribution
   */
  private createDistribution(
    cdn: ResolvedCdn,
    originHost: string,
    certificate: acm.ICertificate
  ): cloudfront.Distribution {
    return new cloudfront.Distribution(this, "ApiDistribution", {
      comment: `Tunnl API edge (${cdn.publicHost})`,
      domainNames: [cdn.publicHost],
      certificate,
      webAclId: this.webAcl.attrArn,
      defaultBehavior: {
        origin: new origins.HttpOrigin(originHost, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        // GraphQL is dynamic: never cache, and forward everything except the
        // Host header (Authorization, sentry-trace/baggage, POST bodies).
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy:
          cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      },
    });
  }

  /**
   * Publishes the regional custom domain name so the application deploy can
   * attach its HTTP API to it via an ApiMapping. Only synthesized when this
   * stack exists (i.e. once a domain is configured for the stage).
   * @param apiContractPrefix - SSM parameter-name prefix for the app contract
   * @param originHost - Regional custom domain the app maps its API onto
   */
  private publishContract(apiContractPrefix: string, originHost: string): void {
    new ssm.StringParameter(this, "ApiCustomDomainNameParam", {
      parameterName: `${apiContractPrefix}/api/custom-domain-name`,
      stringValue: originHost,
    });
  }

  /**
   * Creates CloudFormation outputs for cross-stack references and operators.
   * @param stageName - Stage name for export-name prefixes
   * @param publicHost - Public API hostname
   */
  private createOutputs(stageName: string, publicHost: string): void {
    new cdk.CfnOutput(this, "ApiPublicHost", {
      value: publicHost,
      description: `Public API host fronted by CloudFront for ${stageName}`,
      exportName: `${stageName}-api-public-host`,
    });

    new cdk.CfnOutput(this, "ApiDistributionDomain", {
      value: this.distribution.distributionDomainName,
      description: `CloudFront distribution domain for ${stageName}`,
      exportName: `${stageName}-api-distribution-domain`,
    });

    new cdk.CfnOutput(this, "ApiWebAclArn", {
      value: this.webAcl.attrArn,
      description: `WAF WebACL ARN for ${stageName}`,
      exportName: `${stageName}-api-web-acl-arn`,
    });
  }
}
