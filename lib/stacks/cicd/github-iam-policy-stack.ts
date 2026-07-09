/**
 * GitHub IAM Policy Stack - Legacy Deploy User Bootstrap Access
 *
 * Grants a pre-existing GitHub deploy IAM user permission to assume the CDK
 * bootstrap roles in this account. Only needed for legacy access-key based
 * GitHub Actions deploys — new projects should rely on the OIDC deploy role
 * instead (lib/stacks/cicd/iam-deploy-role-stack.ts) and leave
 * `github.deployUserName` unset.
 *
 * ## The Imported-User Workaround
 *
 * CDK cannot attach a managed policy to an imported user
 * (`User.fromUserName(...).addManagedPolicy()` is not supported), so this
 * stack attaches the policy with an `AwsCustomResource` calling
 * `iam:AttachUserPolicy` / `iam:DetachUserPolicy`.
 * @see lib/stacks/cicd/iam-deploy-role-stack.ts - The OIDC alternative
 * @module lib/stacks/cicd/github-iam-policy-stack
 */
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";

/**
 * Configuration properties for GitHubIamPolicyStack.
 */
export interface GitHubIamPolicyStackProps extends cdk.StackProps {
  /**
   * Stage name for policy naming and export prefixes.
   */
  readonly stageName: string;

  /**
   * Name of the pre-existing GitHub deploy IAM user in this account.
   */
  readonly githubUserName: string;

  /**
   * CDK bootstrap qualifier used in bootstrap role names.
   */
  readonly bootstrapQualifier: string;
}

/**
 * Stack that grants a GitHub deploy user permission to assume CDK
 * bootstrap roles.
 */
export class GitHubIamPolicyStack extends cdk.Stack {
  /**
   * Managed policy attached to the GitHub deploy user.
   */
  public readonly policy: iam.ManagedPolicy;

  /**
   * Constructs a GitHubIamPolicyStack.
   * @param scope - Parent construct
   * @param id - Stack identifier
   * @param props - Stack configuration
   */
  constructor(scope: Construct, id: string, props: GitHubIamPolicyStackProps) {
    super(scope, id, props);

    const { stageName, githubUserName, bootstrapQualifier } = props;

    if (!githubUserName || githubUserName.trim() === "") {
      throw new Error("GitHub user name cannot be empty");
    }

    this.policy = new iam.ManagedPolicy(this, "GitHubDeployPolicy", {
      managedPolicyName: `GitHubDeployUserCDKAccessPolicy-${stageName}`,
      description: `Policy granting the GitHub Actions user permission to assume CDK bootstrap roles in ${stageName}`,
      statements: [this.createAssumeRoleStatement(bootstrapQualifier)],
    });

    // Attach the policy to the existing user via custom resource — CDK
    // doesn't support adding policies to imported users.
    new cdk.custom_resources.AwsCustomResource(this, "AttachPolicyToUser", {
      onCreate: {
        service: "IAM",
        action: "attachUserPolicy",
        parameters: {
          UserName: githubUserName,
          PolicyArn: this.policy.managedPolicyArn,
        },
        physicalResourceId: cdk.custom_resources.PhysicalResourceId.of(
          `${githubUserName}-${this.policy.managedPolicyName}`
        ),
      },
      onDelete: {
        service: "IAM",
        action: "detachUserPolicy",
        parameters: {
          UserName: githubUserName,
          PolicyArn: this.policy.managedPolicyArn,
        },
      },
      policy: cdk.custom_resources.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ["iam:AttachUserPolicy", "iam:DetachUserPolicy"],
          resources: [
            `arn:aws:iam::${this.account}:user/${githubUserName}`,
            this.policy.managedPolicyArn,
          ],
        }),
      ]),
    });

    cdk.Tags.of(this).add("Environment", stageName);
    cdk.Tags.of(this).add("Purpose", "GitHubActionsDeployment");

    new cdk.CfnOutput(this, "GitHubDeployPolicyArn", {
      value: this.policy.managedPolicyArn,
      exportName: `${stageName}-github-deploy-policy-arn`,
      description: `ARN of the GitHub deploy policy for ${stageName}`,
    });
  }

  /**
   * Creates the IAM policy statement for assuming CDK bootstrap roles.
   *
   * cfn-exec-role is deliberately excluded — only CloudFormation itself
   * should assume it.
   * @param bootstrapQualifier - CDK bootstrap qualifier for role name patterns
   * @returns PolicyStatement allowing assumption of CDK bootstrap roles
   */
  private createAssumeRoleStatement(
    bootstrapQualifier: string
  ): iam.PolicyStatement {
    const cdkRoles = [
      "deploy-role",
      "file-publishing-role",
      "image-publishing-role",
      "lookup-role",
    ];

    const roleArns = cdkRoles.map(
      role => `arn:aws:iam::*:role/cdk-${bootstrapQualifier}-${role}-*`
    );

    return new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["sts:AssumeRole"],
      resources: roleArns,
    });
  }
}
