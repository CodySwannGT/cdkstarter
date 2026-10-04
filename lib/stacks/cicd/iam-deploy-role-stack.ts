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
 * Infrastructure administrators manage CDK bootstrap separately. Application
 * credentials cannot assume bootstrap or arbitrary roles.
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
    const subjects = deploymentSubjects(github);

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

    const prefix = `${github.infrastructureRepo}-${props.stageName}-`;
    const deployment = github.applicationDeploy ?? {
      stackPrefix: prefix,
      resourcePrefix: prefix,
      applicationRoleNames: [`${prefix}runtime`],
    };
    for (const value of [deployment.stackPrefix, deployment.resourcePrefix]) {
      if (!/^[a-zA-Z][a-zA-Z0-9-]*-$/.test(value))
        throw new Error(
          "Application deployment prefixes must be exact names ending in a hyphen"
        );
    }
    const executionName = `${deployment.resourcePrefix}CloudFormationExecution`;
    if (
      !deployment.applicationRoleNames.length ||
      deployment.applicationRoleNames.some(
        name =>
          !/^[A-Za-z0-9-]+$/.test(name) ||
          !name.startsWith(deployment.resourcePrefix) ||
          [executionName, github.deployRoleName].includes(name)
      )
    ) {
      throw new Error(
        "Application role allowlist must contain exact names within the protected namespace"
      );
    }
    const boundaryName = `${deployment.resourcePrefix}ApplicationBoundary`;
    const boundaryArn = `arn:${this.partition}:iam::${this.account}:policy/${boundaryName}`;
    const executionArn = `arn:${this.partition}:iam::${this.account}:role/${executionName}`;
    const statements = policyStatementsForDeploy(
      this.account,
      this.region,
      deployment,
      boundaryArn,
      executionArn,
      `arn:${this.partition}:iam::${this.account}:role/${github.deployRoleName}`
    );
    const boundary = new iam.ManagedPolicy(this, "ApplicationBoundary", {
      managedPolicyName: boundaryName,
      statements,
    });
    const policyDocument = new iam.PolicyDocument({ statements });
    const executionRole = new iam.Role(this, "ApplicationExecutionRole", {
      roleName: executionName,
      assumedBy: new iam.ServicePrincipal("cloudformation.amazonaws.com"),
      permissionsBoundary: boundary,
      inlinePolicies: { application: policyDocument },
    });
    new cdk.CfnOutput(this, "ApplicationExecutionRoleArn", {
      value: executionRole.roleArn,
    });
    new cdk.CfnOutput(this, "ApplicationBoundaryArn", {
      value: boundary.managedPolicyArn,
    });

    this.deployRole = new GithubActionsRole(this, "DeployServiceRole", {
      provider,
      owner: github.owner,
      repo: github.deployRepositories![0]!.name,
      ownerId: github.ownerId,
      repoId: github.deployRepositories![0]!.id,
      filter: "ref:refs/heads/never-implicitly-allowed",
      roleName: github.deployRoleName,
      description:
        "Deploys application repos from GitHub Actions via OIDC (no stored keys)",
      maxSessionDuration: cdk.Duration.hours(2),
      permissionsBoundary: boundary,
      inlinePolicies: {
        policy: policyDocument,
      },
    });

    // Replace the construct's single subject with the validated exact allowlist.
    const role = this.deployRole.node.defaultChild as iam.CfnRole;
    role.assumeRolePolicyDocument = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          actions: ["sts:AssumeRoleWithWebIdentity"],
          principals: [
            new iam.FederatedPrincipal(
              provider.oidcProviderArn,
              {},
              "sts:AssumeRoleWithWebIdentity"
            ),
          ],
          conditions: {
            StringEquals: {
              "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
              "token.actions.githubusercontent.com:sub": subjects,
            },
          },
        }),
      ],
    });

    new cdk.CfnOutput(this, "DeployRoleArn", {
      value: this.deployRole.roleArn,
      description: "ARN of the GitHub Actions OIDC deploy role",
      exportName: `${props.stageName}-deploy-service-role-arn`,
    });
  }
}

/**
 * Validate exact immutable subjects before creating deploy resources.
 * @param github - Explicit repository identity and filter configuration
 * @returns Exact allowed OIDC subject strings
 */
const deploymentSubjects = (github: GitHubConfig): string[] => {
  if (
    !/^[1-9]\d*$/.test(github.ownerId ?? "") ||
    !/^[A-Za-z0-9-]+$/.test(github.owner)
  ) {
    throw new Error(
      "OIDC deployment requires a valid owner and numeric ownerId"
    );
  }
  if (!github.deployRepositories?.length)
    throw new Error("OIDC deployment requires explicit deployRepositories");
  return github.deployRepositories.flatMap(repository => {
    if (
      !/^[A-Za-z0-9_.-]+$/.test(repository.name) ||
      !/^[1-9]\d*$/.test(repository.id)
    ) {
      throw new Error(
        "OIDC deployment requires exact repository names and numeric IDs"
      );
    }
    const filters = [
      ...(repository.refs ?? []).map(ref => {
        if (!/^refs\/(heads|tags)\/[^*?:\s]+$/.test(ref))
          throw new Error("OIDC refs must be exact heads or tags");
        return `ref:${ref}`;
      }),
      ...(repository.environments ?? []).map(environment => {
        if (!environment.trim() || /[*?\s]/.test(environment))
          throw new Error("OIDC environments must be exact names");
        return `environment:${environment.replace(/:/g, "%3A")}`;
      }),
    ];
    if (!filters.length)
      throw new Error(
        "OIDC repositories require explicit refs or environments"
      );
    return filters.flatMap(filter => [
      `repo:${github.owner}@${github.ownerId}/${repository.name}@${repository.id}:${filter}`,
      ...(github.allowLegacyDeploySubjects
        ? [`repo:${github.owner}/${repository.name}:${filter}`]
        : []),
    ]);
  });
};
