/** Offline acceptance for optional cross-account DNS delegation. */
import { rmSync } from "node:fs";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { getDnsDelegations } from "../../util/dns-delegation";
import { SupportStage } from "../../lib/stages/support-stage";
import { stageEnvironments } from "../../config/environments";
import { alarmThresholds, dashboardWidgets } from "../../config/observability";
import { DnsStack } from "../../lib/stacks/support/dns-stack";
import { EnvironmentStage } from "../../lib/stages/environment-stage";
import type { DomainConfig, StageEnvironment } from "../../lib/types";

const entry = {
  parentDomain: "example.test",
  parentHostedZoneId: "ZEXAMPLEPARENT",
  parentAccountId: "111111111111",
  delegationRoleName: "delegate-dev-example-test",
  childZoneName: "dev.example.test",
  trustedChildAccountIds: ["222222222222"],
};
const domains: DomainConfig["domains"] = [
  {
    name: "example.test",
    isPrimary: true,
    environments: { dev: { subdomain: "dev" } },
  },
];
const configuration = (entries = [entry], enabled = true): DomainConfig =>
  ({ domains, dnsDelegation: { enabled, entries } }) as DomainConfig;
const apps: cdk.App[] = [];
const app = (): cdk.App => {
  const result = new cdk.App({ autoSynth: false });
  apps.push(result);
  return result;
};
beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("Unexpected network access in DNS fixture")
  );
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  for (const instance of apps.splice(0))
    rmSync(instance.outdir, { recursive: true, force: true });
});
const support = (domainConfig: DomainConfig): DnsStack =>
  new DnsStack(app(), "Dns", {
    domainConfig,
    env: { account: entry.parentAccountId, region: "us-east-1" },
  });
const environment = (waf = false): StageEnvironment => {
  const base = stageEnvironments[0];
  return {
    ...base,
    name: "dev",
    accountId: "222222222222",
    features: {
      ...base.features,
      network: false,
      aurora: false,
      valkey: false,
      cognito: false,
      observability: false,
      backup: false,
      ssmRelay: false,
      migrationRunner: false,
      amplifyHosting: false,
      githubOidcDeploy: false,
      waf,
    },
  };
};
const child = (domainConfig: DomainConfig, waf = false): EnvironmentStage =>
  new EnvironmentStage(app(), "Env-dev", {
    domainConfig,
    environment: environment(waf),
    alarmThresholds,
    env: { account: "222222222222", region: "us-east-1" },
  });
const childTemplates = (stage: EnvironmentStage): Record<string, unknown>[] =>
  stage.node.children
    .filter((node): node is cdk.Stack => node instanceof cdk.Stack)
    .map(stack => Template.fromStack(stack).toJSON());
const resources = (
  templates: Record<string, unknown>[],
  type: string
): Record<string, any>[] =>
  templates.flatMap(template =>
    Object.values(template.Resources as Record<string, any>).filter(
      resource => resource.Type === type
    )
  );

