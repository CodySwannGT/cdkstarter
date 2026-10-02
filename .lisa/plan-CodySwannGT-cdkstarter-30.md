# Unify starter direct deployment under EnvironmentStage

Work item CodySwannGT/cdkstarter#30. Read `/tmp/cdkstarter-30-implementation/.lisa/work-item-context.md` in full. Branch `codex/30-unify-direct-stage`, base/target `main`; production/default assumption and ticket Branch Plan agree. Attached host-local binding verified.

## Effective completion

All three credential-free actual-entrypoint CDK CLI synthesizers conclude exit0 with nonempty nested CloudFormation templates/resources and no missing context. Direct network/app stacks share one Env-dev Stage; pipeline retains Env-dev identity/wiring and explicit physical stack/resource names; frontend-only still emits intended hosting templates. Every generated cross-stack export/import/CDK metadata difference is explained, IAM/default-off feature behavior is unchanged, and the new focused regression is observed red before source change and green afterward, including actual CI execution on the shipped PR head. Required local quality and9 protected remote checks pass; PR into derived main is merged; source evidence/backlinks/usage are visible; then issue is native terminal with configured status:done, rollup runs, binding/context cleared. No deployed AWS/consumer claim is made.

## Native CLI proof

- `node node_modules/aws-cdk/bin/cdk synth --no-lookups --app 'node --import tsx test/fixtures/starter-entrypoint.cjs direct' --output /tmp/starter-composition-direct`
- `node node_modules/aws-cdk/bin/cdk synth --no-lookups --app 'node --import tsx test/fixtures/starter-entrypoint.cjs pipeline' --output /tmp/starter-composition-pipeline`
- `node node_modules/aws-cdk/bin/cdk synth --no-lookups --app 'node --import tsx test/fixtures/starter-entrypoint.cjs frontend-only' --output /tmp/starter-composition-frontend-only`

Recursively inspect nested assemblies: no missing context, nonzero templates/resources. Fixture config contract is in companion JSON; actual bin/app.ts is required last. Strip AWS credential/profile variables and disable metadata.

## Preflight

- GitHub tracker and origin — CodySwannGT/cdkstarter: **pass**. `gh repo view CodySwannGT/cdkstarter --json defaultBranchRef,viewerPermission; gh issue view 30 --repo CodySwannGT/cdkstarter; git ls-remote --heads origin main`. ADMIN; default main; issue open/in-progress assignedCodySwannGT; remote main1111fbe6d1f0d56de3c0adb19b9aceee34271a4d.
- npm registry locked runtime/synth/test packages: **pass**. `GET registry.npmjs.org/aws-cdk-lib/2.263.0; aws-cdk/2.1132.0; tsx/4.22.4; vitest/4.1.8`. All package-lock target versions accessible and dist.tarball present; dependency upgrade is separate scope.
- Official AWS CDK Stage and synth documentation: **pass**. `GET https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.Stage.html; GET https://docs.aws.amazon.com/cdk/v2/guide/ref-cli-cmd-synth.html`. Both HTTP200; no live AWS service calls required.
- GitHub Actions and protected-check surfaces: **pass**. `gh api repos/CodySwannGT/cdkstarter/actions/workflows; gh api repos/CodySwannGT/cdkstarter/actions/runs; gh api repos/CodySwannGT/cdkstarter/rulesets/18805277; gh api repos/CodySwannGT/cdkstarter/rulesets/18805429`. Readable CI/deploy surfaces; actual protected check set is7 quality contexts plusCodeRabbit/GitGuardian (9 total), not13. Existing Claude workflow failures are baseline defects, not proof of missing access or a passing ship.

Actual remote protected checks:7 quality plusCodeRabbit/GitGuardian. Sonar token absent, so no standalone cloud verdict. Existing Claude workflows have baseline failures; reachable does not mean shipped success. No AWS deployment required.

## Research and ownership

