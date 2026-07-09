/**
 * CI/CD Stage - GitHub Actions Deployment Enablement
 *
 * Bundles the per-account CI/CD infrastructure that lets application repos
 * deploy from GitHub Actions:
 *
 * 1. IamDeployRoleStack — OIDC identity provider + DeployServiceRole
 * 2. CdkTrustPolicyApplyStack — lets that role assume the CDK bootstrap roles
 * 3. GitHubIamPolicyStack — only when a legacy deploy IAM user is configured
 *
 * The trust-policy stack depends on the deploy role stack (it looks up the
 * role's ID at deploy time).
 *
 * The in-VPC migration runner is deliberately NOT here — it needs VPC and
 * security group objects, so it lives with the network stacks.
 * @see lib/stacks/cicd/iam-deploy-role-stack.ts
 * @see lib/stacks/cicd/cdk-trust-policy-apply-stack.ts
 * @see lib/stacks/cicd/github-iam-policy-stack.ts
 * @module lib/stages/cicd-stage
 */
import * as cdk from "aws-cdk-lib";
import type { Construct } from "constructs";
import { CdkTrustPolicyApplyStack } from "../stacks/cicd/cdk-trust-policy-apply-stack";
import { GitHubIamPolicyStack } from "../stacks/cicd/github-iam-policy-stack";
import { IamDeployRoleStack } from "../stacks/cicd/iam-deploy-role-stack";
import type { GitHubConfig, StageEnvironment } from "../types";

/**
 * Configuration properties for CicdStage.
 */
export interface CicdStageProps extends cdk.StageProps {
  /**
   * Stage environment configuration.
   */
  readonly environment: StageEnvironment;

  /**
   * GitHub configuration (owner, repo pattern, deploy role name).
   */
  readonly github: GitHubConfig;

  /**
   * AWS account ID of the shared/pipeline account trusted by the
   * bootstrap roles.
   */
  readonly sharedAccountId: string;

  /**
   * CDK bootstrap qualifier for bootstrap role names.
   */
  readonly bootstrapQualifier: string;
}

/**
 * CI/CD Stage creating GitHub Actions deployment infrastructure for
 * an environment.
 */
export class CicdStage extends cdk.Stage {
  /**
   * The OIDC deploy role stack.
   */
  public readonly iamDeployRoleStack: IamDeployRoleStack;

  /**
   * The bootstrap trust-policy stack.
   */
  public readonly trustPolicyApplyStack: CdkTrustPolicyApplyStack;

  /**
   * The legacy GitHub user policy stack (only when a user is configured).
   */
  public readonly githubIamPolicyStack?: GitHubIamPolicyStack;

  /**
   * Creates a new CicdStage.
   * @param scope - Parent construct
   * @param id - Stage identifier
   * @param props - Stage configuration
   */
  constructor(scope: Construct, id: string, props: CicdStageProps) {
    super(scope, id, props);

    const { environment, github, sharedAccountId, bootstrapQualifier } = props;
    const { name: stageName } = environment;

    this.iamDeployRoleStack = new IamDeployRoleStack(this, "IamDeployRole", {
      stageName,
      github,
      stackName: `${stageName}-iam-deploy-role`,
    });

    this.trustPolicyApplyStack = new CdkTrustPolicyApplyStack(
      this,
      "CdkTrustPolicyApply",
      {
        stageName,
        accountId: environment.accountId,
        sharedAccountId,
        deployServiceRoleName: github.deployRoleName,
        bootstrapQualifier,
        githubUserName: github.deployUserName,
        stackName: `${stageName}-cdk-trust-policy`,
      }
    );

    // The trust update looks up the deploy role's ID — the role must exist first.
    this.trustPolicyApplyStack.addDependency(this.iamDeployRoleStack);

    if (github.deployUserName) {
      this.githubIamPolicyStack = new GitHubIamPolicyStack(
        this,
        "GitHubIamPolicy",
        {
          stageName,
          githubUserName: github.deployUserName,
          bootstrapQualifier,
          stackName: `${stageName}-github-iam-policy`,
        }
      );
    }
  }
}
