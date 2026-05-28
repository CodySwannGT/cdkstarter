/**
 * Tests for PipelineStack.
 *
 * @module test/stacks/support/pipeline-stack.test
 */
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import type { StageEnvironment, SupportEnvironment } from "../../../lib/types";
import { PipelineStack } from "../../../lib/stacks/support/pipeline-stack";

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

  const stagingEnvironment: StageEnvironment = {
    ...devEnvironment,
    name: "staging",
    accountId: "222222222222",
    network: { vpcCidr: "10.1.0.0/16" },
  };

  const placeholderEnvironment: StageEnvironment = {
    ...devEnvironment,
    name: "production",
    accountId: "PLACEHOLDER",
    network: { vpcCidr: "10.2.0.0/16" },
  };

  const supportEnvironment: SupportEnvironment = {
    type: "support",
    name: "shared",
    accountId: "999999999999",
    region: "us-east-1",
    purpose: { pipeline: true, dns: true, codeConnections: true },
  };

  const defaultProps = {
    repositoryOwner: "your-project-io",
    repositoryName: "infrastructure",
    branch: "main",
    connectionArn:
      "arn:aws:codestar-connections:us-east-1:999999999999:connection/test-connection",
    stageEnvironments: [devEnvironment, stagingEnvironment],
    supportEnvironment,
    env: { account: "999999999999", region: "us-east-1" },
  };

  const createStack = (props: Partial<typeof defaultProps> = {}): Template => {
    const app = new cdk.App();
    const stack = new PipelineStack(app, "TestStack", {
      ...defaultProps,
      ...props,
    });
    // Build the pipeline to finalize resources before creating template
    stack.buildPipeline();
    return Template.fromStack(stack);
  };

  describe("Pipeline Creation", () => {
    it("should create CodePipeline", () => {
      const template = createStack();

      // CDK Pipelines creates AWS::CodePipeline::Pipeline
      template.resourceCountIs("AWS::CodePipeline::Pipeline", 1);
    });

    it("should create pipeline with correct name", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CodePipeline::Pipeline", {
        Name: "your-project-infrastructure",
      });
    });
  });

  describe("Source Configuration", () => {
    it("should use GitHub connection source", () => {
      const template = createStack();

      // The pipeline should have a Source stage
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

    it("should use correct repository", () => {
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

      // Cross-account pipelines require a KMS key
      template.resourceCountIs("AWS::KMS::Key", 1);
    });
  });

  describe("PLACEHOLDER Filtering", () => {
    it("should skip PLACEHOLDER environments", () => {
      const app = new cdk.App();
      const stack = new PipelineStack(app, "TestStack", {
        ...defaultProps,
        stageEnvironments: [devEnvironment, placeholderEnvironment],
      });
      stack.buildPipeline();

      // Stack should still create successfully
      expect(stack).toBeDefined();
      expect(stack.deployableEnvironments).toHaveLength(1);
      expect(stack.deployableEnvironments[0].name).toBe("dev");
    });

    it("should include non-PLACEHOLDER environments", () => {
      const app = new cdk.App();
      const stack = new PipelineStack(app, "TestStack", {
        ...defaultProps,
        stageEnvironments: [devEnvironment, stagingEnvironment],
      });
      stack.buildPipeline();

      expect(stack.deployableEnvironments).toHaveLength(2);
    });
  });

  describe("Outputs", () => {
    it("should export pipeline ARN", () => {
      const template = createStack();

      template.hasOutput("PipelineArn", {
        Export: {
          Name: "your-project-pipeline-arn",
        },
      });
    });
  });
});