- Full canonical issue context, all primary/parent/source comments, graph and Validation Journey.
- bin/app.ts direct branch is source owner: replace NetworkStage/AppStage/ObservabilityStage composition with EnvironmentStage; preserve CicdStage/createSharedStages.
- lib/stages/environment-stage.ts pipeline-exclusive description must be corrected; README or focused migration documentation must describe direct usage and identity differences.
- Pipeline EnvironmentStage IDs remain exactly Env-${environment.name}; explicit CFN stackName values such asdev-vpc/security-groups/aurora remain stable.
- Actual entrypoint fixture must require config/environments.ts, domains.ts, github.ts, agent-operations.ts, then bin/app.ts last in a fresh process. TS readonly arrays/objects are not frozen, so fixture-local runtime mutation can supply fake configuration without changing production config.
- No generated Lisa source changes are needed for composition itself. New integration suite path is test/integration/starter-composition.integration.test.ts; optional helper fixture path test/fixtures/starter-entrypoint.cjs.
- Current npm test:integration selects wrong tests/integration path and passWithNoTests; default unit excludes integration. Exact new suite must run explicitly locally and be proven executed in CI before closure. Broader runner/profile repair belongs#38/#29; coordinate required suite lane rather than accepting skipped CI.
- cdk.json app is npx tsx bin/app.ts; installed CDK CLI isnode node_modules/aws-cdk/bin/cdk.
- Quality prerequisites npm run typecheck, lint, lint:slow, format:check, test:cov and explicit integration suite. npm CI install must useCI=1 to avoid legacy postinstall Lisa template apply.
- CDK stage artifact paths, generated export/import expressions and CDK metadata may change with unified stage; explicit physical stack/resource names, explicit exportName strings, pipeline wiring and IAM/default-off behaviors require comparison and documented exceptions.
- Fresh-worktree checkout hook alias side effects preserved under/tmp/cdkstarter-30-worktree-hook-output and restored to exact baseline only in this worktree.
- No live AWS credentials, deployments, existing-consumer updates, scheduler enablement, dependency refresh, or tracked identity configuration edits are part of this leaf.

## Comment obligations

- 5960671421: accepted single-repo child scope, full scenarios, native parent26 and three named evidence artifacts remain mandatory.
- 5961005829: preserve attributable claimed binding until genuine terminal closeout.

## Tasks

### T1 — Branch derivation, binding and target-specific preflight

Owner planning-specialist; status completed; dependencies none. Read full context. Comment inventory: [{"id": 5960671421, "author": "CodySwannGT", "author_id": 292923, "date": "2026-10-02T20:11:17Z", "flags": ["decision"], "gist": "Accepted single-repository leaf with native parent and named evidence requirements; no secrets."}, {"id": 5961005829, "author": "CodySwannGT", "author_id": 292923, "date": "2026-10-02T20:33:36Z", "flags": ["decision"], "gist": "Managed implementation claim; preserve binding until terminal completion; no secrets."}].

- Production/default assumption maps to remote main; rendered Branch Plan agrees.
- codex/30-unify-direct-stage is conflict-free at current origin/main; upstream absolute linker attaches correct host-local binding.
- GitHub/npm/source docs/CI required access proven; original checkout preserved.

Proof: git rev-parse HEAD origin/main; node /Users/cody/workspace/lisa/scripts/lisa-work-item.mjs current; gh issue view 30 --repo CodySwannGT/cdkstarter --json state,assignees,labels

Expected: Equal1111fbe main/head SHA; attached github/ref30 branch; live open claimed issue.

### T2 — Add actual-entrypoint integration fixture and capture RED

Owner implementation-worker; status pending; dependencies T1. Read full context. Comment inventory: [{"id": 5960671421, "author": "CodySwannGT", "author_id": 292923, "date": "2026-10-02T20:11:17Z", "flags": ["decision"], "gist": "Accepted single-repository leaf with native parent and named evidence requirements; no secrets."}, {"id": 5961005829, "author": "CodySwannGT", "author_id": 292923, "date": "2026-10-02T20:33:36Z", "flags": ["decision"], "gist": "Managed implementation claim; preserve binding until terminal completion; no secrets."}].

