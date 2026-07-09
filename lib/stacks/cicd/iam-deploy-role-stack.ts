/**
 * IAM Deploy Role Stack - GitHub Actions OIDC Deployment
 *
 * Creates the GitHub Actions OIDC identity provider and the deploy role
 * (default name "DeployServiceRole") that application repo workflows assume
 * via `aws-actions/configure-aws-credentials`:
 *
 * ```yaml
 * - uses: aws-actions/configure-aws-credentials@v4
 *   with:
 *     role-to-assume: arn:aws:iam::<accountId>:role/DeployServiceRole
 *     role-session-name: deploysession
 *     aws-region: us-east-1
 * ```
 *
 * No long-lived keys are stored in GitHub — the workflow exchanges its OIDC
 * token for short-lived credentials. The role's inline policy comes from
 * `util/policy-statements-for-deploy.ts`.
 *
 * Also creates the account-level API Gateway CloudWatch Logs role that
 * serverless framework deployments expect to exist.
 * @see util/policy-statements-for-deploy.ts - The role's permissions
 * @see lib/stacks/cicd/cdk-trust-policy-apply-stack.ts - Lets this role assume CDK bootstrap roles
 * @see config/github.ts - Owner/repo pattern configuration
 * @module lib/stacks/cicd/iam-deploy-role-stack
 */
import {
  GithubActionsIdentityProvider,
  GithubActionsRole,
} from "aws-cdk-github-oidc";
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";
import policyStatementsForDeploy from "../../../util/policy-statements-for-deploy";
import type { GitHubConfig } from "../../types";

/**
 * Configuration properties for IamDeployRoleStack.
 */
export interface IamDeployRoleStackProps extends cdk.StackProps {
  /**
   * Stage name for resource descriptions.
   */
  readonly stageName: string;

  /**
   * GitHub configuration (owner, repo pattern, deploy role name).
   */
  readonly github: GitHubConfig;
}

/**
 * Stack that creates IAM roles for GitHub Actions deployment using OIDC.
 */
export class IamDeployRoleStack extends cdk.Stack {
  /**
   * The GitHub Actions deploy role.
   */
  public readonly deployRole: GithubActionsRole;

  /**
   * Constructs an IamDeployRoleStack.
   * @param scope - Parent construct
   * @param id - Stack identifier
   * @param props - Stack configuration
   */
  constructor(scope: Construct, id: string, props: IamDeployRoleStackProps) {
    super(scope, id, props);

    const { github } = props;

    // Account-level service role letting API Gateway push execution logs to
    // CloudWatch. Serverless framework deploys fail without one configured.
    new iam.Role(this, "ApiGatewayLogRole", {
      assumedBy: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonAPIGatewayPushToCloudWatchLogs"
        ),
      ],
    });

    // One OIDC provider per account; GitHub's token issuer.
    const provider = new GithubActionsIdentityProvider(this, "GithubProvider");

    const policyDocument = new iam.PolicyDocument({
      statements: policyStatementsForDeploy(this.account, this.region).map(
        statement =>
          new iam.PolicyStatement({
            actions: [...statement.actions],
            resources: [...statement.resources],
            effect: iam.Effect.ALLOW,
          })
      ),
    });

    this.deployRole = new GithubActionsRole(this, "DeployServiceRole", {
      provider,
      owner: github.owner,
      repo: github.deployRepoPattern,
      roleName: github.deployRoleName,
      description:
        "Deploys application repos from GitHub Actions via OIDC (no stored keys)",
      maxSessionDuration: cdk.Duration.hours(2),
      inlinePolicies: {
        policy: policyDocument,
      },
    });

    new cdk.CfnOutput(this, "DeployRoleArn", {
      value: this.deployRole.roleArn,
      description: "ARN of the GitHub Actions OIDC deploy role",
      exportName: `${props.stageName}-deploy-service-role-arn`,
    });
  }
}