describe("starter optional DNS delegation", () => {
  it("preserves complete support and CDN templates when absent or disabled", () => {
    const baseline = Template.fromStack(support({ domains })).toJSON();
    expect(
      Template.fromStack(support(configuration([], false))).toJSON()
    ).toEqual(baseline);
    expect(childTemplates(child(configuration([], false), true))).toEqual(
      childTemplates(child({ domains }, true))
    );
    expect(
      resources(
        childTemplates(child({ domains })),
        "Custom::CrossAccountZoneDelegation"
      )
    ).toHaveLength(0);
  });

  it("restricts the parent role to configured account, zone, NS actions and exact normalized child name", () => {
    const baseline = Template.fromStack(support({ domains })).toJSON();
    const template = Template.fromStack(support(configuration())).toJSON();
    for (const [id, resource] of Object.entries(baseline.Resources))
      expect(template.Resources[id]).toEqual(resource);
    expect(template.Outputs).toEqual(baseline.Outputs);
    const roles = resources([template], "AWS::IAM::Role");
    expect(roles).toHaveLength(1);
    expect(roles[0].Properties.AssumeRolePolicyDocument.Statement).toEqual([
      {
        Action: "sts:AssumeRole",
        Effect: "Allow",
        Principal: {
          AWS: {
            "Fn::Join": [
              "",
              ["arn:", { Ref: "AWS::Partition" }, ":iam::222222222222:root"],
            ],
          },
        },
      },
    ]);
    const policies = resources([template], "AWS::IAM::Policy");
    expect(policies).toHaveLength(1);
    expect(policies[0].Properties.PolicyDocument.Statement).toEqual([
      {
        Action: "route53:ChangeResourceRecordSets",
        Effect: "Allow",
        Resource: {
          "Fn::Join": [
            "",
            [
              "arn:",
              { Ref: "AWS::Partition" },
              ":route53:::hostedzone/ZEXAMPLEPARENT",
            ],
          ],
        },
        Condition: {
          "ForAllValues:StringEquals": {
            "route53:ChangeResourceRecordSetsRecordTypes": ["NS"],
            "route53:ChangeResourceRecordSetsActions": ["UPSERT", "DELETE"],
            "route53:ChangeResourceRecordSetsNormalizedRecordNames": [
              "dev.example.test",
            ],
          },
        },
      },
    ]);
    expect(JSON.stringify(template)).not.toContain("ListHostedZonesByName");
  });

  it("creates an offline retained child zone and delegates using explicit parent ID and role ARN", () => {
    const templates = childTemplates(child(configuration()));
    const zones = resources(templates, "AWS::Route53::HostedZone");
    expect(zones).toHaveLength(1);
    expect(zones[0].Properties.Name).toBe("dev.example.test.");
    expect(zones[0].DeletionPolicy).toBe("Retain");
    const records = resources(templates, "Custom::CrossAccountZoneDelegation");
    expect(records).toHaveLength(1);
    expect(records[0].DeletionPolicy).toBe("Retain");
    expect(records[0].UpdateReplacePolicy).toBe("Retain");
    expect(records[0].Properties.ParentZoneId).toBe(entry.parentHostedZoneId);
    expect(records[0].Properties.ParentZoneName).toBeUndefined();
    expect(records[0].Properties.AssumeRoleArn).toEqual({
      "Fn::Join": [
        "",
        [
          "arn:",
          { Ref: "AWS::Partition" },
          ":iam::111111111111:role/delegate-dev-example-test",
        ],
      ],
    });
    expect(records[0].Properties.AssumeRoleRegion).toBeUndefined();
    expect(JSON.stringify(templates)).not.toContain("Fn::ImportValue");
  });

  it("reuses ApiZone and preserves EdgeCertificate identity when delegating the CDN hostname", () => {
    const baseline = childTemplates(child({ domains }, true));
    const templates = childTemplates(child(configuration(), true));
    const existing = baseline[0].Resources as Record<string, any>;
    const enabled = templates[0].Resources as Record<string, any>;
    for (const [id, resource] of Object.entries(existing)) {
      if (resource.Type === "AWS::CertificateManager::Certificate")
        expect(enabled[id]).toEqual(resource);
      if (resource.Type === "AWS::Route53::HostedZone")
        expect(enabled[id].Properties).toEqual(resource.Properties);
    }
    expect(resources(templates, "AWS::Route53::HostedZone")).toHaveLength(1);
    expect(
      resources(templates, "Custom::CrossAccountZoneDelegation")
    ).toHaveLength(1);
  });

  it("creates support authorization even with no managed domains and no lookup context", () => {
    const instance = app();
    const stage = new SupportStage(instance, "Support", {
      supportEnvironment: {
        type: "support",
        name: "shared",
        accountId: entry.parentAccountId,
        region: "us-east-1",
        purpose: {
          dns: true,
          pipeline: false,
          codeConnections: false,
          flowLogs: false,
        },
      },
      domainConfig: { ...configuration(), domains: [] },
      deployableEnvironments: [],
      env: { account: entry.parentAccountId, region: "us-east-1" },
    });
    expect(stage.dnsStack).toBeDefined();
    const template = Template.fromStack(stage.dnsStack!).toJSON();
    expect(resources([template], "AWS::Route53::HostedZone")).toHaveLength(0);
    expect(resources([template], "AWS::IAM::Role")).toHaveLength(1);
    expect(instance.synth().manifest.missing ?? []).toEqual([]);
  });

  it("normalizes names, isolates untrusted accounts and rejects ambiguous owners or shared roles", () => {
    const normalized = getDnsDelegations(
      configuration([
        {
          ...entry,
          parentDomain: "EXAMPLE.TEST.",
          childZoneName: "DEV.EXAMPLE.TEST.",
        },
      ])
    );
    expect(normalized[0].childZoneName).toBe("dev.example.test");
    expect(normalized[0].parentDomain).toBe("example.test");
    expect(() =>
      getDnsDelegations(configuration(), [
        environment(),
        { ...environment(), name: "staging" },
      ])
    ).toThrow(/multiple stages/);
    expect(() =>
      getDnsDelegations(
        configuration([
          entry,
          { ...entry, childZoneName: "staging.example.test" },
        ])
      )
    ).toThrow(/Duplicate DNS delegation role/);
    const instance = app();
    const stage = new EnvironmentStage(instance, "Untrusted", {
      domainConfig: configuration(),
      environment: { ...environment(), accountId: "333333333333" },
      alarmThresholds,
      env: { account: "333333333333", region: "us-east-1" },
    });
    expect(stage.node.tryFindChild("DnsDelegationStack")).toBeUndefined();
  });

  it("rejects invalid delegation through the actual startup configuration validator", async () => {
    vi.resetModules();
    vi.doMock("../../config/domains", () => ({
      domainConfig: configuration([
        { ...entry, childZoneName: "notexample.test" },
      ]),
    }));
    try {
      const { validateConfiguration } =
        await import("../../util/config-loader");
      expect(() =>
        validateConfiguration({ stages: [], supports: [], dashboardWidgets })
      ).toThrow(/strictly below/);
    } finally {
      vi.doUnmock("../../config/domains");
      vi.resetModules();
    }
  });

  it.each([
    [
      "outside parent",
      [{ ...entry, childZoneName: "dev.notexample.test" }],
      /strictly below/,
    ],
    ["apex", [{ ...entry, childZoneName: "example.test" }], /strictly below/],
    [
      "duplicate",
      [entry, { ...entry, childZoneName: "DEV.EXAMPLE.TEST." }],
      /duplicate/i,
    ],
    [
      "malformed trust",
      [{ ...entry, trustedChildAccountIds: ["PLACEHOLDER"] }],
      /trustedChildAccountIds/,
    ],
  ])("rejects %s before creating DNS resources", (_label, entries, error) => {
    expect(() => support(configuration(entries as (typeof entry)[]))).toThrow(
      error as RegExp
    );
  });
});