- Create mandated focused suite and fresh-process actual entrypoint fixture with fake accounts and no lookup/service calls.
- Direct baseline reproduces CannotDependency; pipeline/frontend-only controls produce nonzero nested templates.
- Fixture supplies arrays for AZ context, disables shared DNS/agent operations and strips all credential/profile inputs.

Proof: node node_modules/aws-cdk/bin/cdk synth --no-lookups --app 'node --import tsx test/fixtures/starter-entrypoint.cjs direct' --output /tmp/starter-composition-direct

Expected: Baseline direct CLI exitsnonzero with cross-stage CannotDependency; control modes prove harness reachability, not mocked Stage composition.

### T3 — Unify direct EnvironmentStage and document identity migration

Owner implementation-worker; status pending; dependencies T2. Read full context. Comment inventory: [{"id": 5960671421, "author": "CodySwannGT", "author_id": 292923, "date": "2026-10-02T20:11:17Z", "flags": ["decision"], "gist": "Accepted single-repository leaf with native parent and named evidence requirements; no secrets."}, {"id": 5961005829, "author": "CodySwannGT", "author_id": 292923, "date": "2026-10-02T20:33:36Z", "flags": ["decision"], "gist": "Managed implementation claim; preserve binding until terminal completion; no secrets."}].

- Direct bin/app.ts uses EnvironmentStage with environment/alarmThresholds/github/domainConfig/env contract; remove obsolete split-stage/alarm imports.
- Retain CicdStage and createSharedStages wiring, exact pipeline Env-* IDs and explicit stack names.
- Update EnvironmentStage documentation and direct setup/migration guidance; explain unavoidable stage artifact/export/import/CDK metadata changes.
- No unrelated resource/IAM/default changes or generated Lisa edits.

Proof: Run all three exact native CDK CLI synth commands below in credential-free fresh subprocesses against the reviewed branch fixture/actual entrypoint; recursively enumerate nested Stage assemblies and *.template.json; require nonzero templates/resources for each mode and no manifest.missing; compare direct and pipeline inventory/resource identities against baseline where synthesis exists. Commands: node node_modules/aws-cdk/bin/cdk synth --no-lookups --app 'node --import tsx test/fixtures/starter-entrypoint.cjs direct' --output /tmp/starter-composition-direct; node node_modules/aws-cdk/bin/cdk synth --no-lookups --app 'node --import tsx test/fixtures/starter-entrypoint.cjs pipeline' --output /tmp/starter-composition-pipeline; node node_modules/aws-cdk/bin/cdk synth --no-lookups --app 'node --import tsx test/fixtures/starter-entrypoint.cjs frontend-only' --output /tmp/starter-composition-frontend-only

Expected: Three CLI assemblies are nonempty/no-missing-context; direct unified Stage and unchanged pipeline/frontend-only rendered contracts.

### T4 — Independently review resource identities and quality gates

Owner independent-quality-specialist; status pending; dependencies T3. Read full context. Comment inventory: [{"id": 5960671421, "author": "CodySwannGT", "author_id": 292923, "date": "2026-10-02T20:11:17Z", "flags": ["decision"], "gist": "Accepted single-repository leaf with native parent and named evidence requirements; no secrets."}, {"id": 5961005829, "author": "CodySwannGT", "author_id": 292923, "date": "2026-10-02T20:33:36Z", "flags": ["decision"], "gist": "Managed implementation claim; preserve binding until terminal completion; no secrets."}].

- Review ownership, real fixture reachability and migration differences; catch credential leaks or fake proof.
- Run supported typecheck/lint/slow/format/unit+coverage/integration gates with no new SonarJS violations.
- Ensure actual regression CI lane executes new suite; do not accept current integration-script empty pass. Coordinate required minimal lane fix with#38/#29 owner before merge.

