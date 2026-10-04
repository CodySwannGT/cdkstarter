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

See the [CDK bundled advisory disposition](docs/security/cdk-bundled-advisories.md) for the pinned dependency update, offline CLI regression commands, remaining exact exceptions and their expiry.

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

This starter adopts published Lisa 4.69.1 on Node 22.23.3. The source-only CI and release callers use its immutable release commit, rather than floating `main`. The retired PAT updater is absent. The continuous-gate and workflow-load-sweep callers are dispatch-only, so adoption enables no scheduled automation.

Run `npm run test:unit`, `npm run test:cov`, `npm run test:integration`, and `npm run test:node` to execute the managed tooling through the starter's composition points. Empty integration collection prints an explicit `SKIP`; populated suites execute and failures propagate. The native lane collects the host's positive and negative CLI prover controls and fails on zero collection. The adoption regression uses project-scoped Codex fixtures with disposable temp/cache paths and repositories, preserves host defaults and sentinels, and checks a second apply for deterministic changes.

Coverage and mutation target the actual `lib`, `util`, `bin`, `config`, and JavaScript `resources` roots. Coverage remains 70%; mutation thresholds remain 80/60/60. The migration retains the exact CDK/Amplify update and the finite bundled-advisory disposition linked above. A successful filtered security check does not mean the raw audit is clear.

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

Configure a valid account ID in `config/environments.ts`, then run:

```sh
npx cdk list
npx cdk synth
npm run test:integration
```

Direct deployment composes networking, application and observability stacks in
one `Env-<environment>` stage, matching the pipeline composition. This keeps VPC
and security-group references inside one cloud assembly. CI/CD and shared-account
stages stay separate. Frontend-only environments use the same composition with
their backend features disabled.

For existing direct consumers, Stage IDs change from
`<environment>-network`, `<environment>-app` and `<environment>-observability` to
`Env-<environment>`. Select the nested stacks with a quoted pattern such as
`'Env-dev/*'`, rather than the Stage ID alone:

```sh
npx cdk list
npx cdk diff 'Env-dev/*'
npx cdk deploy 'Env-dev/*'
```

Explicit CloudFormation stack names remain the same. Review `cdk list` and
`cdk diff` before adopting this change: CDK paths/metadata,
scope-derived Name tags (including VPCs, subnets and SSM launch templates),
generated logical IDs (including security-group ingress rules and an Aurora
secret) and cross-stack imports/exports can differ even when physical stack names
match. This starter change does not deploy existing consumers.

The integration suite synthesizes the real entrypoint in direct, pipeline and
frontend-only modes with fake account IDs, supplied availability-zone context and
`--no-lookups`. It requires nonempty templates and runs through the CI integration
job; it does not establish deployed AWS behavior.

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

### Aurora capacity alerts

Capacity warnings/critical alarms use `aurora.maxCapacity` times
`alarmThresholds.aurora.capacityWarningPercent`/`capacityCriticalPercent`
(defaults 80/90%). The comparison is high-capacity `>=`; dev/staging/production
ceilings 2/8/32 ACUs produce 1.6/1.8, 6.4/7.2 and 25.6/28.8 ACUs. Percentages
must satisfy `0 < warning < critical <= 100`. Writer signals retain the existing
`ServerlessWarningAlarm`/`ServerlessCriticalAlarm` construct identities. A reader
pair is added only when `aurora.instanceCount > 1`. Each role uses Maximum over
five minutes; missing data is not breaching, including paused/absent metrics.

Legacy free-storage GB values never control ACU alerts. They remain separate
compatibility settings and do not create a storage alarm for this Aurora
PostgreSQL Serverless configuration. Existing CPU alarms remain independent;
workload-specific composite alarms stay opt-in. Existing consumers should
review the changed alarm thresholds/dimensions and additional reader alarms
before deployment. AWS documents [capacity metrics](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.AuroraMonitoring.Metrics.html)
and [writer/reader dimensions](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/dimensions.html).
