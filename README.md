# your-project

Developers write specs and answer questions. Agents implement, test, verify, question, and document.

## About This Project

This is a source starter for AWS CDK infrastructure, not a published executable.
The deterministic entrypoint is `bin/app.ts`, loaded by `npx tsx` through
`cdk.json`; `npm run build` typechecks without emitting JavaScript.

This repo has a git-native LLM Wiki at [`wiki/`](wiki/start-here.md), maintained by the `lisa-wiki` kernel. New here? Run `/onboard-me` (Codex: `$lisa-wiki-onboard-me`) for a guided tour, or `/query "<question>"` for cited answers from the wiki.

## Step 1: Create and install your project

Use Node **22.23.3** and npm **10.9.4 or newer**. Clone into a new project:

```sh
git clone https://github.com/CodySwannGT/cdkstarter.git my-infrastructure
cd my-infrastructure
npm ci
```

Alternatively copy tracked source into a new directory, excluding `.git`,
`node_modules`, `.lisa` private state, local configuration, caches and outputs
(retain the public `.lisa/lisa-oxlint` configuration),
then initialize your own repository and run `npm ci`. Keep `package-lock.json`.
Do not copy a prior dependency installation or private tracker context. Replace
the project name and repository placeholders in `package.json`, `.lisa.config.json`
and `config/github.ts`, and point Git at your own remote.

