/**
 * GitHub Integration Configuration
 *
 * Configures how this infrastructure connects to GitHub for CI/CD:
 *
 * - **CDK Pipeline source**: `owner`/`infrastructureRepo`@`branch` via the
 *   CodeConnections connection
 * - **OIDC deploy role**: created per stage account so application repos can
 *   deploy from GitHub Actions with short-lived credentials (no stored keys)
 * - **Migration runner**: the application repo whose workflows run database
 *   migrations on the in-VPC CodeBuild runner
 *
 * ## CodeConnections Setup
 *
 * The connection cannot be fully created by CloudFormation (the GitHub App
 * handshake is interactive). Create it once in the shared account:
 * 1. AWS Console > CodePipeline > Settings > Connections > Create connection
 * 2. Choose GitHub, authorize against your organization
 * 3. Paste the resulting ARN into `codeConnectionArn` below
 *
 * While `codeConnectionArn` is "PLACEHOLDER", pipeline mode, the migration
 * runner, and the cross-account RAM share are skipped.
 * @see lib/types.ts - GitHubConfig interface
 * @see lib/stacks/support/pipeline-stack.ts - CDK Pipeline
 * @see lib/stacks/cicd/iam-deploy-role-stack.ts - OIDC deploy role
 * @module config/github
 */
import type { GitHubConfig } from "../lib/types";

/**
 * GitHub integration settings.
 *
 * Replace owner/repository names and immutable IDs before enabling OIDC.
 * Obtain IDs with `gh api repos/OWNER/REPO --jq '{ownerId: .owner.id, repoId: .id}'`.
 * OIDC stacks fail closed until non-placeholder IDs and exact filters are supplied.
 */
export const githubConfig: GitHubConfig = {
  owner: "your-org",
  infrastructureRepo: "your-project",
  branch: "main",
  codeConnectionArn: "PLACEHOLDER",
  deployRoleName: "DeployServiceRole",
  ownerId: "PLACEHOLDER",
  deployRepositories: [
    { name: "your-project", id: "PLACEHOLDER", refs: ["refs/heads/main"] },
  ],
  allowLegacyDeploySubjects: false,
  migrationRunnerRepo: "your-project",
} as const;
