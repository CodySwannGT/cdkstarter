# your-project

Developers write specs and answer questions. Agents implement, test, verify, question, and document.

## About This Project

> Ask Claude: "What is the purpose of this project and how does it work?"

This repo has a git-native LLM Wiki at [`wiki/`](wiki/start-here.md), maintained by the `lisa-wiki` kernel. New here? Run `/onboard-me` (Codex: `$lisa-wiki-onboard-me`) for a guided tour, or `/query "<question>"` for cited answers from the wiki.

## Step 1: Install Claude Code

```bash
brew install claude-code
# Or: npm install -g @anthropic-ai/claude-code
```

## Step 2: Set Up This Project

> Ask Claude: "I just cloned this repo. Walk me through the full setup including installing dependencies, environment variables, and any other configuration."

## Step 3: Verify the Infrastructure

> Ask Claude: "How do I synthesize the CDK stacks and verify the templates are valid?"

## Step 4: Work on a Feature

> Ask Claude: "I have Jira ticket [TICKET-ID]. Research the codebase, create a plan, and implement it."

Or use utility commands:

- `/plan:add-test-coverage` - Increase test coverage to a threshold
- `/plan:fix-linter-error` - Fix ESLint rule violations
- `/plan:local-code-review` - Review local branch changes
- `/plan:lower-code-complexity` - Reduce cognitive complexity
- `/plan:reduce-max-lines` - Reduce max file lines threshold
- `/plan:reduce-max-lines-per-function` - Reduce max function lines

## Lisa Commands

> Ask Claude: "What Lisa commands are available and how do I use them? Read HUMAN.md and give me a summary."

## Common Tasks

### Code Review

> Ask Claude: "Review the changes on this branch and suggest improvements."

### Submit a PR

> Ask Claude: "Commit my changes and open a pull request."

### Fix Lint Errors

> Ask Claude: "Run the linter and fix all errors."

### Add Test Coverage

> Ask Claude: "Increase test coverage for the files I changed."

### Synthesize CloudFormation Templates

> Ask Claude: "Run CDK synth and verify the CloudFormation templates are generated correctly."

### Frontend-only Environments

The application infrastructure is composable. A stage can host only a static
frontend without creating a VPC, NAT gateways, databases, caches, Cognito,
monitoring, or backend deploy roles:

```ts
features: {
  network: false,
  observability: false,
  aurora: false,
  valkey: false,
  cognito: false,
  xray: false,
  waf: false,
  shieldAdvanced: false,
  backup: false,
  ssmRelay: false,
  githubOidcDeploy: false,
  migrationRunner: false,
  amplifyHosting: true,
},
amplifyHosting: {
  owner: "your-org",
  repository: "frontend",
  branch: "main",
  oauthTokenSecretName: "your-project/amplify/github-token",
},
```

`network` and `observability` default to enabled when omitted, preserving the
full-stack starter behavior. Network-dependent features are rejected when
`network` is false. Amplify build commands, artifact directory, environment
variables, and custom domain are independently configurable.

### Diff Against Deployed Stacks

> Ask Claude: "Run CDK diff to show what changes would be deployed compared to the current stacks."

### Deploy

> Ask Claude: "Walk me through deploying this project."

## Project Standards

> Ask Claude: "What coding standards and conventions does this project follow?"

## Architecture

> Ask Claude: "Explain the architecture of this project, including key components and how they interact."

## Troubleshooting

> Ask Claude: "I'm having an issue with [describe problem]. Help me debug it."
