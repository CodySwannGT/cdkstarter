/**
 * Migration Runner Stack - In-VPC GitHub Actions Runner for Schema Migrations
 *
 * Creates a CodeBuild project that acts as a GitHub Actions self-hosted
 * runner INSIDE the VPC, so database migration jobs have direct network
 * access to Aurora — the CI-side alternative to a Client VPN (developers get
 * the SSM relay instead; see lib/stacks/network/ssm-relay-stack.ts).
 *
 * ## How the Runner Is Invoked
 *
 * CodeBuild's GitHub Actions runner integration triggers on the
 * WORKFLOW_JOB_QUEUED webhook event when a job's `runs-on` label matches
 * `codebuild-migration-runner-{stage}-{run_id}-{run_attempt}`:
 *
 * ```yaml
 * migrate:
 *   runs-on: codebuild-migration-runner-${{ needs.env.outputs.stage }}-${{ github.run_id }}-${{ github.run_attempt }}
 *   steps:
 *     - uses: actions/checkout@v4
 *     - run: STAGE=... npm run migration:run
 * ```
 *
 * AWS credentials come from the CodeBuild service role, so the workflow
 * needs no OIDC configure-aws-credentials step. buildSpec is intentionally
 * omitted: self-hosted-runner projects execute the GitHub Actions workflow
 * steps rather than a CodeBuild buildspec.
 *
 * ## GitHub Authentication
 *
 * Uses the shared CodeConnections connection (RAM-shared into this account;
 * see lib/stacks/support/codeconnections-share-stack.ts). PassConnection is
 * required when CloudFormation creates a CodeBuild project whose source is a
 * CODECONNECTIONS-authed GitHub source with a webhook trigger. It is an
 * identity-only permission (analogous to iam:PassRole), so it must be
 * granted on the service role here and cannot be delivered via the RAM
 * share of the connection.
 * @see lib/stacks/support/codeconnections-share-stack.ts - Cross-account connection share
 * @see config/github.ts - Repository configuration
 * @module lib/stacks/cicd/migration-runner-stack
 */
import * as cdk from "aws-cdk-lib";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import type * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";
import type { GitHubConfig } from "../../types";

/**
 * Configuration properties for MigrationRunnerStack.
 */
export interface MigrationRunnerStackProps extends cdk.StackProps {
  /**
   * Stage name for resource naming.
   */
  readonly stageName: string;

  /**
   * GitHub configuration (owner, migration runner repo, connection ARN).
   */
  readonly github: GitHubConfig;

  /**
   * VPC the runner executes in (private subnets with egress).
   */
  readonly vpc: ec2.IVpc;

  /**
   * Security group attached to the runner; must be allowed ingress on the
   * Aurora security group (port 5432).
   */
  readonly securityGroup: ec2.ISecurityGroup;
}

/**
 * CodeBuild-hosted GitHub Actions runner for database schema migrations.
 */
export class MigrationRunnerStack extends cdk.Stack {
  /**
   * The migration runner CodeBuild project.
   */
  public readonly project: codebuild.Project;

