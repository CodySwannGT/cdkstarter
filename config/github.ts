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
 * Replace the placeholder owner/repo values with your organization and
 * repository names. `deployRepoPattern: "*"` lets every repo in the
 * organization assume the deploy role; narrow it to a single repo name
 * for stricter control.
 */
export const githubConfig: GitHubConfig = {
  owner: "your-org",
  infrastructureRepo: "your-project",
  branch: "main",
  codeConnectionArn: "PLACEHOLDER",
  deployRoleName: "DeployServiceRole",
  deployRepoPattern: "*",
  migrationRunnerRepo: "your-project",
} as const;
