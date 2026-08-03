/**
 * Tests for PipelineStack.
 *
 * @module test/stacks/support/pipeline-stack.test
 */
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import type {
  AgentOperationsConfig,
  AlarmThresholds,
  DomainConfig,
  GitHubConfig,
  StageEnvironment,
  SupportEnvironment,
} from "../../../lib/types";
import {
  MANUAL_APPROVAL_STEP_NAME,
  PipelineStack,
  shouldAddManualApproval,
} from "../../../lib/stacks/support/pipeline-stack";

describe("PipelineStack", () => {
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
    deployment: {
      requireManualApproval: false,
    },
  };

  const productionEnvironment: StageEnvironment = {
    ...devEnvironment,
    name: "production",
    accountId: "222222222222",
    network: { vpcCidr: "10.2.0.0/16" },
    deployment: {
      requireManualApproval: true,
    },
  };

  const supportEnvironment: SupportEnvironment = {
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

  const githubConfig: GitHubConfig = {
    owner: "your-project-io",
    infrastructureRepo: "infrastructure",
    branch: "main",
    codeConnectionArn:
      "arn:aws:codestar-connections:us-east-1:999999999999:connection/test-connection",
    deployRoleName: "DeployServiceRole",
    deployRepoPattern: "*",
    migrationRunnerRepo: "backend",
  };

  const domainConfig: DomainConfig = { domains: [] };

  const alarmThresholds: AlarmThresholds = {
    aurora: {
      cpuWarning: 70,
      cpuCritical: 90,
      memoryWarningMB: 512,
      memoryCriticalMB: 256,
      connectionsWarning: 80,
      connectionsCritical: 100,
      replicationLagWarningMs: 1000,
      replicationLagCriticalMs: 5000,
      freeStorageCriticalGB: 10,
    },
    valkey: {
      cpuWarning: 70,
      cpuCritical: 90,
      cacheHitRateWarning: 80,
      cacheHitRateCritical: 50,
      evictionsWarning: 100,
      evictionsCritical: 1000,
    },
  };

  const defaultProps = {
    github: githubConfig,
    stageEnvironments: [devEnvironment],
    supportEnvironment,
    domainConfig,
    alarmThresholds,
    bootstrapQualifier: "hnb659fds",
    executionPolicyArn: "arn:aws:iam::aws:policy/AdministratorAccess",
    env: { account: "999999999999", region: "us-east-1" },
    // Typed rather than omitted so `Partial<typeof defaultProps>` carries the
    // property, letting a case override it without widening createStack.
    agentOperations: undefined as AgentOperationsConfig | undefined,
  };

  const createStack = (props: Partial<typeof defaultProps> = {}): Template => {
    const app = new cdk.App();
    const stack = new PipelineStack(app, "TestStack", {
      ...defaultProps,
      ...props,
    });
    app.synth();
    return Template.fromStack(stack);
  };

  describe("Pipeline Creation", () => {
    it("should create CodePipeline", () => {
      const template = createStack();

      template.resourceCountIs("AWS::CodePipeline::Pipeline", 1);
    });

    it("should create pipeline with correct name", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CodePipeline::Pipeline", {
        Name: "InfrastructurePipeline",
      });
    });

    it("should throw when the connection ARN is a placeholder", () => {
      const app = new cdk.App();

      expect(
        () =>
          new PipelineStack(app, "TestStack", {
            ...defaultProps,
            github: { ...githubConfig, codeConnectionArn: "PLACEHOLDER" },
          })
      ).toThrow(/CodeConnections connection ARN/);
    });
  });

  describe("Failure Notifications", () => {
    it("should notify the security topic on pipeline execution failure", () => {
      const template = createStack();

      template.hasResourceProperties(
        "AWS::CodeStarNotifications::NotificationRule",
        {
          EventTypeIds: ["codepipeline-pipeline-pipeline-execution-failed"],
        }
      );
    });
  });

  describe("Source Configuration", () => {
    it("should use GitHub connection source", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CodePipeline::Pipeline", {
        Stages: Match.arrayWith([
          Match.objectLike({
            Name: "Source",
            Actions: Match.arrayWith([
              Match.objectLike({
                ActionTypeId: {
                  Category: "Source",
                  Provider: "CodeStarSourceConnection",
                },
              }),
            ]),
          }),
        ]),
      });
    });

    it("should use correct repository and branch", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CodePipeline::Pipeline", {
        Stages: Match.arrayWith([
          Match.objectLike({
            Name: "Source",
            Actions: Match.arrayWith([
              Match.objectLike({
                Configuration: Match.objectLike({
                  FullRepositoryId: "your-project-io/infrastructure",
                  BranchName: "main",
                }),
              }),
            ]),
          }),
        ]),
      });
    });
  });

  describe("Synth Step", () => {
    it("should have Build stage", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CodePipeline::Pipeline", {
        Stages: Match.arrayWith([
          Match.objectLike({
            Name: "Build",
          }),
        ]),
      });
    });
  });

  describe("Cross-Account Configuration", () => {
    it("should create KMS key for cross-account artifact encryption", () => {
      const template = createStack();

      template.resourceCountIs("AWS::KMS::Key", 1);
    });
  });

  describe("Stage Composition", () => {
    it("should deploy the support stage before environment stages", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CodePipeline::Pipeline", {
        Stages: Match.arrayWith([
          Match.objectLike({ Name: "Support" }),
          Match.objectLike({ Name: "Env-dev" }),
        ]),
      });
    });

    it("should add a CI/CD stage when githubOidcDeploy is enabled", () => {
      const template = createStack({
        stageEnvironments: [
          {
            ...devEnvironment,
            features: { ...devEnvironment.features, githubOidcDeploy: true },
          },
        ],
      });

      template.hasResourceProperties("AWS::CodePipeline::Pipeline", {
        Stages: Match.arrayWith([Match.objectLike({ Name: "Cicd-dev" })]),
      });
    });

    it("should not add a CI/CD stage when githubOidcDeploy is disabled", () => {
      const template = createStack();

      const pipelines = template.findResources("AWS::CodePipeline::Pipeline");
      const stages = Object.values(pipelines)[0].Properties.Stages as {
        Name: string;
      }[];

      expect(stages.map(stage => stage.Name)).not.toContain("Cicd-dev");
    });
  });

  describe("Promotion Gates", () => {
    it("should gate environments that require manual approval", () => {
      const template = createStack({
        stageEnvironments: [devEnvironment, productionEnvironment],
      });

      template.hasResourceProperties("AWS::CodePipeline::Pipeline", {
        Stages: Match.arrayWith([
          Match.objectLike({
            Name: "Env-production",
            Actions: Match.arrayWith([
              Match.objectLike({
                ActionTypeId: Match.objectLike({ Category: "Approval" }),
              }),
            ]),
          }),
        ]),
      });
    });

    it("should not gate environments that deploy automatically", () => {
      const template = createStack();

      const pipelines = template.findResources("AWS::CodePipeline::Pipeline");
      const stages = Object.values(pipelines)[0].Properties.Stages as {
        Name: string;
        Actions: { ActionTypeId: { Category: string } }[];
      }[];
      const devStage = stages.find(stage => stage.Name === "Env-dev");

      expect(devStage).toBeDefined();
      expect(
        devStage?.Actions.some(
          action => action.ActionTypeId.Category === "Approval"
        )
      ).toBe(false);
    });

    it("shouldAddManualApproval should follow environment config", () => {
      expect(shouldAddManualApproval(devEnvironment)).toBe(false);
      expect(shouldAddManualApproval(productionEnvironment)).toBe(true);
    });

    it("should export a stable approval step name", () => {
      expect(MANUAL_APPROVAL_STEP_NAME).toBe("approval");
    });
  });
  describe("Agent Operations ExternalId", () => {
    const agentOperations = {
      enabled: true,
      roleName: "RemoteAgent",
      policyName: "AgentOperationsPolicy",
      repairPolicyName: "AgentOperationsRepairPolicy",
      repairEnvironmentNames: ["dev"],
      userName: "remote-agent",
      secretName: "remote-agent-credentials",
      externalIdSecretName: "agent-operations-external-id",
      profilePrefix: "agent-",
    };

    /**
     * Find the synth project's AGENT_OPERATIONS_EXTERNAL_ID variable.
     * @param template Synthesized pipeline template
     * @returns The environment variable definition, if wired
     */
    const findExternalIdVariable = (
      template: Template
    ): Record<string, unknown> | undefined => {
      const projects = template.findResources("AWS::CodeBuild::Project");
      for (const project of Object.values(projects)) {
        const variables =
          project.Properties?.Environment?.EnvironmentVariables ?? [];
        const match = variables.find(
          (variable: { Name?: string }) =>
            variable.Name === "AGENT_OPERATIONS_EXTERNAL_ID"
        );
        if (match) {
          return match;
        }
      }
      return undefined;
    };

    // The bug this guards: synthesis happens inside the pipeline's CodeBuild
    // project, not on the workstation that deploys this stack. With no wiring
    // here, `bin/app.ts` saw an undefined ExternalId on every self-mutation and
    // silently dropped the agent-operations stage — no error, nothing deployed.
    it("wires the ExternalId into the synth environment", () => {
      const template = createStack({ agentOperations });

      expect(findExternalIdVariable(template)).toEqual({
        Name: "AGENT_OPERATIONS_EXTERNAL_ID",
        Type: "SECRETS_MANAGER",
        Value: "agent-operations-external-id",
      });
    });

    // Keyed off `enabled` alone, NOT off a locally-present value. Requiring the
    // value here would recreate the same bootstrap problem one level up: the
    // wiring could never be deployed by a pipeline that lacks it.
    it("wires it without the value being present locally", () => {
      const previous = process.env.AGENT_OPERATIONS_EXTERNAL_ID;
      delete process.env.AGENT_OPERATIONS_EXTERNAL_ID;
      try {
        expect(
          findExternalIdVariable(createStack({ agentOperations }))
        ).toBeDefined();
      } finally {
        if (previous !== undefined) {
          process.env.AGENT_OPERATIONS_EXTERNAL_ID = previous;
        }
      }
    });

    it("resolves at build time rather than embedding the value", () => {
      const template = createStack({ agentOperations });

      // SECRETS_MANAGER makes CodeBuild fetch it in the container. A PLAINTEXT
      // variable would place the ExternalId in the project definition, readable
      // by anyone holding codebuild:BatchGetProjects.
      expect(findExternalIdVariable(template)?.Type).toBe("SECRETS_MANAGER");
    });

    it("grants the synth role read access, scoped to that one secret", () => {
      const template = createStack({ agentOperations });

      // hasResourceProperties throws on mismatch and is an assertion in
      // substance, but SonarCloud's static analysis does not recognise a bare
      // call as one and reports the test as assertion-free.
      expect(() =>
        template.hasResourceProperties("AWS::IAM::Policy", {
          PolicyDocument: {
            Statement: Match.arrayWith([
              Match.objectLike({
                Action: "secretsmanager:GetSecretValue",
                Resource: {
                  "Fn::Join": Match.arrayWith([
                    Match.arrayWith([
                      Match.stringLikeRegexp(
                        "secret:agent-operations-external-id-\\?{6}$"
                      ),
                    ]),
                  ]),
                },
              }),
            ]),
          },
        })
      ).not.toThrow();
    });

    it("wires nothing when agent operations are disabled", () => {
      const template = createStack({
        agentOperations: { ...agentOperations, enabled: false },
      });

      expect(findExternalIdVariable(template)).toBeUndefined();
    });

    it("wires nothing when agent operations are unconfigured", () => {
      expect(findExternalIdVariable(createStack())).toBeUndefined();
    });
  });
});