  /**
   * Creates the migration runner project and its least-privileged role.
   * @param scope - Parent construct
   * @param id - Stack identifier
   * @param props - Stack configuration
   */
  constructor(scope: Construct, id: string, props: MigrationRunnerStackProps) {
    super(scope, id, props);

    const { stageName, github, vpc, securityGroup } = props;

    if (!github.codeConnectionArn.startsWith("arn:")) {
      throw new Error(
        "The migration runner requires a real CodeConnections connection ARN in config/github.ts " +
          "(currently a placeholder). Create the connection and update the config, " +
          "or disable features.migrationRunner for this environment."
      );
    }

    // CodeConnections permissions for GitHub authentication. PassConnection
    // is required so CodeBuild can register the workflow-job-queued webhook
    // against the shared GitHub App connection when CloudFormation creates
    // this project; it is identity-only and cannot come from the RAM share.
    const codeConnectionsStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "codeconnections:UseConnection",
        "codeconnections:GetConnectionToken",
        "codeconnections:GetConnection",
        "codeconnections:PassConnection",
      ],
      resources: [github.codeConnectionArn],
    });

    // Register the connection as this account's GitHub source credential.
    new codebuild.CfnSourceCredential(this, "GitHubCredentials", {
      authType: "CODECONNECTIONS",
      serverType: "GITHUB",
      token: github.codeConnectionArn,
    });

    // Dedicated least-privileged IAM role for the migration runner.
    //
    // The migration runner only needs to deliver build logs, read database
    // credentials/connection parameters from SecretsManager and SSM, and
    // connect to Aurora via IAM auth. Deployment-plane permissions are
    // intentionally omitted to minimise blast radius. VPC ENI permissions
    // are added automatically by CDK when the project is placed in a VPC.
    const migrationRunnerRole = new iam.Role(this, "MigrationRunnerRole", {
      assumedBy: new iam.ServicePrincipal("codebuild.amazonaws.com"),
      roleName: `migration-runner-role-${stageName}`,
      description:
        "Least-privileged role for the migration runner CodeBuild project",
      inlinePolicies: {
        migrationRunnerPolicy: new iam.PolicyDocument({
          statements: [
            // CloudWatch Logs – build output delivery
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents",
              ],
              resources: [
                `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/codebuild/migration-runner-${stageName}`,
                `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/codebuild/migration-runner-${stageName}:*`,
              ],
            }),
            // SecretsManager – database credentials
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["secretsmanager:GetSecretValue"],
              resources: [
                `arn:aws:secretsmanager:${this.region}:${this.account}:secret:*db*`,
                `arn:aws:secretsmanager:${this.region}:${this.account}:secret:*database*`,
                `arn:aws:secretsmanager:${this.region}:${this.account}:secret:*migration*`,
                `arn:aws:secretsmanager:${this.region}:${this.account}:secret:*aurora*`,
              ],
            }),
            // SSM Parameter Store – database connection parameters
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                "ssm:GetParameter",
                "ssm:GetParameters",
                "ssm:GetParametersByPath",
              ],
              resources: [
                `arn:aws:ssm:${this.region}:${this.account}:parameter/*`,
              ],
            }),
            // KMS – decrypt SSM/SecretsManager values
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["kms:Decrypt", "kms:GenerateDataKey"],
              resources: ["*"],
            }),
            // RDS IAM auth – connect to Aurora
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["rds-db:connect"],
              resources: ["*"],
            }),
            // CloudFormation – migration tooling reads stack outputs and
            // resolves cross-stack exports for connection parameters.
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                "cloudformation:Describe*",
                "cloudformation:List*",
                "cloudformation:GetTemplate",
              ],
              resources: ["*"],
            }),
            codeConnectionsStatement,
          ],
        }),
      },
    });

    // Migration runner CodeBuild project.
    //
    // MEDIUM compute is required: SMALL (3 GB / 2 vCPU) OOM/CPU-starves the
    // runner agent during dependency install + build + migrations, surfacing
    // as "self-hosted runner lost communication". The 90-minute timeout is a
    // ceiling for production-scale migrations (for example materialized view
    // rebuilds); small environments are unaffected.
    this.project = new codebuild.Project(this, "MigrationRunnerProject", {
      projectName: `migration-runner-${stageName}`,
      description: "GitHub Actions self-hosted runner for schema migrations",
      source: codebuild.Source.gitHub({
        owner: github.owner,
        repo: github.migrationRunnerRepo,
        webhook: true,
        webhookFilters: [
          codebuild.FilterGroup.inEventOf(
            codebuild.EventAction.WORKFLOW_JOB_QUEUED
          ),
        ],
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        privileged: false,
        computeType: codebuild.ComputeType.MEDIUM,
      },
      timeout: cdk.Duration.minutes(90),
      vpc,
      subnetSelection: {
        subnetType: cdk.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [securityGroup as ec2.SecurityGroup],
      role: migrationRunnerRole,
    });

    new cdk.CfnOutput(this, "MigrationRunnerProjectArn", {
      value: this.project.projectArn,
      description: "The ARN of the migration runner CodeBuild project",
      exportName: `${stageName}-migration-runner-project-arn`,
    });

    new cdk.CfnOutput(this, "MigrationRunnerProjectName", {
      value: this.project.projectName,
      description: "The name of the migration runner CodeBuild project",
      exportName: `${stageName}-migration-runner-project-name`,
    });
  }
}
