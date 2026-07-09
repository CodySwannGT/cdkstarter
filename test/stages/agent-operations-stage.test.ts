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
    userName: "remote-agent",
    secretName: "remote-agent-credentials",
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