Proof: Run all three exact native CDK CLI synth commands below in credential-free fresh subprocesses against the reviewed branch fixture/actual entrypoint; recursively enumerate nested Stage assemblies and *.template.json; require nonzero templates/resources for each mode and no manifest.missing; compare direct and pipeline inventory/resource identities against baseline where synthesis exists. Commands: node node_modules/aws-cdk/bin/cdk synth --no-lookups --app 'node --import tsx test/fixtures/starter-entrypoint.cjs direct' --output /tmp/starter-composition-direct; node node_modules/aws-cdk/bin/cdk synth --no-lookups --app 'node --import tsx test/fixtures/starter-entrypoint.cjs pipeline' --output /tmp/starter-composition-pipeline; node node_modules/aws-cdk/bin/cdk synth --no-lookups --app 'node --import tsx test/fixtures/starter-entrypoint.cjs frontend-only' --output /tmp/starter-composition-frontend-only

Expected: Independent assembly/resource comparison passes all identity and no-lookup obligations; named regression actually executes locally/CI, plus quality prerequisites pass.

### T5 — Independent empirical verification and schema-v2 verdict

Owner independent-verification-specialist; status pending; dependencies T4. Read full context. Comment inventory: [{"id": 5960671421, "author": "CodySwannGT", "author_id": 292923, "date": "2026-10-02T20:11:17Z", "flags": ["decision"], "gist": "Accepted single-repository leaf with native parent and named evidence requirements; no secrets."}, {"id": 5961005829, "author": "CodySwannGT", "author_id": 292923, "date": "2026-10-02T20:33:36Z", "flags": ["decision"], "gist": "Managed implementation claim; preserve binding until terminal completion; no secrets."}].

- All three credential-free actual-entrypoint CDK CLI synthesizers conclude exit0 with nonempty nested CloudFormation templates/resources and no missing context. Direct network/app stacks share one Env-dev Stage; pipeline retains Env-dev identity/wiring and explicit physical stack/resource names; frontend-only still emits intended hosting templates. Every generated cross-stack export/import/CDK metadata difference is explained, IAM/default-off feature behavior is unchanged, and the new focused regression is observed red before source change and green afterward, including actual CI execution on the shipped PR head. Required local quality and9 protected remote checks pass; PR into derived main is merged; source evidence/backlinks/usage are visible; then issue is native terminal with configured status:done, rollup runs, binding/context cleared. No deployed AWS/consumer claim is made.
- Attach named baseline-regression, fixed-success-and-edge and quality-and-template-review evidence to source item before closure.
- Verdict code-unit/cli-runtime/source-merge boundaries match evidence and artifacthead; no unit test is presented as deployment proof.

Proof: Run all three exact native CDK CLI synth commands below in credential-free fresh subprocesses against the reviewed branch fixture/actual entrypoint; recursively enumerate nested Stage assemblies and *.template.json; require nonzero templates/resources for each mode and no manifest.missing; compare direct and pipeline inventory/resource identities against baseline where synthesis exists. Commands: node node_modules/aws-cdk/bin/cdk synth --no-lookups --app 'node --import tsx test/fixtures/starter-entrypoint.cjs direct' --output /tmp/starter-composition-direct; node node_modules/aws-cdk/bin/cdk synth --no-lookups --app 'node --import tsx test/fixtures/starter-entrypoint.cjs pipeline' --output /tmp/starter-composition-pipeline; node node_modules/aws-cdk/bin/cdk synth --no-lookups --app 'node --import tsx test/fixtures/starter-entrypoint.cjs frontend-only' --output /tmp/starter-composition-frontend-only

Expected: All three credential-free actual-entrypoint CDK CLI synthesizers conclude exit0 with nonempty nested CloudFormation templates/resources and no missing context. Direct network/app stacks share one Env-dev Stage; pipeline retains Env-dev identity/wiring and explicit physical stack/resource names; frontend-only still emits intended hosting templates. Every generated cross-stack export/import/CDK metadata difference is explained, IAM/default-off feature behavior is unchanged, and the new focused regression is observed red before source change and green afterward, including actual CI execution on the shipped PR head. Required local quality and9 protected remote checks pass; PR into derived main is merged; source evidence/backlinks/usage are visible; then issue is native terminal with configured status:done, rollup runs, binding/context cleared. No deployed AWS/consumer claim is made.

### T6 — Ship configured PR/CI, source evidence and terminal rollup

