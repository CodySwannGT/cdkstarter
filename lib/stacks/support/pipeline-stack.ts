/**
 * Pipeline Stack - CDK Pipeline for Multi-Account Deployment
 *
 * This stack creates a CDK Pipeline that orchestrates deployments to all
 * stage environments from a shared account. It uses GitHub as the source
 * via AWS CodeConnections (formerly CodeStar Connections).
 *
 * ## Pipeline Structure
 *
 * 1. **Source Stage**: Pulls code from GitHub on push to configured branch
 * 2. **Build Stage**: Runs `npm ci`, `npm run build`, and `cdk synth`
 * 3. **Deploy Stages**: Deploys to each configured environment
 *
 * ## Cross-Account Deployment
 *
 * The pipeline uses cross-account deployment with KMS encryption for artifacts.
 * Each target account must be bootstrapped with `--trust {pipelineAccountId}`
 * before the pipeline can deploy to it.
 *
 * ## Environment Filtering
 *
 * Environments with `accountId: "PLACEHOLDER"` are automatically filtered out.
 * This allows template development without real AWS account IDs.
 *
 * ## CodeConnections Setup
 *
 * Before using this pipeline, create a CodeConnection in the AWS Console:
 * 1. Go to CodePipeline > Settings > Connections
 * 2. Create connection to GitHub
 * 3. Authorize the connection
 * 4. Copy the connection ARN
 * @see https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.pipelines-readme.html
 * @see lib/stacks/support/trust-policy-stack.ts - Bootstrap trust configuration
 * @module lib/stacks/support/pipeline-stack
 */
import * as cdk from "aws-cdk-lib";
import * as pipelines from "aws-cdk-lib/pipelines";
import type { Construct } from "constructs";
import type { StageEnvironment } from "../../types";

/**
 * Configuration properties for PipelineStack.
 */
export interface PipelineStackProps extends cdk.StackProps {
  /**
   * GitHub repository owner (organization or username).
   * Example: "cdkstarter-io"
   */
  readonly repositoryOwner: string;

  /**
   * GitHub repository name.
   * Example: "infrastructure"
   */
  readonly repositoryName: string;

  /**
   * Git branch to deploy from.
   * Example: "main"
   */
  readonly branch: string;

  /**
   * ARN of the AWS CodeConnection to GitHub.
   * Create this in the CodePipeline settings before deployment.
   */
  readonly connectionArn: string;

  /**
   * Stage environments to deploy to.
   * Environments with PLACEHOLDER accountId are filtered out.
   */
  readonly stageEnvironments: readonly StageEnvironment[];
}

/**
 * Pipeline Stack creating CDK Pipeline for cross-account deployments.
 *
 * This stack is deployed to the shared account and creates a pipeline that
 * monitors a GitHub repository and deploys to all configured stage accounts.
 */
export class PipelineStack extends cdk.Stack {
  /**
   * The CDK Pipeline.
   */
  public readonly pipeline: pipelines.CodePipeline;

  /**
   * Filtered list of environments that will be deployed.
   * Excludes PLACEHOLDER environments.
   */
  public readonly deployableEnvironments: readonly StageEnvironment[];

  /**
   * Creates a new PipelineStack.
   * @param scope - Parent construct
   * @param id - Stack identifier
   * @param props - Stack configuration
   */
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const {
      repositoryOwner,
      repositoryName,
      branch,
      connectionArn,
      stageEnvironments,
    } = props;

    // Filter out PLACEHOLDER environments
    this.deployableEnvironments = stageEnvironments.filter(
      env => env.accountId !== "PLACEHOLDER"
    );

    // Create the CDK Pipeline
    this.pipeline = new pipelines.CodePipeline(this, "Pipeline", {
      pipelineName: "cdkstarter-infrastructure",
      crossAccountKeys: true,
      synth: new pipelines.ShellStep("Synth", {
        input: pipelines.CodePipelineSource.connection(
          `${repositoryOwner}/${repositoryName}`,
          branch,
          { connectionArn }
        ),
        commands: ["npm ci", "npm run build", "npx cdk synth"],
        primaryOutputDirectory: "cdk.out",
      }),
    });

    // Note: Stage addition is handled separately after pipeline creation
    // because cross-stage dependencies require additional coordination.
    // See bin/infrastructure.ts for stage orchestration.
    //
    // Call buildPipeline() after adding stages to build the pipeline.
    // Outputs are created in buildPipeline() because the pipeline
    // resource isn't available until then.
  }

  /**
   * Builds the pipeline and creates outputs.
   *
   * This method must be called after adding all stages to the pipeline.
   * It finalizes the pipeline structure and creates CloudFormation outputs.
   */
  public buildPipeline(): void {
    this.pipeline.buildPipeline();
    this.createOutputs();
  }

  /**
   * Creates CloudFormation outputs for pipeline information.
   */
  private createOutputs(): void {
    new cdk.CfnOutput(this, "PipelineArn", {
      value: this.pipeline.pipeline.pipelineArn,
      description: "CDK Pipeline ARN",
      exportName: "cdkstarter-pipeline-arn",
    });

    new cdk.CfnOutput(this, "DeployableEnvironments", {
      value: this.deployableEnvironments.map(e => e.name).join(","),
      description: "Environments that will be deployed",
    });
  }
}
