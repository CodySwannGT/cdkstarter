/**
 * Trust Policy Stack - CDK Bootstrap Role Trust Configuration
 *
 * This stack documents and exports the trust relationships required for
 * cross-account CDK deployments. The shared account's pipeline needs to
 * assume roles in stage accounts to deploy infrastructure.
 *
 * ## CDK Bootstrap Trust Model
 *
 * When you run `cdk bootstrap`, it creates several IAM roles in the target account:
 * - **Deploy Role**: Assumed by the pipeline to create CloudFormation stacks
 * - **File Publishing Role**: Uploads assets to S3
 * - **Image Publishing Role**: Publishes Docker images to ECR
 * - **Lookup Role**: Performs context lookups during synthesis
 *
 * By default, these roles only trust the account where they were created.
 * To enable cross-account deployment, they must be bootstrapped with `--trust`.
 *
 * ## Manual Bootstrap Required
 *
 * Trust policies for CDK bootstrap roles cannot be modified through CDK itself
 * (chicken-and-egg problem). Instead, run the bootstrap command manually:
 *
 * ```bash
 * cdk bootstrap aws://{targetAccountId}/{region} \
 *   --trust {pipelineAccountId} \
 *   --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
 * ```
 *
 * This stack exports the bootstrap command needed for each stage account.
 * @see https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html
 * @see config/environments.ts - Environment account definitions
 * @module lib/stacks/support/trust-policy-stack
 */
import * as cdk from "aws-cdk-lib";
import type { Construct } from "constructs";

/**
 * Default CDK bootstrap qualifier.
 *
 * This is the default CDK qualifier (hnb659fds). Can be overridden via
 * props or the CDK_BOOTSTRAP_QUALIFIER environment variable.
 */
const DEFAULT_CDK_BOOTSTRAP_QUALIFIER = "hnb659fds";

/**
 * Default CloudFormation execution policy ARN.
 *
 * This is the default AdministratorAccess policy. Can be overridden via
 * props or the CDK_BOOTSTRAP_EXECUTION_POLICY_ARN environment variable.
 */
const DEFAULT_EXECUTION_POLICY_ARN =
  "arn:aws:iam::aws:policy/AdministratorAccess";

/**
 * Configuration properties for TrustPolicyStack.
 *
 * Each TrustPolicyStack represents the trust configuration between
 * the pipeline account (source) and a stage account (target).
 */
export interface TrustPolicyStackProps extends cdk.StackProps {
  /**
   * Stage name for resource naming and export prefixes.
   * Examples: "dev", "staging", "production"
   */
  readonly stageName: string;

  /**
   * AWS Account ID of the target stage environment.
   * This is where CDK will deploy infrastructure.
   */
  readonly targetAccountId: string;

  /**
   * AWS Account ID of the shared/pipeline account.
   * This is the account that runs the CDK Pipeline.
   */
  readonly pipelineAccountId: string;

  /**
   * AWS Region for the target environment.
   * CDK bootstrap is region-specific.
   */
  readonly targetRegion: string;

  /**
   * CDK bootstrap qualifier for role naming.
   *
   * Defaults to environment variable CDK_BOOTSTRAP_QUALIFIER or "hnb659fds".
   * Used in bootstrap role names: cdk-{qualifier}-{roleName}-{accountId}-{region}
   */
  readonly bootstrapQualifier?: string;

  /**
   * CloudFormation execution policy ARN for bootstrap.
   *
   * Defaults to environment variable CDK_BOOTSTRAP_EXECUTION_POLICY_ARN
   * or AdministratorAccess. Used to construct partition-aware ARNs for
   * GovCloud and China regions.
   */
  readonly executionPolicyArn?: string;
}

/**
 * Trust Policy Stack documenting CDK bootstrap trust relationships.
 *
 * This stack does not create resources directly. Instead, it:
 * 1. Computes the correct CDK bootstrap role ARNs for the target account
 * 2. Generates the bootstrap command needed to establish trust
 * 3. Exports these values for documentation and automation
 *
 * The actual trust relationship is established by running `cdk bootstrap`
 * with the `--trust` flag in the target account.
 */
export class TrustPolicyStack extends cdk.Stack {
  /**
   * ARN of the CDK deploy role in the target account.
   */
  public readonly deployRoleArn: string;

  /**
   * ARN of the CDK file publishing role in the target account.
   */
  public readonly filePublishRoleArn: string;

  /**
   * ARN of the CDK image publishing role in the target account.
   */
  public readonly imagePublishRoleArn: string;

  /**
   * ARN of the CDK lookup role in the target account.
   */
  public readonly lookupRoleArn: string;

  /**
   * The pipeline account ID (source of deployments).
   */
  public readonly pipelineAccountId: string;

  /**
   * The target account ID (destination for deployments).
   */
  public readonly targetAccountId: string;

  /**
   * The CDK bootstrap command to run in the target account.
   */
  public readonly bootstrapCommand: string;