Owner lifecycle-specialist; status pending; dependencies T5. Read full context. Comment inventory: [{"id": 5960671421, "author": "CodySwannGT", "author_id": 292923, "date": "2026-10-02T20:11:17Z", "flags": ["decision"], "gist": "Accepted single-repository leaf with native parent and named evidence requirements; no secrets."}, {"id": 5961005829, "author": "CodySwannGT", "author_id": 292923, "date": "2026-10-02T20:33:36Z", "flags": ["decision"], "gist": "Managed implementation claim; preserve binding until terminal completion; no secrets."}].

- PR targets derived main with non-closing work-item ref and verified reciprocal backlink.
- All9 protected checks and unresolved-review gates pass on final head; actual regression CI log proves suite execution.
- Merge is verified and origin/main contains shipped SHA; no live CloudFormation/deploy required by source-only issue.
- Post source evidence and usage, configured status:done and native closure, parent rollup; clear binding/context only after true terminal completion.

Proof: gh pr view <created-pr> --repo CodySwannGT/cdkstarter --json state,mergedAt,mergeCommit,baseRefName,statusCheckRollup; git merge-base --is-ancestor <merge-sha> origin/main; gh issue view 30 --repo CodySwannGT/cdkstarter --json state,labels,comments; node /Users/cody/workspace/lisa/scripts/lisa-work-item.mjs current

Expected: Verified merged/main source, final required successful checks/regression execution, visible evidence/usage/backlinks, native terminal issue and no binding/context aftercleanup.

Companion JSON supplies complete Lisa metadata for each task: skills, learnings, required_access, work_item_context, testing_requirements, relevant_documentation and verification. MLD remains empty until task-end capture; no fabricated telemetry.

## Exact required CI execution route

- minimal_owned_change: package.json scripts.test:integration = vitest run test/integration
- ci_surface: .github/workflows/ci.yml passes skip_jobs empty and package_managernpm to CodySwannGT/lisa/.github/workflows/quality.yml@main
- required_job: test_integration / 🧪 Run Integration Tests
- actual_execution: Shared quality workflow jobtest_integration checks script present then executes npm run test:integration. Corrected selector discovers test/integration/starter-composition.integration.test.ts; no passWithNoTests.
- future_lisa_ownership: Current upstream cdk/package-lisa/package.lisa.json force owns test:integration:lisa, public script defaults compose it; adopt.scripts.test:integration explicitly recognizes vitest run test/integration. The minimal corrected legacy script therefore remains an adoptable managed base during #29 migration, not a permanent host bypass.
- coordination: #38 broader coverage/CI truth and #29 Lisa adoption; #37 not runner owner. No updater/template/profile migration in#30.
- proof: npm run test:integration must execute new suite locally; fetch exact PR-head required integration job logs and require named suite/test counts, not merely green status.

## Implementation checkpoint

T2/T3 completed with exactbaseline1failed2passed and current3passed native CLI regression. Direct13templates114resources,pipeline14/140,frontend1/4, no missing context. Coverage40files426tests passes; typecheck/fastlint/slowlint/format/diff checks pass. All14pipeline templates exactly baseline-equal; scope-derived direct logicalIDs/tags documented. Root and independent reviewers retain T4/T5/T6 obligations before completion. Task-end MLD captured in companion metadata; learner contract capture pending.

## Learner disposition

Capture-only learner preserved the completed-task MLD in metadata but could not safely persist it: the current upstream contract ignores the ignored local config override and defaults to.lisa/PROJECT_LEARNINGS.md, while this host startup resolves.claude/rules/PROJECT_LEARNINGS.md. No ledger was written at an unexpected path and no tracked configuration was changed. This is reported as a non-blocking capture failure under learner policy; existing#29 owns the tooling/config migration.

## Independent review

T4 completed: plan_quality approved final source with findings[] and MLD[]. The bounded migration-doc Name-tag gap was fixed and verified. Reviewer independently ran the three focused integration tests successfully and compared actual pipeline/frontend/direct templates. Reviewlog /tmp/cdkstarter-30-evidence/independent-review.log. Commit-bound native proof and remoteCI/release remain T5/T6 obligations.
