/** Execute the real entrypoint in Vitest so app/config execution is covered. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as cdk from "aws-cdk-lib";
import type { CloudAssembly } from "aws-cdk-lib/cx-api";
import {
  stageEnvironments,
  supportEnvironments,
} from "../../config/environments";
import { githubConfig } from "../../config/github";
import type { StageEnvironment } from "../../lib/types";

const outputs: string[] = [];
let beforeExitListeners = new Set(process.listeners("beforeExit"));
const modes = ["direct", "pipeline", "frontend-only"] as const;
type Mode = (typeof modes)[number];
interface Resource {
  Type: string;
  Properties: Record<string, any>;
}

const configure = (mode: Mode) => {
  const base = structuredClone(stageEnvironments[0]);
  const frontend = mode === "frontend-only";
  const environment: StageEnvironment = {
    ...base,
    accountId: "111111111111",
    features: frontend
      ? ({
          ...Object.fromEntries(
            Object.keys(base.features).map(key => [key, false])
          ),
          amplifyHosting: true,
        } as StageEnvironment["features"])
      : { ...base.features, backup: true },
    ...(frontend
      ? {
          amplifyHosting: {
            owner: "example",
            repository: "frontend",
            branch: "dev",
            oauthTokenSecretName: "fixture/amplify/token",
          },
        }
      : {
          aurora: {
            ...base.aurora,
            maxCapacity: 8,
            instanceCount: 2,
            applicationUsername: "app_user",
            readOnlyUsername: "reader_user",
          },
          network: { ...base.network, vpcEndpoints: ["s3", "dynamodb", "ssm"] },
        }),
  };
  const shared = {
    ...supportEnvironments[0],
    accountId: frontend ? "PLACEHOLDER" : "999999999999",
    purpose: {
      dns: false,
      codeConnections: false,
      flowLogs: false,
      pipeline: mode === "pipeline",
    },
  };
  vi.doMock("../../config/environments", () => ({
    stageEnvironments: [environment],
    supportEnvironments: [shared],
    environments: { stages: [environment], support: [shared] },
  }));
  vi.doMock("../../config/github", () => ({
    githubConfig: {
      ...githubConfig,
      owner: "example",
      ownerId: "123456",
      deployRepositories: [
        { name: "backend", id: "456789", refs: ["refs/heads/main"] },
      ],
      codeConnectionArn:
        mode === "pipeline"
          ? "arn:aws:codestar-connections:us-east-1:999999999999:connection/00000000-0000-0000-0000-000000000000"
          : "PLACEHOLDER",
    },
  }));
  vi.doMock("../../config/domains", () => ({
    domainConfig: { domains: [] },
    getPrimaryDomain: () => undefined,
    hasDomainsConfigured: () => false,
  }));
};

const isolate = (output: string) => {
  Object.keys(process.env)
    .filter(
      key =>
        key.startsWith("AWS_") ||
        key.startsWith("CDK_DEFAULT_") ||
        key === "CDK_CONTEXT_JSON" ||
        key === "CDK_CONTEXT_OVERFLOW_LOCATION" ||
        key === "AGENT_OPERATIONS_EXTERNAL_ID"
    )
    .forEach(key => vi.stubEnv(key, undefined));
  vi.stubEnv("AWS_EC2_METADATA_DISABLED", "true");
  vi.stubEnv("AWS_CONFIG_FILE", join(output, "no-aws-config"));
  vi.stubEnv("AWS_SHARED_CREDENTIALS_FILE", join(output, "no-aws-credentials"));
  vi.stubEnv("CDK_OUTDIR", output);
  vi.stubEnv(
    "CDK_CONTEXT_JSON",
    JSON.stringify({
      "availability-zones:account=111111111111:region=us-east-1": [
        "us-east-1a",
        "us-east-1b",
      ],
      "availability-zones:account=999999999999:region=us-east-1": [
        "us-east-1a",
        "us-east-1b",
      ],
    })
  );
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("Unexpected network request"))
  );
};

const assertBackend = (resources: Resource[]) => {
  const ofType = (type: string) =>
    resources.filter(resource => resource.Type === type);
  expect(ofType("AWS::EC2::VPC")).toHaveLength(1);
  const endpoints = ofType("AWS::EC2::VPCEndpoint");
  expect(
    endpoints.filter(
      endpoint => endpoint.Properties.VpcEndpointType === "Gateway"
    )
  ).toHaveLength(2);
  expect(
    endpoints.filter(
      endpoint => endpoint.Properties.VpcEndpointType === "Interface"
    )
  ).toHaveLength(1);
  expect(ofType("AWS::RDS::DBInstance")).toHaveLength(2);
  expect(ofType("AWS::RDS::DBProxy")[0].Properties.DefaultAuthScheme).toBe(
    "IAM_AUTH"
  );
  expect(ofType("AWS::RDS::DBCluster")[0].Properties.Tags).toContainEqual({
    Key: "backup",
    Value: "yes",
  });
  expect(
    ofType("AWS::Backup::BackupSelection")[0].Properties.BackupSelection
      .ListOfTags
  ).toEqual([
    {
      ConditionType: "STRINGEQUALS",
      ConditionKey: "backup",
      ConditionValue: "yes",
    },
  ]);
  const capacity = ofType("AWS::CloudWatch::Alarm").filter(
    alarm => alarm.Properties.MetricName === "ServerlessDatabaseCapacity"
  );
  expect(capacity).toHaveLength(4);
  expect(
    capacity
      .map(alarm => alarm.Properties.Threshold)
      .sort((left, right) => left - right)
  ).toEqual([6.4, 6.4, 7.2, 7.2]);
  capacity.forEach(alarm => {
    expect(alarm.Properties.Statistic).toBe("Maximum");
    expect(alarm.Properties.TreatMissingData).toBe("notBreaching");
  });
  const deploy = ofType("AWS::IAM::Role").find(
    role => role.Properties.RoleName === "DeployServiceRole"
  );
  expect(deploy?.Properties.PermissionsBoundary).toBeDefined();
};

beforeEach(() => {
  beforeExitListeners = new Set(process.listeners("beforeExit"));
});
afterEach(() => {
  process
    .listeners("beforeExit")
    .filter(listener => !beforeExitListeners.has(listener))
    .forEach(listener => process.removeListener("beforeExit", listener));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  ["environments", "github", "domains"].forEach(name =>
    vi.doUnmock(`../../config/${name}`)
  );
  outputs
    .splice(0)
    .forEach(output => rmSync(output, { recursive: true, force: true }));
});

describe("covered real starter entrypoint", () => {
  it.each(modes)(
    "%s executes bin/app and retains nonempty feature invariants",
    async mode => {
      vi.resetModules();
      const output = mkdtempSync(join(tmpdir(), "starter-covered-app-"));
      outputs.push(output);
      isolate(output);
      configure(mode);
      const originalSynth = cdk.App.prototype.synth;
      const assemblies: CloudAssembly[] = [];
      vi.spyOn(cdk.App.prototype, "synth").mockImplementation(function (
        this: cdk.App,
        options
      ) {
        const assembly = originalSynth.call(this, options);
        assemblies.push(assembly);
        return assembly;
      });
      await import("../../bin/app");
      expect(assemblies).toHaveLength(1);
      const assembly = assemblies[0];
      const stacks = assembly.stacksRecursively;
      const resources = stacks.flatMap(
        stack => Object.values(stack.template.Resources ?? {}) as Resource[]
      );
      expect(stacks.length).toBeGreaterThan(0);
      expect(resources.length).toBeGreaterThan(0);
      expect(assembly.manifest.missing ?? []).toEqual([]);
      stacks.forEach(stack =>
        expect(stack.assembly.manifest.missing ?? []).toEqual([])
      );
      expect(fetch).not.toHaveBeenCalled();
      const paths = stacks.map(stack => stack.manifest.displayName);
      const frontend = mode === "frontend-only";
      expect(
        resources.some(
          resource => resource.Type === "AWS::CodePipeline::Pipeline"
        )
      ).toBe(mode === "pipeline");
      if (frontend) {
        expect(stacks).toHaveLength(1);
        expect(paths).toEqual(["Env-dev/AmplifyHostingStack"]);
        expect(
          resources.filter(resource => resource.Type === "AWS::Amplify::App")
        ).toHaveLength(1);
        expect(
          resources.some(
            resource =>
              resource.Type === "AWS::RDS::DBCluster" ||
              resource.Type === "AWS::EC2::VPC"
          )
        ).toBe(false);
      } else {
        expect(paths).toContain(
          `${mode === "pipeline" ? "PipelineStack/" : ""}Env-dev/AuroraStack`
        );
        assertBackend(resources);
      }
    }
  );
});