Normal npm lifecycle scripts remain enabled. Explicit `lisa apply .` updates
templates; installation alone does not apply them. See the [Lisa commands](#lisa-commands)
for optional agent workflows. No chat agent is required for these setup steps.

## Step 2: Configure the infrastructure

Set account IDs and regions in `config/environments.ts`. `PLACEHOLDER` entries
are synth-only and cannot deploy. Preserve the selected feature defaults unless
you intend to enable their resources and costs; configure real GitHub repository
IDs/ref allowlists before using OIDC roles. Choose direct deployment by leaving
the shared pipeline purpose off and its CodeConnections ARN as `PLACEHOLDER`,
or enable the shared pipeline with a real connection and its prerequisites.

Domain configuration is optional. For an offline/default smoke, omit domains.
For a real production domain, follow the [CloudFront/WAF edge runbook](specs/cloudfront-waf-edge.md):
production activation is automatic, the edge requires `us-east-1`, the stage
zone needs parent DNS delegation, and the consuming backend must adopt origin
verification before claiming bypass protection.

Before any authorized live deployment, authenticate separately to the intended
AWS accounts, confirm CDK bootstrap roles/trust for every account/region, and
review generated templates and `cdk diff`. Bootstrap and deployment are live
AWS operations, not part of the offline smoke below. See [CDK bootstrapping](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html).

## Step 3: Verify the Infrastructure

See the [CDK bundled advisory disposition](docs/security/cdk-bundled-advisories.md) for the pinned dependency update, offline CLI regression commands, remaining exact exceptions and their expiry.

Run the generated-project verification from the source checkout:

```sh
npm run smoke:generated
```

It copies current tracked source bytes (including staged new files) into an
owned temporary project, then uses a **fresh `npm ci` with lifecycle scripts**.
It runs typecheck/build, lint/slow lint, formatting, dead-code/structural checks,
coverage, populated integration and native prover commands. It also invokes the
installed CDK CLI in direct, pipeline and frontend-only modes using the existing
fake-account fixture, no domains, supplied AZ context and `--no-lookups`.
Each mode must contain real stack artifacts/resources and no unresolved lookups.

The command rejects copied symlinks and borrowed `node_modules`, filters live
AWS/CDK context and inherited `NODE_PATH`, preserves HOME/CODEX_HOME, observes
declared global Codex/Claude settings before/after, and removes its own scratch
on success or failure. It does not run `lisa apply`, modify the caller checkout,
or provide a full filesystem/network sandbox. A failed command aborts the smoke.
Global path/hash observations are diagnostic: other active applications may write
those shared files. Unattributed drift is reported without restoration or a claim
of global preservation. The controlled helper regression rejects a real owned
child changing its settings fixture. No settings contents are printed.
Install/gate commands have a ten-minute deadline each; standalone synth retains
the existing fixture's sixty-second deadline. Tests exercise the helper's
failure/isolation contracts without recursively launching the full smoke.

Re-run this command on the final dependency graph after updating packages and
before generating a new starter. It establishes offline source/install behavior,
not AWS credentials, deployed resources, backend enforcement or downstream
adoption. Never treat a successful filtered audit as a clean raw audit.

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

Run `npm run test:unit`, `npm run test:cov`, `npm run test:integration`, and `npm run test:node` to execute the managed tooling through the starter's composition points. Empty integration collection fails with exit 1; populated suites execute and failures propagate. The native lane collects the host's positive and negative CLI prover controls and fails on zero collection. The adoption regression uses project-scoped Codex fixtures with disposable temp/cache paths and repositories, preserves host defaults and sentinels, and checks a second apply for deterministic changes.

The app integration suite executes the actual `bin/app.ts` in Vitest for direct, pipeline, and frontend-only configurations using fake accounts and offline availability-zone context. The separate native CDK suite retains `--no-lookups` controls. Runtime handler tests load the deployed JavaScript assets and mock transport, including malformed alarms/Backup events and failed invocation followed by external retry. The forwarder propagates ingestion errors for AWS to retry and does not guarantee exactly-once delivery.

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

### Private AWS service endpoints

`network.vpcEndpoints` is now honored in both unified and legacy network stages.
The configured S3/DynamoDB defaults create free gateway endpoints associated
with every private-with-egress and isolated route table, excluding public routes.
An empty or omitted list creates no endpoints. Duplicate service names create
one endpoint each; unsupported services fail synthesis.

Only explicit `secretsmanager`, `ssm`, `ssmmessages` and `logs` entries create paid
interface endpoints. Their ENIs use private-with-egress subnets (one per AZ),
private DNS, and a shared security group allowing only TCP443 from the actual
private-with-egress and isolated subnet CIDRs. Public subnet and VPC-wide ingress
are excluded. Extra services require a separate reviewed allowlist change.
Before adopting, review new endpoint/route-table/security-group resources and
interface hourly/data charges. See AWS [gateway routing](https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html)
and [interface prerequisites](https://docs.aws.amazon.com/vpc/latest/privatelink/create-interface-endpoint.html).

### Dedicated database users

Application and optional read-only database users have separate credentials and
least-privilege proxy grants. Read the [operator bootstrap and migration runbook](docs/database/application-users.md) before adopting these IAM-only users on an existing database.

### AWS Backup enrollment and failure notifications

When `features.backup` is enabled, unified and legacy application stages apply
`backup=yes` to the actual Aurora cluster and create the matching tag-driven
AWS Backup plan. Disabling the flag creates neither that enrollment tag nor the
plan; Aurora native `backupRetentionDays` remains independent and unchanged.
`BackupStack.selectionTags` defaults to `backup=yes`; explicit selectors must
be a nonempty list of nonblank valid key/value pairs (OR selection). Empty,
malformed or reserved `aws:` keys fail synthesis. Other resources need an
explicit matching tag to enroll.

With `observability.backupFailureAlerts` and `sentryDsn`, the existing single
EventBridge target forwards FAILED/EXPIRED/ABORTED jobs to the existing Sentry
forwarder as critical errors. SNS-wrapped Backup events preserve warning or
critical routing. Each input event emits one Sentry request; successful and
in-progress states emit none even if the handler is invoked directly. No
second notification target is added. AWS delivery/retry semantics remain
at-least-once: this does not claim durable duplicate suppression.

Offline enrollment and mocked notification evidence do not establish a
successful live backup, recovery point or restore. Review the cluster tag,
selection, IAM and alert changes before consumer deployment; validate real
backups/restores separately. See AWS [resource selection](https://docs.aws.amazon.com/aws-backup/latest/devguide/assigning-resources.html)
and [state-change events](https://docs.aws.amazon.com/aws-backup/latest/devguide/eventbridge.html).

## Configuration validation

Account IDs must contain exactly 12 decimal digits, or use the exact
`PLACEHOLDER` starter sentinel. Whitespace and malformed accounts fail startup
validation. Environment names must be unique, with at most one support
environment. Enabled VPCs require aligned IPv4 ranges with /16 through /28
prefixes and must not overlap, so they can later be peered.

Aurora requires an integer `instanceCount` of at least one, coherent capacities
in half-ACU increments (minimum 0.5, maximum 1–128), backup retention of 1–35 days,
and log retention of 1, 3, 7, 14, 30, 90, 180 or 365 days. Configure
`aurora.engineVersion` with an Aurora PostgreSQL major.minor version when needed.
The default remains 16.4. Check engine and capacity availability in the target
region before deploying an upgrade. Additional readers have unique identities,
while the writer and original first reader retain theirs.

Shield Advanced and cross-region replica/backup flags currently fail validation
when enabled. Custom `dashboardWidgets` lists must stay empty: the existing
built-in dashboard uses `observability.dashboardEnabled`. The `xray` flag controls
trace-submission permissions on the application IAM role, which requires Aurora
and Cognito. Set it false on paths without that role. Application owners must
also enable tracing in their runtime. It does not enable tracing on unrelated
helper functions.

Sources: [Aurora capacity settings](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2.setting-capacity.html)
and [DBCluster engine configuration](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-rds-dbcluster.html).
