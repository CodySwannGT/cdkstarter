/**
 * Tests for AgentOperationsStage.
 *
 * @module test/stages/agent-operations-stage.test
 */
import * as cdk from "aws-cdk-lib";
import { AgentOperationsStage } from "../../lib/stages/agent-operations-stage";
import type {
  AgentOperationsConfig,
  StageEnvironment,
  SupportEnvironment,
} from "../../lib/types";

describe("AgentOperationsStage", () => {
  const agentOperations: AgentOperationsConfig = {
    enabled: true,
    roleName: "RemoteAgent",
    policyName: "AgentOperationsPolicy",
    repairPolicyName: "AgentOperationsRepairPolicy",
    repairEnvironmentNames: ["dev", "staging"],
    userName: "remote-agent",
    secretName: "remote-agent-credentials",
    externalIdSecretName: "agent-operations-external-id",
    profilePrefix: "agent-",
  };

  const devEnvironment: StageEnvironment = {
    type: "stage",
    name: "dev",
    accountId: "111111111111",
    region: "us-east-1",
    features: {
      aurora: true,
      valkey: true,
      cognito: true,
      xray: true,
      waf: false,
      shieldAdvanced: false,
      backup: false,
      ssmRelay: false,
      githubOidcDeploy: false,
      migrationRunner: false,
    },
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
  };

  const sharedEnvironment: SupportEnvironment = {
    type: "support",
    name: "shared",
    accountId: "999999999999",
    region: "us-east-1",
    purpose: {
      pipeline: true,
      dns: true,
      codeConnections: true,
      flowLogs: false,
    },
  };

  const attachedManagedPolicyNames = (
    template: cdk.assertions.Template
  ): string[] => {
    const policies = template.findResources("AWS::IAM::ManagedPolicy");
    const policyNamesByLogicalId = new Map(
      Object.entries(policies).map(([logicalId, resource]) => [
        logicalId,
        resource.Properties?.ManagedPolicyName as string,
      ])
    );
    const role = Object.values(template.findResources("AWS::IAM::Role"))[0] as {
      Properties?: { ManagedPolicyArns?: Array<{ Ref: string }> };
    };

    return (role.Properties?.ManagedPolicyArns ?? []).map(
      reference => policyNamesByLogicalId.get(reference.Ref)!
    );
  };

  const parseBootstrapProfiles = (
    template: cdk.assertions.Template
  ): Record<string, { roleArn: string; region: string }> => {
    const secret = Object.values(
      template.findResources("AWS::SecretsManager::Secret")
    )[0] as {
      Properties?: {
        SecretString?: { "Fn::Join": [string, unknown[]] };
      };
    };
    const [delimiter, fragments] = secret.Properties!.SecretString!["Fn::Join"];
    const rendered = fragments
      .map(fragment =>
        typeof fragment === "string" ? fragment : "DYNAMIC_VALUE"
      )
      .join(delimiter);
    const bundle = JSON.parse(rendered) as { profiles: string };

    return JSON.parse(bundle.profiles) as Record<
      string,
      { roleArn: string; region: string }
    >;
  };

  it("should create a role stack per member account plus the shared account", () => {
    const app = new cdk.App();
    const stage = new AgentOperationsStage(app, "TestStage", {
      agentOperations,
      externalId: "test-external-id",
      stageEnvironments: [devEnvironment],
      sharedEnvironment,
    });

    // dev role + shared role
    expect(stage.roleStacks).toHaveLength(2);
    expect(stage.userStack).toBeDefined();
  });

  it("should target each stack at its own account", () => {
    const app = new cdk.App();
    const stage = new AgentOperationsStage(app, "TestStage", {
      agentOperations,
      externalId: "test-external-id",
      stageEnvironments: [devEnvironment],
      sharedEnvironment,
    });

    expect(stage.roleStacks[0].account).toBe("111111111111");
    expect(stage.roleStacks[1].account).toBe("999999999999");
    expect(stage.userStack.account).toBe("999999999999");
  });

  it("should enable standing repair only for configured environments", () => {
    const app = new cdk.App();
    const stage = new AgentOperationsStage(app, "TestStage", {
      agentOperations,
      externalId: "test-external-id",
      stageEnvironments: [devEnvironment],
      sharedEnvironment,
    });

    const devTemplate = cdk.assertions.Template.fromStack(stage.roleStacks[0]);
    const sharedTemplate = cdk.assertions.Template.fromStack(
      stage.roleStacks[1]
    );

    devTemplate.resourceCountIs("AWS::IAM::ManagedPolicy", 2);
    sharedTemplate.resourceCountIs("AWS::IAM::ManagedPolicy", 1);
    expect(attachedManagedPolicyNames(devTemplate)).toEqual([
      "AgentOperationsPolicy",
      "AgentOperationsRepairPolicy",
    ]);
    expect(attachedManagedPolicyNames(sharedTemplate)).toEqual([
      "AgentOperationsPolicy",
    ]);
  });

  it("should include every environment in the bootstrap profile bundle", () => {
    const app = new cdk.App();
    const stage = new AgentOperationsStage(app, "TestStage", {
      agentOperations,
      externalId: "test-external-id",
      stageEnvironments: [devEnvironment],
      sharedEnvironment,
    });
    const template = cdk.assertions.Template.fromStack(stage.userStack);
    expect(parseBootstrapProfiles(template)).toEqual({
      "agent-dev": {
        roleArn: "arn:aws:iam::111111111111:role/RemoteAgent",
        region: "us-east-1",
      },
      "agent-shared": {
        roleArn: "arn:aws:iam::999999999999:role/RemoteAgent",
        region: "us-east-1",
      },
    });
  });

  it("should never emit a bare environment name as a profile", () => {
    // These names are written into a human's ~/.aws/config. A bare `dev` would
    // sit beside, and could overwrite, their own SSO profile for the same
    // environment — which would silently hand agent commands a human identity.
    const app = new cdk.App();
    const stage = new AgentOperationsStage(app, "TestStage", {
      agentOperations,
      externalId: "test-external-id",
      stageEnvironments: [devEnvironment],
      sharedEnvironment,
    });
    const template = cdk.assertions.Template.fromStack(stage.userStack);
    const names = Object.keys(parseBootstrapProfiles(template));

    expect(names).not.toContain("dev");
    expect(names).not.toContain("shared");
    expect(names.every(name => name.startsWith("agent-"))).toBe(true);
  });

  it("should honour a configured prefix rather than hardcoding one", () => {
    const app = new cdk.App();
    const stage = new AgentOperationsStage(app, "TestStage", {
      agentOperations: { ...agentOperations, profilePrefix: "bot_" },
      externalId: "test-external-id",
      stageEnvironments: [devEnvironment],
      sharedEnvironment,
    });
    const template = cdk.assertions.Template.fromStack(stage.userStack);

    expect(Object.keys(parseBootstrapProfiles(template))).toEqual([
      "bot_dev",
      "bot_shared",
    ]);
  });

  it("should throw without an ExternalId", () => {
    const app = new cdk.App();

    expect(
      () =>
        new AgentOperationsStage(app, "TestStage", {
          agentOperations,
          externalId: "",
          stageEnvironments: [devEnvironment],
          sharedEnvironment,
        })
    ).toThrow(/AGENT_OPERATIONS_EXTERNAL_ID/);
  });
});
