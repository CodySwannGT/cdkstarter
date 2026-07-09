/**
 * CodeConnections Share Stack - Cross-Account Connection Sharing via RAM
 *
 * Creates an AWS RAM (Resource Access Manager) resource share that lets
 * stage accounts use the shared account's GitHub CodeConnections connection.
 * This is what allows CodeBuild projects in stage accounts (for example the
 * migration runner) to authenticate to GitHub without their own connection.
 *
 * ## RAM vs IAM — the PassConnection Gotcha
 *
 * AWS CodeConnections requires BOTH IAM permissions on the consuming role
 * AND an AWS RAM resource share for cross-account access (RAM support for
 * CodeConnections was added in March 2025). The share uses the AWS-managed
 * permission `AWSRAMPermissionCodeConnectionsConnection`, which grants
 * `codeconnections:GetConnection` and `codeconnections:UseConnection`. That
 * is sufficient for source pulls and for webhook-enabled projects — but the
 * additional `codeconnections:PassConnection` required for webhook creation
 * is identity-only (analogous to `iam:PassRole`) and must be granted on the
 * consuming service role directly. RAM rejects `PassConnection` as an
 * invalid action for the `codeconnections:Connection` resource type.
 * @see lib/stacks/cicd/migration-runner-stack.ts - Grants PassConnection on its role
 * @see https://docs.aws.amazon.com/ram/latest/userguide/what-is.html
 * @module lib/stacks/support/codeconnections-share-stack
 */
import * as cdk from "aws-cdk-lib";
import * as ram from "aws-cdk-lib/aws-ram";
import type { Construct } from "constructs";

/**
 * Configuration properties for CodeConnectionsShareStack.
 */
export interface CodeConnectionsShareStackProps extends cdk.StackProps {
  /**
   * ARN of the CodeConnections connection to share.
   */
  readonly codeConnectionArn: string;

  /**
   * Account IDs of the stage accounts allowed to use the connection.
   */
  readonly principalAccountIds: readonly string[];
}

/**
 * AWS RAM resource share stack for cross-account CodeConnections access.
 */
export class CodeConnectionsShareStack extends cdk.Stack {
  /**
   * Creates the RAM resource share for CodeConnections.
   * @param scope - Parent construct
   * @param id - Stack identifier
   * @param props - Stack configuration
   */
  constructor(
    scope: Construct,
    id: string,
    props: CodeConnectionsShareStackProps
  ) {
    super(scope, id, props);

    const { codeConnectionArn, principalAccountIds } = props;

    new ram.CfnResourceShare(this, "GitHubCodeConnectionsShare", {
      name: "github-codeconnections-share",
      resourceArns: [codeConnectionArn],
      principals: [...principalAccountIds],
      allowExternalPrincipals: true,
    });
  }
}
