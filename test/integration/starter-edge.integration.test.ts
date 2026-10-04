/** Offline edge-region configuration, construct and no-edge contracts. */
import { rmSync } from "node:fs";
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { stageEnvironments } from "../../config/environments";
import { alarmThresholds } from "../../config/observability";
import { EnvironmentStage } from "../../lib/stages/environment-stage";
import { CdnStack } from "../../lib/stacks/edge/cdn-stack";
import { validateConfiguration } from "../../util/config-loader";
import type { DomainConfig, StageEnvironment } from "../../lib/types";

const domains = vi.hoisted(() => ({ domains: [] as DomainConfig["domains"] }));
vi.mock("../../config/domains", () => ({ domainConfig: domains }));

const outdirs: string[] = [];
const cdn = {
  domainName: "example.test",
  publicHost: "api.example.test",
  originHost: "origin.api.example.test",
};
const configuration = (
  name = "production",
  region = "us-east-1",
  waf = false
): StageEnvironment => ({
  ...stageEnvironments[0],
  name,
  accountId: "111111111111",
  region,
  features: {
    ...stageEnvironments[0].features,
    aurora: false,
    valkey: false,
    cognito: false,
    xray: false,
    backup: false,
    ssmRelay: false,
    migrationRunner: false,
    observability: false,
    waf,
  },
});
const validate = (stage: StageEnvironment) =>
  validateConfiguration({
    stages: [stage],
    supports: [],
    dashboardWidgets: { aurora: [], valkey: [], cognito: [], vpc: [] },
  });
const app = () => {
  const result = new cdk.App({
    context: {
      "availability-zones:account=111111111111:region=us-west-2": [
        "us-west-2a",
        "us-west-2b",
      ],
    },
  });
  outdirs.push(result.outdir);
  return result;
};
const stage = (environment: StageEnvironment) =>
  new EnvironmentStage(app(), `Env-${environment.name}`, {
    environment,
    alarmThresholds,
    domainConfig: domains,
    env: { account: environment.accountId, region: environment.region },
  });

beforeEach(() => {
  domains.domains = [
    {
      name: "example.test",
      isPrimary: true,
      environments: {
        production: { useApex: true },
        staging: { subdomain: "staging" },
      },
    },
  ];
});
afterEach(() => {
  for (const outdir of outdirs.splice(0))
    rmSync(outdir, { recursive: true, force: true });
});

describe("starter edge region contract", () => {
  it.each([
    ["production", false],
    ["staging", true],
  ] as const)(
    "rejects effective %s edge outside us-east-1 before stage construction (waf=%s)",
    (name, waf) => {
      expect(() => validate(configuration(name, "us-west-2", waf))).toThrow(
        new RegExp(`${name}.*us-west-2.*us-east-1`)
      );
    }
  );

  it.each(["explicit", "inherited", "unresolved"])(
    "rejects %s unsupported direct CDN region before creating any edge resource",
    mode => {
      const root = app();
      const scope =
        mode === "inherited"
          ? new cdk.Stage(root, "Regional", {
              env: { account: "111111111111", region: "us-west-2" },
            })
          : root;
      expect(
        () =>
          new CdnStack(scope, "InvalidEdge", {
            stageName: "production",
            cdn,
            ...(mode === "explicit"
              ? { env: { account: "111111111111", region: "us-west-2" } }
              : {}),
          })
      ).toThrow(/CloudFront.*us-east-1/);
      const rejected = scope.node.findChild("InvalidEdge");
      expect(
        rejected.node.findAll().filter(node => node instanceof cdk.CfnResource)
      ).toHaveLength(0);
    }
  );

  it.each([
    ["production", false, false],
    ["staging", true, true],
  ] as const)(
    "synthesizes supported %s edge with existing WAF, origin and identity contracts",
    (name, waf, countOnly) => {
      const environment = {
        ...configuration(name, "us-east-1", waf),
        wafOptions: { countOnly },
      };
      expect(() => validate(environment)).not.toThrow();
      const owner = stage(environment);
      expect(owner.cdnStack?.stackName).toBe(`${name}-cdn`);
      const template = Template.fromStack(owner.cdnStack!);
      const webAcls = template.findResources("AWS::WAFv2::WebACL");
      expect(Object.keys(webAcls)).toHaveLength(1);
      const [webAclId] = Object.keys(webAcls);
      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        Name: `${name}-api-web-acl`,
        Scope: "CLOUDFRONT",
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: "RateLimitPerIp",
            Action: countOnly ? { Count: {} } : { Block: {} },
          }),
          Match.objectLike({
            Name: "AWSManagedRulesCommonRuleSet",
            OverrideAction: countOnly ? { Count: {} } : { None: {} },
          }),
        ]),
      });
      template.hasResourceProperties("AWS::CloudFront::Distribution", {
        DistributionConfig: {
          WebACLId: { "Fn::GetAtt": [webAclId, "Arn"] },
          DefaultCacheBehavior: {
            CachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
            OriginRequestPolicyId: "b689b0a8-53d0-40ab-baf2-68738e2966ac",
          },
          Origins: Match.arrayWith([
            Match.objectLike({
              DomainName:
                name === "production"
                  ? cdn.originHost
                  : "origin.staging.example.test",
              OriginCustomHeaders: Match.absent(),
              CustomOriginConfig: Match.objectLike({
                OriginProtocolPolicy: "https-only",
              }),
            }),
          ]),
        },
      });
      template.resourceCountIs("AWS::SecretsManager::Secret", 0);
      template.hasResourceProperties("AWS::SSM::Parameter", {
        Name: `/app/${name}/api/custom-domain-name`,
        Type: "String",
      });
    }
  );

  it.each([
    "staging-disabled",
    "production-no-domain",
    "production-empty-mapping",
  ])("keeps regional no-edge configuration usable: %s", selection => {
    if (selection === "production-no-domain") domains.domains = [];
    if (selection === "production-empty-mapping")
      domains.domains = [
        {
          name: "example.test",
          isPrimary: true,
          environments: { production: {} },
        },
      ];
    const environment = configuration(
      selection === "staging-disabled" ? "staging" : "production",
      "us-west-2"
    );
    expect(() => validate(environment)).not.toThrow();
    const owner = stage(environment);
    expect(owner.cdnStack).toBeUndefined();
    expect(owner.node.tryFindChild("CdnStack")).toBeUndefined();
    const network = Template.fromStack(owner.vpcStack!);
    network.resourceCountIs("AWS::EC2::VPC", 1);
    network.resourceCountIs("AWS::WAFv2::WebACL", 0);
    network.resourceCountIs("AWS::CloudFront::Distribution", 0);
  });

  it("retains rejection of a decorative nonproduction WAF flag without domains", () => {
    domains.domains = [];
    expect(() => validate(configuration("staging", "us-west-2", true))).toThrow(
      /features.waf.*no usable domain mapping/
    );
  });
});
