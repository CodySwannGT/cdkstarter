# CDK starter review — 2026-10-02

The starter has a useful modular foundation and substantial stack tests, but I would fix the deployment, authentication, alarm, and workflow defects before using it to create another project. Local quality gates pass while several important behaviors are wrong or unverified.

This review makes recommendations. It does not change dependencies, deploy infrastructure, or port downstream code. The only new repository files are this report and its evidence summary.

## Scope and evidence

Compared the starter against freshly fetched downstream `origin/main` snapshots, rather than the older local checkouts. Gemini's requested path was misspelled: the existing directory is `~/workspace/geminisportsai/projects/infrastructure-v2`. All pre-existing local changes were preserved. Branches were not switched or reset.

| Project  | Reviewed main commit                                                                                            | Local checkout relative to main at fetch |
| -------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| starter  | [1111fbe6](https://github.com/CodySwannGT/cdkstarter/commit/1111fbe6d1f0d56de3c0adb19b9aceee34271a4d)           | Current                                  |
| gemini   | [d38ab78f](https://github.com/geminisportsai/infrastructure-v2/commit/d38ab78f69b56d53f90e6d27f9abcc15647456e5) | 288 commits behind                       |
| propswap | [f8ea7673](https://github.com/propswapllc/infrastructure/commit/f8ea7673c04acae9f5946b9634f617213d85d302)       | 107 commits behind                       |
| tunnl    | [404c8f7e](https://github.com/TunnlAI/infrastructure/commit/404c8f7e46aa75b5e10ef08cf16180c1acea7aa6)           | 156 commits behind                       |

Registry metadata, audit advisories, Node release metadata, and reusable workflow paths were checked live on October 2. Downstream capabilities below are confirmed in committed source. Their comments sometimes cite historical AWS verification, but this review did not repeat that verification or inspect deployed accounts.

### Verification results

| Check                                                                         | Result                                        | What it establishes                                                                                    |
| ----------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `npm run typecheck`                                                           | Pass                                          | Current code typechecks with installed dependencies                                                    |
| `npm run test:cov`                                                            | 39 files, 423 tests passed                    | 90.04% statements, 79.57% branches, 92.67% functions, 90.03% lines                                     |
| `npm run lint` / `lint:slow`                                                  | Pass                                          | Fast lint emitted one warning in a generated skill about a `js-yaml` default import                    |
| `npm run format:check`                                                        | Pass                                          | Existing files are formatted                                                                           |
| `npm run knip`                                                                | Pass, 38 configuration hints                  | Broad entry patterns and disabled dev-dependency checks limit dead-code detection                      |
| `npm ci --ignore-scripts --dry-run --no-audit --no-fund` in isolated snapshot | Pass                                          | Lockfile resolution succeeds. This is a dry run, not a clean installation or lifecycle verification    |
| Default `cdk synth --no-lookups`                                              | **Exit 1: app contains no stacks**            | Placeholder accounts prevent validation of the starter's real composition                              |
| Offline direct-mode reproduction, fake 12-digit account                       | **Fails**                                     | Network-to-app construct dependencies cross CDK stage boundaries                                       |
| Same fixture using `EnvironmentStage`                                         | Pass                                          | Unified environment composition resolves the demonstrated stage-boundary error                         |
| Offline production `EnvironmentStage` plus `CicdStage`                        | Pass                                          | 14 templates / 117 resources synthesize with fake accounts and no custom domains                       |
| Aurora `instanceCount: 3` reproduction                                        | **Fails**                                     | Duplicate `reader` construct ID                                                                        |
| `npm run test:integration`                                                    | Exit 0, **no tests found**                    | This is not integration evidence                                                                       |
| Live npm audit                                                                | **15 affected packages: 10 high, 5 moderate** | Includes transitive and meta-vulnerability records, not 15 independently exploitable application flaws |
| Audit with `--omit=dev`                                                       | **1 high package**                            | CDK's vendored `brace-expansion`, used in infrastructure tooling                                       |

No AWS deployment, CloudFormation change set, live database login, or fresh hosted CI run was performed. Existing tests were run with the installed dependency tree, not proposed upgrades.

## Quality findings, ordered by priority

P1 means fix before creating a new full-stack consumer. P2 means a correctness or maintainability issue to address in the refresh. P3 means cleanup.

### P1 — Direct deployment mode is broken for the default full-stack shape

`bin/app.ts` creates separate network and app CDK stages and passes their VPC/security-group constructs between them. Reproducing that composition fails with:

```text
CannotDependency: dependency cannot cross stage boundaries
'dev-app/AuroraStack/AuroraCluster/writer/Resource'
 -> 'dev-network/VpcStack/Vpc/isolatedSubnet1/RouteTableAssociation'
```

Tunnl already fixed this by using `EnvironmentStage` in direct mode. Reuse that composition in the starter and add an entrypoint-level test for a real configured environment. Preserve existing construct/stack identity deliberately when migrating consumers.

[starter: bin/app.ts](https://github.com/CodySwannGT/cdkstarter/blob/1111fbe6d1f0d56de3c0adb19b9aceee34271a4d/bin/app.ts#L95) · [tunnl: bin/app.ts](https://github.com/TunnlAI/infrastructure/blob/404c8f7e46aa75b5e10ef08cf16180c1acea7aa6/bin/app.ts#L94)

### P1 — The Lambda role's database IAM grant names the wrong resource

`IamStack` grants `rds-db:connect` on `${auroraClusterArn}/*`, producing `arn:aws:rds:...:cluster:.../*`. AWS requires `arn:aws:rds-db:...:dbuser:<resource-id>/<username>`. Proxy connections require the proxy's `prx-...` resource ID. The existing test explicitly expects the invalid ARN, so it protects the defect.

Use `DatabaseProxy.grantConnect` for a configured application user or construct the documented database-user ARN. Add actual proxy-user credentials/bootstrap support as needed. The current proxy only registers the master secret, and the Lambda role can read that secret. Tunnl's newer remote-agent/worker grants show correct resource-ID handling, but **its old shared `IamStack` still has this same bug**, so copying the entire downstream IAM composition would not fix it.

[starter: lib/stacks/auth/iam-stack.ts](https://github.com/CodySwannGT/cdkstarter/blob/1111fbe6d1f0d56de3c0adb19b9aceee34271a4d/lib/stacks/auth/iam-stack.ts#L149) · [starter: test/stacks/auth/iam-stack.test.ts](https://github.com/CodySwannGT/cdkstarter/blob/1111fbe6d1f0d56de3c0adb19b9aceee34271a4d/test/stacks/auth/iam-stack.test.ts#L117) · [tunnl: lib/stacks/agent-operations/remote-agent-database-access.ts](https://github.com/TunnlAI/infrastructure/blob/404c8f7e46aa75b5e10ef08cf16180c1acea7aa6/lib/stacks/agent-operations/remote-agent-database-access.ts#L148)

[AWS IAM database policy reference](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.IAMPolicy.html)

### P1 — Aurora capacity alarms fire in the wrong direction and mix units

`ServerlessDatabaseCapacity` measures ACUs, but the starter compares it to the `freeStorageCriticalGB` setting using `<=`. The default critical threshold is 10, while dev and staging maximum capacity are only 2 and 8 ACUs. With published data, those stages satisfy the critical condition even at their ceilings. Higher production saturation can clear rather than trigger this alarm.

Port Tunnl's corrected capacity mapping, then consider Gemini's role-specific `ACUUtilization`/CPU metrics to avoid averaging a hot writer or reader into a healthy cluster average. Gemini's composite CPU floor was calibrated for its own workload and should be configurable, not copied as a universal threshold. Preserve alarm construct IDs to avoid replacing exports consumed by dashboards.

[starter: lib/stacks/observability/aurora-alarms-stack.ts](https://github.com/CodySwannGT/cdkstarter/blob/1111fbe6d1f0d56de3c0adb19b9aceee34271a4d/lib/stacks/observability/aurora-alarms-stack.ts#L231) · [tunnl: lib/stacks/observability/aurora-alarms-stack.ts](https://github.com/TunnlAI/infrastructure/blob/404c8f7e46aa75b5e10ef08cf16180c1acea7aa6/lib/stacks/observability/aurora-alarms-stack.ts#L265) · [gemini: lib/aurora-stack.ts](https://github.com/geminisportsai/infrastructure-v2/blob/d38ab78f69b56d53f90e6d27f9abcc15647456e5/lib/aurora-stack.ts#L192)

[AWS Aurora scaling metrics](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2.setting-capacity.html)

### P1 — OIDC trust is incompatible with newly created GitHub repositories

The installed OIDC construct renders `repo:your-org/*:*`. New repositories now use immutable owner/repository IDs in `sub`, such as `repo:your-org@123/backend@456:ref:refs/heads/main`, which that pattern does not match. GitHub applies this default to repositories created after July 15, 2026 and to subsequent renames/transfers. This directly affects the starter's purpose.

Tunnl accepts both formats with an L1 override. Alternatively, `aws-cdk-github-oidc@5.2.0` supports `ownerId` and `repoId` natively, confirmed from its published source. Upgrading the package without passing those IDs still renders the old format. Decide whether to support a transition or require immutable subjects for new starters, and narrow repositories and branch/environment filters.

[starter: lib/stacks/cicd/iam-deploy-role-stack.ts](https://github.com/CodySwannGT/cdkstarter/blob/1111fbe6d1f0d56de3c0adb19b9aceee34271a4d/lib/stacks/cicd/iam-deploy-role-stack.ts#L97) · [tunnl: lib/stacks/cicd/iam-deploy-role-stack.ts](https://github.com/TunnlAI/infrastructure/blob/404c8f7e46aa75b5e10ef08cf16180c1acea7aa6/lib/stacks/cicd/iam-deploy-role-stack.ts#L159)

[GitHub OIDC subject reference](https://docs.github.com/en/actions/reference/security/oidc) · [Published OIDC 5.2.0 package](https://registry.npmjs.org/aws-cdk-github-oidc/5.2.0)

### P1 — Generated automation references removed upstream workflows

Of 12 distinct `CodySwannGT/lisa` reusable workflow paths referenced by this starter, `quality.yml` and `release.yml` exist on current upstream `main`, while **10 return HTTP 404**. These cover Claude routines and branch-update automation. The remaining two float on `@main` while the local Lisa package remains 2.217.1, so local and hosted tooling can drift independently.

Refresh this through Lisa. Use the current generated callers and compatible pinned workflow revisions rather than manually patching old generated wrappers. The evidence file lists every missing path. This confirms broken references, not the state of any historical workflow run.

[starter: .github/workflows/claude-nightly-test-coverage.yml](https://github.com/CodySwannGT/cdkstarter/blob/1111fbe6d1f0d56de3c0adb19b9aceee34271a4d/.github/workflows/claude-nightly-test-coverage.yml) · [tunnl: .github/workflows/ci.yml](https://github.com/TunnlAI/infrastructure/blob/404c8f7e46aa75b5e10ef08cf16180c1acea7aa6/.github/workflows/ci.yml#L25)

### P1 — The application deployment role permits broad escalation

The default trusts every repository and ref under an organization. Its policy allows `sts:AssumeRole` on `*`, IAM role creation/policy attachment and `iam:PassRole` across the account, plus broad service permissions. This is substantially wider than most application deploys need, even though the template documents some broad grants as intentional starter conveniences.

Extract Tunnl's configurable application permission ceiling and PropSwap's protection patterns. Scope application role writes, role passing, stack names and resources. Keep infrastructure administration separate from an application deploy role. A permissions boundary must actually be attached and must constrain the relevant grants, not merely exist as a managed policy. Do not copy PropSwap's hardcoded legacy API IDs or Tunnl service names.

[starter: util/policy-statements-for-deploy.ts](https://github.com/CodySwannGT/cdkstarter/blob/1111fbe6d1f0d56de3c0adb19b9aceee34271a4d/util/policy-statements-for-deploy.ts#L125) · [tunnl: lib/stacks/cicd/iam-deploy-role-stack.ts](https://github.com/TunnlAI/infrastructure/blob/404c8f7e46aa75b5e10ef08cf16180c1acea7aa6/lib/stacks/cicd/iam-deploy-role-stack.ts#L192) · [propswap: lib/permissions-boundary-stack.ts](https://github.com/propswapllc/infrastructure/blob/f8ea7673c04acae9f5946b9634f617213d85d302/lib/permissions-boundary-stack.ts)

### P2 — Configuration advertises behavior that does not occur

All three default network blocks configure S3/DynamoDB VPC endpoints, but `VpcStack` has no endpoint input or creation code. The offline production fixture synthesizes **zero VPC endpoints**. `features.shieldAdvanced`, the disaster-recovery settings and the dashboard widget lists also have no implementing consumers. `features.xray` does not control the IAM stack's unconditional X-Ray permissions or configure application tracing.

Port Tunnl's endpoint support. Implement, reject, or explicitly mark the other settings as reserved. Tests should compare each supported configuration change with synthesized behavior, rather than only checking types or defaults.

[starter: config/environments.ts](https://github.com/CodySwannGT/cdkstarter/blob/1111fbe6d1f0d56de3c0adb19b9aceee34271a4d/config/environments.ts#L178) · [starter: lib/stacks/network/vpc-stack.ts](https://github.com/CodySwannGT/cdkstarter/blob/1111fbe6d1f0d56de3c0adb19b9aceee34271a4d/lib/stacks/network/vpc-stack.ts#L97) · [tunnl: lib/stacks/network/vpc-stack.ts](https://github.com/TunnlAI/infrastructure/blob/404c8f7e46aa75b5e10ef08cf16180c1acea7aa6/lib/stacks/network/vpc-stack.ts#L189)

### P2 — Enabling AWS Backup does not enroll starter resources

The AWS Backup selection matches `backup=yes`, but the starter applies no such tags. The production fixture has a tag-based selection and an Aurora cluster with no backup tag. Thus this plan does not include that cluster by default. Aurora's own configured native backup retention still exists, so this does not mean the database has no backups at all.

Make resource enrollment explicit through tags or direct selection, or document the plan as an intentionally unpopulated extension point. PropSwap adds selection-shape validation and backup failure events, but deliberately leaves its live tag selection empty by owner decision. Do not copy that decision into a starter that promises enrollment. The starter already has optional backup failure forwarding through Sentry, so avoid introducing duplicate notifications.

[starter: lib/stacks/database/backup-stack.ts](https://github.com/CodySwannGT/cdkstarter/blob/1111fbe6d1f0d56de3c0adb19b9aceee34271a4d/lib/stacks/database/backup-stack.ts#L63) · [propswap: lib/backup-stack.ts](https://github.com/propswapllc/infrastructure/blob/f8ea7673c04acae9f5946b9634f617213d85d302/lib/backup-stack.ts#L153)

### P2 — Reader counts and account validation accept invalid configurations

`instanceCount: 3` attempts to create two readers named `reader` and throws `There is already a Construct with name 'reader'`. Generate unique reader IDs while preserving the first reader's existing identity. Validate integer counts and coherent capacity/retention settings.

`isDeployableAccountId` accepts `not-an-account`, whitespace, and `123`. Require a valid 12-digit account ID or the explicit placeholder sentinel. CIDR validation only compares equal strings, so distinct overlapping ranges pass. Reject duplicate environment names and either support multiple support environments or make the single-support-account assumption explicit.

[starter: lib/stacks/database/aurora-stack.ts](https://github.com/CodySwannGT/cdkstarter/blob/1111fbe6d1f0d56de3c0adb19b9aceee34271a4d/lib/stacks/database/aurora-stack.ts#L158) · [starter: util/config-loader.ts](https://github.com/CodySwannGT/cdkstarter/blob/1111fbe6d1f0d56de3c0adb19b9aceee34271a4d/util/config-loader.ts#L76)

### P2 — Passing tests miss deployment composition and runtime handlers

Coverage includes `lib/**/*.ts` and `util/**/*.ts`, excluding the entrypoint, configuration, and `resources/observability` JavaScript handlers. Stage tests instantiate stacks separately, which misses the direct-mode cross-stage error. The integration script filters `tests/integration`, whereas the discovered suites are under `test`, and explicitly succeeds with no tests.

Add offline app-level synth fixtures for direct, pipeline and frontend-only modes, with expected nonzero stacks and feature invariants. Test the dependency-free runtime handlers with mocked fetch and real event shapes. Only enable an integration gate when a real suite exists. The old Stryker configuration mutates `src/**`, which this project does not have, the gate is disabled, and its runner packages are absent. Repair reusable testing configuration in Lisa before applying it here.

[starter: package.json](https://github.com/CodySwannGT/cdkstarter/blob/1111fbe6d1f0d56de3c0adb19b9aceee34271a4d/package.json#L5) · [starter: vitest.config.ts](https://github.com/CodySwannGT/cdkstarter/blob/1111fbe6d1f0d56de3c0adb19b9aceee34271a4d/vitest.config.ts) · [starter: stryker.conf.json](https://github.com/CodySwannGT/cdkstarter/blob/1111fbe6d1f0d56de3c0adb19b9aceee34271a4d/stryker.conf.json)

### P2/P3 — Maintenance defaults and onboarding are inconsistent

Dependabot targets `dev`, but a live `git ls-remote` check finds only `main` among `main/dev/staging`. The project config also declares production on `main`. Generated updater configuration should target the actual branch through Lisa.

The README mostly delegates setup and operations to a chat agent. Add a deterministic checklist for copying the starter, replacing placeholders, setting accounts/regions, bootstrapping, choosing direct versus pipeline mode, domains/delegation, and verification. Explain the origin-bypass gap in the CDN runbook: WAF is only enforced on CloudFront traffic until the backend blocks direct origin access. Add a region guard or separate edge-region stacks before advertising arbitrary-region CloudFront/WAF deployment.

`package.json` advertises `bin/infrastructure.js`, but the entrypoint is `bin/app.ts` and build is `tsc --noEmit`. Remove the nonexistent binary or provide a real build/package path. Knip already reports the missing entry. Audit exclusions also retain claims such as “handlebars 4.7.8 is latest with no patch” despite the manifest requiring a newer version. Review and remove obsolete exclusions as their fixes land.

[starter: .github/dependabot.yml](https://github.com/CodySwannGT/cdkstarter/blob/1111fbe6d1f0d56de3c0adb19b9aceee34271a4d/.github/dependabot.yml#L12) · [starter: README.md](https://github.com/CodySwannGT/cdkstarter/blob/1111fbe6d1f0d56de3c0adb19b9aceee34271a4d/README.md) · [starter: package.json](https://github.com/CodySwannGT/cdkstarter/blob/1111fbe6d1f0d56de3c0adb19b9aceee34271a4d/package.json#L130) · [starter: specs/cloudfront-waf-edge.md](https://github.com/CodySwannGT/cdkstarter/blob/1111fbe6d1f0d56de3c0adb19b9aceee34271a4d/specs/cloudfront-waf-edge.md)

## Downstream improvements worth upstreaming

The safest approach is to extract small configurable capabilities with their behavioral tests, not replace whole stacks that have accumulated product-specific assumptions.

| Order | Capability / donor                                                 | Value and extraction boundary                                                                                                                                                                                   |
| ----- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Tunnl: unified direct/pipeline environment composition             | Fixes the reproduced direct-mode blocker. Port entrypoint composition and tests, preserving stack identity                                                                                                      |
| 2     | Tunnl: immutable OIDC subjects, optionally native OIDC 5.x support | Makes newly created application repositories deployable. Expose IDs and ref/environment filters                                                                                                                 |
| 3     | Tunnl + Gemini: correct Aurora saturation alarms                   | Fix inverted capacity alarm. Make thresholds per environment and separate writer/reader signals. Keep Gemini's workload-specific composite calibration optional                                                 |
| 4     | Tunnl: configurable VPC endpoints                                  | Makes existing starter configuration take effect. Distinguish gateway from paid interface endpoints and keep costs opt-in                                                                                       |
| 5     | Tunnl: Aurora engine-version configuration and separate DB users   | Avoids a hardcoded 16.4 forever. Support app/read-only users, proxy registration and an idempotent bootstrap. Verify a currently creatable engine in the intended AWS region, not Tunnl's version by assumption |
| 6     | Tunnl + PropSwap + Gemini: narrow deploy/agent permissions         | Configurable per-service deploy ceiling, exact database-user grants, targeted remote-agent sessions. Reuse checks that evaluate actual statements against example ARNs                                          |
| 7     | Tunnl: cross-account DNS delegation                                | Automates a manual prerequisite for certificate validation. Keep parent domain/account, delegation role and host naming generic                                                                                 |
| 8     | Tunnl: Amplify rewrite/header/build-failure support                | Optional SPA routing, custom response headers and failed-build notifications. Preserve non-SPA apps. Source map uploads and Expo/Bun commands should be optional adapters                                       |
| 9     | PropSwap: backup selection-shape guards / failure notifications    | Reject structurally inert selections. Adopt appropriate failure-event coverage while integrating with existing SNS/Sentry paths. Live enrollment needs additional proof                                         |
| 10    | Gemini: alert fingerprinting and per-operation monitoring          | Group warning/critical alarms by cause and retain severity. GraphQL error/latency metrics are an optional module with an explicit backend instrumentation contract                                              |
| 11    | Tunnl: configurable queues and DLQ/worker alarms                   | Useful optional backend starter module. First-message DLQ alerts and backlog age are reusable. Do not carry Tunnl's fixed queue names, producer log literals or account-deletion behavior                       |
| 12    | Tunnl: secret copier construct and build-tool pin manifest         | Reusable deploy-time secret delivery and executable pinning patterns. Opt-in only where needed. Preserve resource identity and avoid logging secret values                                                      |
| 13    | Gemini: SMS spend monitoring / circuit breaker                     | Valuable for SMS/OTP projects. Optional module only, with caller-defined limits, destinations, alerting and recovery. Do not inherit Gemini's $7 cap/country policy                                             |
| 14    | All downstreams: newer Lisa-generated tooling                      | Consume from Lisa rather than copying generated scripts between repos. Refresh callers, test profiles, gates and dependency policy together                                                                     |

Donor source links:

- [tunnl: lib/stacks/database/aurora-stack.ts](https://github.com/TunnlAI/infrastructure/blob/404c8f7e46aa75b5e10ef08cf16180c1acea7aa6/lib/stacks/database/aurora-stack.ts#L148)
- [tunnl: lib/stacks/support/dns-stack.ts](https://github.com/TunnlAI/infrastructure/blob/404c8f7e46aa75b5e10ef08cf16180c1acea7aa6/lib/stacks/support/dns-stack.ts#L40)
- [tunnl: lib/stacks/edge/amplify-hosting-stack.ts](https://github.com/TunnlAI/infrastructure/blob/404c8f7e46aa75b5e10ef08cf16180c1acea7aa6/lib/stacks/edge/amplify-hosting-stack.ts#L121)
- [tunnl: lib/stacks/observability/dlq-depth-alarm.ts](https://github.com/TunnlAI/infrastructure/blob/404c8f7e46aa75b5e10ef08cf16180c1acea7aa6/lib/stacks/observability/dlq-depth-alarm.ts#L1)
- [tunnl: lib/constructs/ssm-secret-copier.ts](https://github.com/TunnlAI/infrastructure/blob/404c8f7e46aa75b5e10ef08cf16180c1acea7aa6/lib/constructs/ssm-secret-copier.ts#L1)
- [tunnl: config/amplify-build-tools/README.md](https://github.com/TunnlAI/infrastructure/blob/404c8f7e46aa75b5e10ef08cf16180c1acea7aa6/config/amplify-build-tools/README.md#L1)
- [gemini: lib/graphql-operation-error-rate.ts](https://github.com/geminisportsai/infrastructure-v2/blob/d38ab78f69b56d53f90e6d27f9abcc15647456e5/lib/graphql-operation-error-rate.ts#L15)
- [gemini: lib/lambda/alarm-sentry-forwarder/index.js](https://github.com/geminisportsai/infrastructure-v2/blob/d38ab78f69b56d53f90e6d27f9abcc15647456e5/lib/lambda/alarm-sentry-forwarder/index.js#L95)
- [gemini: lib/sms-spend-monitoring-stack.ts](https://github.com/geminisportsai/infrastructure-v2/blob/d38ab78f69b56d53f90e6d27f9abcc15647456e5/lib/sms-spend-monitoring-stack.ts#L1)
- [propswap: lib/security-monitoring-stack.ts](https://github.com/propswapllc/infrastructure/blob/f8ea7673c04acae9f5946b9634f617213d85d302/lib/security-monitoring-stack.ts#L1)

Keep product-specific stacks downstream: Gemini's Databricks/MCP topology and GraphQL operation manifest, PropSwap's legacy AppSync block and financial mutation policy, and Tunnl's partner-ingest/account-deletion contracts. Generalize their patterns only when a caller can supply the product-specific contract. Do not transplant account IDs, domain names, database usernames, country allowlists, calibrated thresholds or emergency repair scripts.

## Dependency assessment

**Yes, updates are needed.** There are 39 direct packages for which either the allowed range has a newer resolution or a newer release lies outside the range. This includes major migrations and updates within current constraints. `npm outdated` reports installed versions below, not just the range written in the manifest.

### Recommended update batches

1. **Security and supported-range refresh:** align Vitest and coverage on 4.1.11, update Vite to 8.3.2, refresh patch/minor tool resolutions, and re-audit. These targets are available within existing ranges. All Lisa-owned version/config changes should originate in Lisa, then be consumed by the starter.
2. **CDK coordinated update:** update `aws-cdk-lib` and Amplify alpha together to 2.272.0 / 2.272.0-alpha.0, with compatible `constructs`. The alpha peer requires `aws-cdk-lib ^2.272.0`. CLI 2.1144.0 can be updated independently, but verify synthesis with the chosen library. Run meaningful synth fixtures and inspect template diffs before adoption.
3. **Lisa 2 → 4 migration:** current 2.217.1, latest 4.66.5, while downstream snapshots use 4.27.4–4.66.4. `^2.217.1` cannot reach major 4. Treat this as a generated-tooling migration and review its concrete file diff, not a blind version edit or postinstall run. Preserve host-owned files and the existing `AGENTS.md` edit.
4. **OIDC 2 → 5 migration:** 5.2.0 has native immutable-subject configuration. It requires `constructs ^10.7.2`, `aws-cdk-lib ^2.260.0`, and Node >=22 <=26. Pass owner/repo IDs or the functionality stays on the legacy subject format.
5. **Node maintenance:** project and CI pin 22.21.1, this review used 22.22.0, and the current Node 22 patch is 22.23.3. Refresh the shared runtime pin in Lisa and align the starter's `.nvmrc`, engines and workflows. Node 24.21.0 is another supported LTS option, but it is a separate compatibility change.
6. **Defer unrelated major migrations:** TypeScript 7, Vitest 5, ESLint 10, Knip 6, Husky 9 and other major tooling changes should follow Lisa's compatibility policy. The latest Lisa package still declares TypeScript 6, Vitest 4, ESLint 9, Knip 5 and Husky 8. Do not independently choose the latest major of every tool.

[CDK compatibility policy](https://docs.aws.amazon.com/cdk/v2/guide/versioning.html) · [Node release index](https://nodejs.org/dist/index.json) · [Lisa 4.66.5 metadata](https://registry.npmjs.org/@codyswann/lisa/4.66.5) · [Amplify alpha metadata](https://registry.npmjs.org/@aws-cdk/aws-amplify-alpha/2.272.0-alpha.0)

### Security details and limits

The ordinary audit reports 15 affected packages (10 high / 5 moderate / 0 critical). Many records are development tools or parent packages flagged because of a vulnerable transitive child. `--omit=dev` still reports CDK's bundled parser dependency, but this starter uses CDK at build/synth/deploy time. This is not evidence of a remotely exploitable deployed Lambda.

- **Vitest/mocker:** 4.1.8 is below the patched 4.1.11. Update both Vitest and coverage, including any nested Lisa copy. [Advisory](https://github.com/advisories/GHSA-82fw-gwwq-j7x9)
- **Brace expansion:** locked ordinary copy 5.0.9, vendored CDK 2.263.0 copy 5.0.8. The current CDK 2.272.0 tarball still vendors 5.0.9, which is below newer fixes through 5.0.12. A normal npm override does not replace CDK's bundled copy. A CDK update therefore does **not** clear this finding by itself. Track the upstream bundle and any narrowly justified acceptance separately. [New recursion advisory](https://github.com/advisories/GHSA-qhr7-859c-m2p7) · [Quadratic expansion advisory](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr)
- **Functional ESLint plugin / deepmerge:** installed `deepmerge-ts` 7.1.5 is affected below 8. Even latest `eslint-plugin-functional@10.0.1` still declares `deepmerge-ts ^7.1.5`. A plugin major bump does not automatically solve this. Avoid `npm audit fix --force`, which suggests downgrading functional/Lisa to old major versions. Work on the dependency fix or bounded exception upstream. [Advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)
- **Overrides need maintenance:** `fast-uri >=4.1.1` resolves a vulnerable 4.1.2, SonarJS 3.0.7 retains minimatch 10.1.2, and `js-yaml >=4.3.0` allowed a major 5.2.3 resolution with a fresh moderate advisory. Replace broad lower-bound overrides with reviewed compatible patch lines where practical, and validate their consumers. Do not force transitive API-breaking major updates just to make audit green.

The complete affected-package records, nodes, advisories, and available-fix metadata are in the evidence JSON. Audit exceptions were not applied to these raw counts.

### Full direct dependency currency table

A dash under installed means npm did not report an installed version. “Wanted” is npm's resolution under existing constraints. “Latest” is registry latest and does not imply compatibility or a recommendation.

| Package                                           | Manifest           | Installed       | Wanted          | Latest          |
| ------------------------------------------------- | ------------------ | --------------- | --------------- | --------------- |
| `@ast-grep/cli`                                   | `^0.40.4`          | 0.40.5          | 0.40.5          | 0.45.3          |
| `@aws-cdk/aws-amplify-alpha`                      | `^2.263.0-alpha.0` | 2.263.0-alpha.0 | 2.263.0-alpha.0 | 2.272.0-alpha.0 |
| `@codyswann/lisa`                                 | `^2.217.1`         | 2.217.1         | 2.353.0         | 4.66.5          |
| `@commitlint/cli`                                 | `^20.3.1`          | 20.5.3          | 20.5.3          | 21.2.3          |
| `@commitlint/config-conventional`                 | `^20.3.1`          | 20.5.3          | 20.5.3          | 21.2.3          |
| `@eslint-community/eslint-plugin-eslint-comments` | `^4.5.0`           | 4.7.2           | 4.8.1           | 4.8.1           |
| `@eslint/eslintrc`                                | `^3.2.0`           | 3.3.5           | 3.3.7           | 3.3.7           |
| `@eslint/js`                                      | `^9.39.0`          | 9.39.4          | 9.39.5          | 10.0.1          |
| `@jest/globals`                                   | `^30.0.0`          | 30.4.1          | 30.5.2          | 30.5.2          |
| `@jest/test-sequencer`                            | `^30.2.0`          | 30.4.1          | 30.5.2          | 30.5.2          |
| `@types/node`                                     | `^22.0.0`          | 22.19.19        | 22.20.5         | 26.6.4          |
| `@typescript-eslint/parser`                       | `^8.54.0`          | 8.60.0          | 8.71.0          | 8.71.0          |
| `@vitest/coverage-v8`                             | `^4.1.0`           | 4.1.8           | 4.1.11          | 5.0.3           |
| `aws-cdk`                                         | `^2.1132.0`        | 2.1132.0        | 2.1144.0        | 2.1144.0        |
| `aws-cdk-github-oidc`                             | `^2.4.1`           | 2.4.1           | 2.4.1           | 5.2.0           |
| `aws-cdk-lib`                                     | `2.263.0`          | 2.263.0         | 2.263.0         | 2.272.0         |
| `constructs`                                      | `^10.4.5`          | 10.6.0          | 10.8.1          | 10.8.1          |
| `esbuild`                                         | `^0.28.1`          | 0.28.1          | 0.28.2          | 0.28.2          |
| `eslint`                                          | `^9.39.0`          | 9.39.4          | 9.39.5          | 10.11.0         |
| `eslint-plugin-functional`                        | `^9.0.0`           | 9.0.5           | 9.0.5           | 10.0.1          |
| `eslint-plugin-jsdoc`                             | `^61.5.0`          | 61.7.1          | 61.7.1          | 63.3.3          |
| `eslint-plugin-oxlint`                            | `^1.62.0`          | 1.67.0          | 1.86.0          | 1.86.0          |
| `eslint-plugin-sonarjs`                           | `^3.0.0`           | 3.0.7           | 3.0.7           | 4.2.2           |
| `globals`                                         | `^17.2.0`          | 17.6.0          | 17.13.0         | 17.13.0         |
| `husky`                                           | `^8.0.0`           | 8.0.3           | 8.0.3           | 9.1.7           |
| `jest`                                            | `^30.0.0`          | 30.4.2          | 30.5.2          | 30.5.2          |
| `jscodeshift`                                     | `0.15.2`           | 0.15.2          | 0.15.2          | 17.4.0          |
| `knip`                                            | `^5.0.0`           | 5.88.1          | 5.88.1          | 6.39.0          |
| `oxlint`                                          | `^1.62.0`          | 1.67.0          | 1.86.0          | 1.86.0          |
| `oxlint-tsgolint`                                 | `^0.22.1`          | 0.22.1          | 0.22.1          | 7.0.2003        |
| `prettier`                                        | `^3.3.3`           | 3.8.3           | 3.9.9           | 3.9.9           |
| `ts-jest`                                         | `^29.4.6`          | 29.4.11         | 29.4.14         | 29.4.14         |
| `ts-morph`                                        | `^27.0.2`          | 27.0.2          | 27.0.2          | 28.0.0          |
| `tsx`                                             | `^4.0.0`           | 4.22.4          | 4.23.15         | 4.23.15         |
| `typescript`                                      | `^6.0.3`           | 6.0.3           | 6.0.3           | 7.0.2           |
| `typescript-eslint`                               | `^8.0.0`           | 8.60.0          | 8.71.0          | 8.71.0          |
| `vite`                                            | `^8.0.5`           | 8.0.16          | 8.3.2           | 8.3.2           |
| `vitest`                                          | `^4.1.0`           | 4.1.8           | 4.1.11          | 5.0.3           |
| `zod`                                             | `^4.3.6`           | 4.4.3           | 4.6.5           | 4.6.5           |

Registry source: live `npm outdated --json`, using each package's published metadata at `https://registry.npmjs.org/<package>`. The accompanying evidence JSON preserves the response and manifests. Runtime packages not in this table, such as `source-map-support`, had no newer version reported by this check.

## Suggested implementation sequence

First restore Lisa tooling and automation from a reviewed current version, including correct update branches and runtime pins. Fix reusable testing/dependency defects in Lisa before consuming those changes here.

Then ship a focused starter correctness change for unified environment composition, valid database-user IAM grants, immutable OIDC subjects, capacity alarms, VPC endpoints and unique readers. Add behavioral synth tests at the app boundary. Use fake accounts for offline fixtures and assert both stack presence and the relevant rendered properties.

Next refresh CDK and allowed-range dependencies in a separate change, synthesize the same fixtures, and review template changes independently from source refactoring. Maintain explicit unresolved audit findings instead of treating an update as security proof.

Finally extract optional DNS/Amplify/worker/GraphQL/SMS modules and write deterministic starter onboarding. Keep optional product capabilities disabled until configured. Run one clean generated-project smoke test, then assess downstream adoption separately with each project's existing resource identities and deployment history.

The recorded checks support the findings above. Proposed ports and dependency upgrades have not been implemented or validated in this review.

## Implementation Tickets

The implementation plan was filed as [starter epic #24](https://github.com/CodySwannGT/cdkstarter/issues/24), with four native child stories and nineteen starter implementation leaves. The shared runtime/security-floor prerequisite is [Lisa #4326](https://github.com/CodySwannGT/lisa/issues/4326). See [the full local issue index](2026-10-02-implementation-issues.md) for every issue and dependency.

## Lisa Usage

_This section is managed by Lisa. Rewrites update matching usage entries in place and preserve older rows._

| Flow | Source | Model | Tokens | Cost |
| --- | --- | --- | ---: | ---: |
| plan | unavailable | openai/unknown | null | null |

<!-- lisa:usage-entry entry_id=cdk-review-plan-20261002-source-starter-review flow=plan run_id=cdk-review-plan-20261002 provider=openai model=unknown source=unavailable input_tokens=null cached_input_tokens=null output_tokens=null reasoning_tokens=null total_tokens=null cost=null currency=null pricing_status=unavailable pricing_source=null artifact_ref=markdown-file%3Adocs%2Freviews%2F2026-10-02-starter-review.md parent_artifact_ref= --> <!-- lisa:usage-entry-measured-subset entry_id=cdk-review-plan-20261002-source-starter-review measured_subset_tokens=null -->

<!-- lisa:usage-rollup direct_entry_ids=cdk-review-plan-20261002-source-starter-review child_entry_ids=cdk-review-plan-20261002-epic,cdk-review-plan-20261002-tooling,cdk-review-plan-20261002-correctness,cdk-review-plan-20261002-verification,cdk-review-plan-20261002-optional,cdk-review-plan-20261002-lisa-runtime,cdk-review-plan-20261002-lisa-adoption,cdk-review-plan-20261002-composition,cdk-review-plan-20261002-db-access,cdk-review-plan-20261002-oidc,cdk-review-plan-20261002-permissions,cdk-review-plan-20261002-alarms,cdk-review-plan-20261002-endpoints,cdk-review-plan-20261002-backup,cdk-review-plan-20261002-config,cdk-review-plan-20261002-tests,cdk-review-plan-20261002-dependencies,cdk-review-plan-20261002-edge,cdk-review-plan-20261002-onboarding,cdk-review-plan-20261002-optional-dns,cdk-review-plan-20261002-optional-amplify,cdk-review-plan-20261002-optional-workers,cdk-review-plan-20261002-optional-graphql,cdk-review-plan-20261002-optional-secret-tools,cdk-review-plan-20261002-optional-sms child_refs=github%3ACodySwannGT%2Fcdkstarter%2324,github%3ACodySwannGT%2Fcdkstarter%2325,github%3ACodySwannGT%2Fcdkstarter%2326,github%3ACodySwannGT%2Fcdkstarter%2327,github%3ACodySwannGT%2Fcdkstarter%2328,github%3ACodySwannGT%2Flisa%234326,github%3ACodySwannGT%2Fcdkstarter%2329,github%3ACodySwannGT%2Fcdkstarter%2330,github%3ACodySwannGT%2Fcdkstarter%2331,github%3ACodySwannGT%2Fcdkstarter%2332,github%3ACodySwannGT%2Fcdkstarter%2333,github%3ACodySwannGT%2Fcdkstarter%2334,github%3ACodySwannGT%2Fcdkstarter%2335,github%3ACodySwannGT%2Fcdkstarter%2336,github%3ACodySwannGT%2Fcdkstarter%2337,github%3ACodySwannGT%2Fcdkstarter%2338,github%3ACodySwannGT%2Fcdkstarter%2339,github%3ACodySwannGT%2Fcdkstarter%2340,github%3ACodySwannGT%2Fcdkstarter%2341,github%3ACodySwannGT%2Fcdkstarter%2342,github%3ACodySwannGT%2Fcdkstarter%2343,github%3ACodySwannGT%2Fcdkstarter%2344,github%3ACodySwannGT%2Fcdkstarter%2345,github%3ACodySwannGT%2Fcdkstarter%2346,github%3ACodySwannGT%2Fcdkstarter%2347 direct_tokens=null child_tokens=null total_tokens=null direct_cost=null child_cost=null total_cost=null currency=null child_currency=null -->