  /**
   * The resolved CDK bootstrap qualifier.
   */
  private readonly qualifier: string;

  /**
   * The resolved execution policy ARN.
   */
  private readonly executionPolicyArn: string;

  /**
   * Creates a new TrustPolicyStack.
   * @param scope - Parent construct
   * @param id - Stack identifier
   * @param props - Stack configuration including account IDs
   */
  constructor(scope: Construct, id: string, props: TrustPolicyStackProps) {
    super(scope, id, props);

    const {
      stageName,
      targetAccountId,
      pipelineAccountId,
      targetRegion,
      bootstrapQualifier,
      executionPolicyArn,
    } = props;

    this.pipelineAccountId = pipelineAccountId;
    this.targetAccountId = targetAccountId;

    // Use provided props (already resolved by caller with env var fallbacks)
    this.qualifier = bootstrapQualifier || DEFAULT_CDK_BOOTSTRAP_QUALIFIER;

    // Use provided policy ARN
    this.executionPolicyArn =
      executionPolicyArn || DEFAULT_EXECUTION_POLICY_ARN;

    this.deployRoleArn = this.buildRoleArn(
      targetAccountId,
      targetRegion,
      "deploy-role"
    );
    this.filePublishRoleArn = this.buildRoleArn(
      targetAccountId,
      targetRegion,
      "file-publishing-role"
    );
    this.imagePublishRoleArn = this.buildRoleArn(
      targetAccountId,
      targetRegion,
      "image-publishing-role"
    );
    this.lookupRoleArn = this.buildRoleArn(
      targetAccountId,
      targetRegion,
      "lookup-role"
    );

    this.bootstrapCommand = this.buildBootstrapCommand(
      targetAccountId,
      targetRegion,
      pipelineAccountId
    );

    this.createOutputs(stageName);
  }

  /**
   * Builds the ARN for a CDK bootstrap role.
   *
   * CDK bootstrap roles follow a standard naming convention:
   * `cdk-{qualifier}-{roleName}-{accountId}-{region}`
   * @param accountId - Target account ID
   * @param region - Target region
   * @param roleName - Role name suffix (e.g., "deploy-role")
   * @returns The full role ARN
   */
  private buildRoleArn(
    accountId: string,
    region: string,
    roleName: string
  ): string {
    return `arn:aws:iam::${accountId}:role/cdk-${this.qualifier}-${roleName}-${accountId}-${region}`;
  }

  /**
   * Builds the CDK bootstrap command for establishing trust.
   *
   * This command must be run with credentials for the target account.
   * It updates the bootstrap roles to trust the pipeline account.
   * Constructs partition-aware ARNs for GovCloud and China regions.
   * @param targetAccountId - Account to bootstrap
   * @param targetRegion - Region to bootstrap
   * @param trustAccountId - Account to trust (pipeline account)
   * @returns The bootstrap command string
   */
  private buildBootstrapCommand(
    targetAccountId: string,
    targetRegion: string,
    trustAccountId: string
  ): string {
    // Construct partition-aware policy ARN
    // Default is standard AWS partition, but GovCloud uses 'aws-us-gov'
    // and China uses 'aws-cn'
    const policyArn = this.executionPolicyArn.includes("arn:")
      ? this.executionPolicyArn
      : `arn:${cdk.Aws.PARTITION}:iam::aws:policy/${this.executionPolicyArn}`;

    return [
      "cdk bootstrap",
      `aws://${targetAccountId}/${targetRegion}`,
      `--trust ${trustAccountId}`,
      `--cloudformation-execution-policies ${policyArn}`,
    ].join(" ");
  }

  /**
   * Creates CloudFormation outputs for documentation and automation.
   * @param stageName - Stage name for export name prefixes
   */
  private createOutputs(stageName: string): void {
    new cdk.CfnOutput(this, "BootstrapCommand", {
      value: this.bootstrapCommand,
      description: "CDK bootstrap command for the target account",
      exportName: `${stageName}-trust-bootstrap-command`,
    });

    new cdk.CfnOutput(this, "DeployRoleArn", {
      value: this.deployRoleArn,
      description: "CDK deploy role ARN in the target account",
      exportName: `${stageName}-trust-deploy-role-arn`,
    });

    new cdk.CfnOutput(this, "FilePublishRoleArn", {
      value: this.filePublishRoleArn,
      description: "CDK file publishing role ARN in the target account",
      exportName: `${stageName}-trust-file-publish-role-arn`,
    });

    new cdk.CfnOutput(this, "ImagePublishRoleArn", {
      value: this.imagePublishRoleArn,
      description: "CDK image publishing role ARN in the target account",
      exportName: `${stageName}-trust-image-publish-role-arn`,
    });

    new cdk.CfnOutput(this, "LookupRoleArn", {
      value: this.lookupRoleArn,
      description: "CDK lookup role ARN in the target account",
      exportName: `${stageName}-trust-lookup-role-arn`,
    });
  }
}
