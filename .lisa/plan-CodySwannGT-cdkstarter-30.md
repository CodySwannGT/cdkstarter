# Unify starter direct deployment under EnvironmentStage

Work item CodySwannGT/cdkstarter#30. Production base/target main at released `e706d113cf5c2a147570d02c334272ad316ca372`. Branch `codex/30-unify-direct-stage`. Full ignored context `/tmp/cdkstarter-30-implementation/.lisa/work-item-context.md`; SHA256 `9df7d27f2c115fb94b135a52b53e2a6f479dc4421f24789e9590c284cb5aa286`. Canonical binding retained.

## Effective completion

All three credential-free actual-entrypoint CDK CLI synthesizers conclude exit0 with nonempty nested CloudFormation templates/resources and no missing context. Direct network/app stacks share one Env-dev Stage; pipeline retains Env-dev identity/wiring and explicit physical stack/resource names; frontend-only still emits intended hosting templates. Every generated cross-stack export/import/CDK metadata difference is explained, IAM/default-off feature behavior is unchanged, and the new focused regression is observed red before source change and green afterward, including actual CI execution on the shipped PR head. Required local quality and9 protected remote checks pass; PR into derived main is merged; source evidence/backlinks/usage are visible; then issue is native terminal with configured status:done, rollup runs, binding/context cleared. No deployed AWS/consumer claim is made.

## Current resume

```json
{
  "captured_at": "2026-10-04T15:17:32.874543+00:00",
  "input_transaction": "/tmp/cdkstarter-30-evidence/input-refresh-after-29-48/transaction-receipt.json",
  "released_base": "e706d113cf5c2a147570d02c334272ad316ca372",
  "rebased_head": "905130c7729f2292417f3fb5598673c3ac567305",
  "closed_prerequisites": [29, 48],
  "remaining_blockers": [],
  "fresh_install": "Node22.23.3/npm10.9.9 CI=1 npm ci exit0; package/lock unchanged.",
  "evidence_directory": "/tmp/cdkstarter-30-evidence/resumed-implementation",
  "final_commit_and_delivery": "Pending root independent review, normal commit/push, PR review/CI/merge/source release, three named issue artifacts and native closure.",
  "targeted_verification": {
    "baseline_R": "Identical test+fixture: direct fails NoCrossStageDependency (CDK2.272 spelling); pipeline/frontend controls pass (1 failed/2 passed). Old CannotDependency evidence remains historical.",
    "source_GREEN": "Focused three modes pass; actual canonical host integration route and managed verbose route pass two suites/six cases.",
    "native": "Direct13templates114resources; pipeline14/140; frontend1/4; no missing context. Fresh R baseline pipeline/frontend templates exactly match completed29/48 receipts.",
    "identity": "Pipeline14 templates unchanged; frontend metadata only; partial failed baseline direct3 network templates document scope-derived changes. Current direct/pipeline13 shared stack IAM and imports/exports equal.",
    "proof_binding": "Working source at rebased head905130c plus owned dirty test/metadata; final commit-bound proof/review/CI/release remains pending."
  },
  "root_quality": {
    "isolated_canonical_command": "npm run test:cov",
    "actual_exit": 0,
    "suites": 43,
    "tests": 449,
    "coverage_percent": {
      "statements": 87.88,
      "branches": 77.77,
      "functions": 91.9,
      "lines": 87.76
    },
    "log_path": "/tmp/cdkstarter-30-evidence/resumed-quality/coverage-isolated/coverage.log",
    "log_sha256": "54c8ebace8b0a16c1faf2fb47df9bf7ca02d69a8a3770e8a03b7a0289b25b289",
    "receipt": "/tmp/cdkstarter-30-evidence/resumed-quality/coverage-isolated/receipt.json",
    "initial_failure_preserved": "/tmp/cdkstarter-30-evidence/resumed-quality/coverage.log: two native spawnSync timeouts,447passed; unchanged isolated rerun passed. Specific host contention cause not established.",
    "source_changes_to_fix_timeout": "None; no scheduling or timeout changes."
  }
}
```

## Historical proof

All original local quality/426-case/CLI proof is historical; it does not certify resumed source, current runtime, remote CI, merge or release.

## Comment obligations

- 5960671421: Accepted leaf/native parent/evidence decision; full original comment remains in ignored context.
- 5961005829: Existing managed implementation claim; full original comment remains in ignored context.
- 5961221043: Composition plan; real-entrypoint direct/pipeline/frontend-only CI evidence; full original comment remains in ignored context.
- 5961721501: Historical production audit delivery failure; former39 prerequisite superseded; full original comment remains in ignored context.
- 5962210635: Sole48 native prerequisite supersedes39; broader39 and original composition scope retained; full original comment remains in ignored context.

## Research

- Full canonical issue context, all primary/parent/source comments, graph and Validation Journey.
- bin/app.ts direct branch is source owner: replace NetworkStage/AppStage/ObservabilityStage composition with EnvironmentStage; preserve CicdStage/createSharedStages.
- lib/stages/environment-stage.ts pipeline-exclusive description must be corrected; README or focused migration documentation must describe direct usage and identity differences.
- Pipeline EnvironmentStage IDs remain exactly Env-${environment.name}; explicit CFN stackName values such asdev-vpc/security-groups/aurora remain stable.
- Actual entrypoint fixture must require config/environments.ts, domains.ts, github.ts, agent-operations.ts, then bin/app.ts last in a fresh process. TS readonly arrays/objects are not frozen, so fixture-local runtime mutation can supply fake configuration without changing production config.
- No generated Lisa source changes are needed for composition itself. New integration suite path is test/integration/starter-composition.integration.test.ts; optional helper fixture path test/fixtures/starter-entrypoint.cjs.
- cdk.json app is npx tsx bin/app.ts; installed CDK CLI isnode node_modules/aws-cdk/bin/cdk.
- Quality prerequisites npm run typecheck, lint, lint:slow, format:check, test:cov and explicit integration suite. npm CI install must useCI=1 to avoid legacy postinstall Lisa template apply.
- CDK stage artifact paths, generated export/import expressions and CDK metadata may change with unified stage; explicit physical stack/resource names, explicit exportName strings, pipeline wiring and IAM/default-off behaviors require comparison and documented exceptions.
- No live AWS credentials, deployments, existing-consumer updates, scheduler enablement, dependency refresh, or tracked identity configuration edits are part of this leaf.
- Current public Lisa4.69.1 host integration wrapper and managed :lisa selector already discover both adoption and new composition integration suites. Preserve the entire released package.json and immutable workflows.
- Original e472 source, old runtime proof and old registry/CI observations are historical only; fresh resumed source needs independent review, named remote execution and terminal release proof.
- Normal rebase post-checkout ran the existing best-effort project plugin bootstrap. No hook bypass or deliberate global configuration rewrite was used.

## Native proof

Run all three exact native CDK CLI synth commands below in credential-free fresh subprocesses against the reviewed branch fixture/actual entrypoint; recursively enumerate nested Stage assemblies and \*.template.json; require nonzero templates/resources for each mode and no manifest.missing; compare direct and pipeline inventory/resource identities against baseline where synthesis exists. Commands: node node_modules/aws-cdk/bin/cdk synth --no-lookups --app 'node --import tsx test/fixtures/starter-entrypoint.cjs direct' --output /tmp/starter-composition-direct; node node_modules/aws-cdk/bin/cdk synth --no-lookups --app 'node --import tsx test/fixtures/starter-entrypoint.cjs pipeline' --output /tmp/starter-composition-pipeline; node node_modules/aws-cdk/bin/cdk synth --no-lookups --app 'node --import tsx test/fixtures/starter-entrypoint.cjs frontend-only' --output /tmp/starter-composition-frontend-only

## Tasks

### T1 — Branch derivation, binding and target-specific preflight

Owner planning-specialist; status completed; dependencies none.

Acceptance criteria:

- Production/default assumption maps to remote main; rendered Branch Plan agrees.
- Normal rebase is conflict-free onto released origin/main R=e706d113cf5c2a147570d02c334272ad316ca372; rebased source head may differ from main and must descend from R. Canonical host-local binding remains github:CodySwannGT/cdkstarter#30 on codex/30-unify-direct-stage.
- GitHub/npm/source docs/CI required access proven; original checkout preserved.

Testing requirements:

- Runtime local config overrides only ignored identity placeholders.

Verification command: git merge-base --is-ancestor e706d113cf5c2a147570d02c334272ad316ca372 HEAD; git rev-parse HEAD origin/main; node scripts/lisa-work-item.mjs current; read current input-transaction provider receipt

Expected: Released R is an ancestor of rebased HEAD905130c; origin/main is R at captured input transaction. Canonical binding identifies github/ref30/current branch; primary issue is open/claimed. Head equality to main is neither expected nor required.

### T2 — Add actual-entrypoint integration fixture and capture RED

Owner implementation-worker; status completed; dependencies T1.

Acceptance criteria:

- Create mandated focused suite and fresh-process actual entrypoint fixture with fake accounts and no lookup/service calls.
- Identical current test/fixture against immutable released R reproduces direct NoCrossStageDependency (current CDK2.272 spelling) while pipeline/frontend-only controls pass with nonzero nested templates. Original CannotDependency observation remains historical.
- Fixture supplies arrays for AZ context, disables shared DNS/agent operations and strips all credential/profile inputs.

Testing requirements:

- Run installed Vitest focused suite against private immutable-R archive with byte-identical current fixture/test: direct expected failure, two controls pass; unchanged source GREEN must pass all three.
- Run direct native CLI and record concrete baseline-regression output; zero tests or zero templates never pass.

Verification command: Run installed Vitest focused suite in /tmp/cdkstarter-30-evidence/resumed-implementation/baseline-R and inspect baseline-R-focused.log/receipt.json plus standalone baseline-direct.log.

Expected: Current R baseline direct exits nonzero with NoCrossStageDependency; pipeline/frontend controls pass. Same fixture/test bytes on resumed source pass all three; no zero-test or empty-template success.

Current completion evidence: Current R identical test/fixture RED1failed2passed (directNoCrossStageDependency); current working-source GREEN3passed. Actual baseline/focused logs and byte digests in resumed-implementation baseline-R-receipt.json/integration-commands.json.

Historical completion evidence (e472 only, retained archive): Exactbaseline1fail2pass vsfinal3pass actualCLI suite;40files426tests; realdirect13templates114resources,pipeline14/140,frontend1/4;allqualitygate commands exit0. Full logs and identities in /tmp/cdkstarter-30-evidence.

### T3 — Unify direct EnvironmentStage and document identity migration

Owner implementation-worker; status completed; dependencies T2.

Acceptance criteria:

- Direct bin/app.ts uses EnvironmentStage with environment/alarmThresholds/github/domainConfig/env contract; remove obsolete split-stage/alarm imports.
- Retain CicdStage and createSharedStages wiring, exact pipeline Env-\* IDs and explicit stack names.
- Update EnvironmentStage documentation and direct setup/migration guidance; explain unavoidable stage artifact/export/import/CDK metadata changes.
- No unrelated resource/IAM/default changes or generated Lisa edits.
- No package-script change is required: preserve the entire released R package.json, host test:integration wrapper and managed test:integration:lisa route exactly. Both adoption and new composition suites must actually execute all six cases.

Testing requirements:

- Focused integration suite green without assertion weakening.
- All three actual CLI modes succeed with resource inventory assertions.
- Compare current-R baseline pipeline14 templates exactly, frontend-only metadata differences explicitly, partial failed direct3 network templates for documented scope changes, and current unified direct/pipeline13 shared IAM/imports/exports. Fresh R baseline pipeline/frontend must match completed29/48 native receipts.

Verification command: Run all three exact native CDK CLI synth commands below in credential-free fresh subprocesses against the reviewed branch fixture/actual entrypoint; recursively enumerate nested Stage assemblies and \*.template.json; require nonzero templates/resources for each mode and no manifest.missing; compare direct and pipeline inventory/resource identities against baseline where synthesis exists. Commands: node node_modules/aws-cdk/bin/cdk synth --no-lookups --app 'node --import tsx test/fixtures/starter-entrypoint.cjs direct' --output /tmp/starter-composition-direct; node node_modules/aws-cdk/bin/cdk synth --no-lookups --app 'node --import tsx test/fixtures/starter-entrypoint.cjs pipeline' --output /tmp/starter-composition-pipeline; node node_modules/aws-cdk/bin/cdk synth --no-lookups --app 'node --import tsx test/fixtures/starter-entrypoint.cjs frontend-only' --output /tmp/starter-composition-frontend-only

Expected: Three actual CLI assemblies are nonempty with no missing context: direct13/114,pipeline14/140,frontend1/4. Pipeline14 templates unchanged, frontend metadata only; documented direct scope differences and IAM/import/export comparisons pass.

Current completion evidence: Current working-source CLI direct13/114,pipeline14/140,frontend1/4/no missingcontext and identity comparisons pass; both local managed integration suites/all6cases executed. Native command and current-R baseline comparison receipts in resumed-implementation. Final exact reviewed commit and remote delivery still pending.

Historical completion evidence (e472 only, retained archive): Exactbaseline1fail2pass vsfinal3pass actualCLI suite;40files426tests; realdirect13templates114resources,pipeline14/140,frontend1/4;allqualitygate commands exit0. Full logs and identities in /tmp/cdkstarter-30-evidence.

### T4 — Independently review resource identities and quality gates

Owner independent-quality-specialist; status pending; dependencies T3.

Acceptance criteria:

- Review ownership, real fixture reachability and migration differences; catch credential leaks or fake proof.
- Run supported typecheck/lint/slow/format/unit+coverage/integration gates with no new SonarJS violations.
- Preserve released R host wrapper and managed :lisa selector exactly; local canonical integration and managed verbose logs execute both suites/all six cases. Required final PR CI must prove named composition cases; broader29 tooling is already terminal and38 remains separate.

Testing requirements:

- UseCI=1 npm ci for real clean install without legacy template side effects.
- Record fixed-success-and-edge and quality-and-template-review logs.
- SonarCloud token absent; no cloud-scan claim. Required configured security/review checks remain mandatory.

Verification command: npm run test:integration; Run all three exact native CDK CLI synth commands below in credential-free fresh subprocesses against the reviewed branch fixture/actual entrypoint; recursively enumerate nested Stage assemblies and \*.template.json; require nonzero templates/resources for each mode and no manifest.missing; compare direct and pipeline inventory/resource identities against baseline where synthesis exists. Commands: node node_modules/aws-cdk/bin/cdk synth --no-lookups --app 'node --import tsx test/fixtures/starter-entrypoint.cjs direct' --output /tmp/starter-composition-direct; node node_modules/aws-cdk/bin/cdk synth --no-lookups --app 'node --import tsx test/fixtures/starter-entrypoint.cjs pipeline' --output /tmp/starter-composition-pipeline; node node_modules/aws-cdk/bin/cdk synth --no-lookups --app 'node --import tsx test/fixtures/starter-entrypoint.cjs frontend-only' --output /tmp/starter-composition-frontend-only

Expected: Independent review remains pending until it covers corrected current metadata and frozen behavior/docs source. Actual current local quality gates and two-suite/six-case integration pass; required named remote CI remains pending.

Current completion evidence: Current root local quality gates pass; initial coverage2timeouts447passed preserved, unchanged isolated canonical coverage43files449cases passes. Independent review of corrected metadata and required final PR CI still pending; no completed review claim.

Historical completion evidence (e472 only, retained archive): Independent plan_quality approved final sixsourcebytes, all14pipeline templates exactbaseline-equal, frontendmetadata-only, directinventory/IAM/exportparity; independentlyranfocused3testspassed. Full40files426testcov and qualitygatespassed; reviewlog /tmp/cdkstarter-30-evidence/independent-review.log.

### T5 — Independent empirical verification and schema-v2 verdict

Owner independent-verification-specialist; status pending; dependencies T4.

Acceptance criteria:

- All three credential-free actual-entrypoint CDK CLI synthesizers conclude exit0 with nonempty nested CloudFormation templates/resources and no missing context. Direct network/app stacks share one Env-dev Stage; pipeline retains Env-dev identity/wiring and explicit physical stack/resource names; frontend-only still emits intended hosting templates. Every generated cross-stack export/import/CDK metadata difference is explained, IAM/default-off feature behavior is unchanged, and the new focused regression is observed red before source change and green afterward, including actual CI execution on the shipped PR head. Required local quality and9 protected remote checks pass; PR into derived main is merged; source evidence/backlinks/usage are visible; then issue is native terminal with configured status:done, rollup runs, binding/context cleared. No deployed AWS/consumer claim is made.
- Attach named baseline-regression, fixed-success-and-edge and quality-and-template-review evidence to source item before closure.
- Verdict code-unit/cli-runtime/source-merge boundaries match evidence and artifacthead; no unit test is presented as deployment proof.

Testing requirements:

- Run native CDK CLI fresh processes at exact branch artifact, inspect nested manifests/templates/resource counts, compare expected identities.
- Verify all comment decisions and accepted source scope explicitly.
- No browser/device/deploy surface is implicated; highest practical regression is native actual-entrypoint CLI synthesis.
- npm run test:integration must execute new suite locally; fetch exact PR-head required integration job logs and require named suite/test counts, not merely green status.

Verification command: Run all three exact native CDK CLI synth commands below in credential-free fresh subprocesses against the reviewed branch fixture/actual entrypoint; recursively enumerate nested Stage assemblies and \*.template.json; require nonzero templates/resources for each mode and no manifest.missing; compare direct and pipeline inventory/resource identities against baseline where synthesis exists. Commands: node node_modules/aws-cdk/bin/cdk synth --no-lookups --app 'node --import tsx test/fixtures/starter-entrypoint.cjs direct' --output /tmp/starter-composition-direct; node node_modules/aws-cdk/bin/cdk synth --no-lookups --app 'node --import tsx test/fixtures/starter-entrypoint.cjs pipeline' --output /tmp/starter-composition-pipeline; node node_modules/aws-cdk/bin/cdk synth --no-lookups --app 'node --import tsx test/fixtures/starter-entrypoint.cjs frontend-only' --output /tmp/starter-composition-frontend-only

Expected: All three credential-free actual-entrypoint CDK CLI synthesizers conclude exit0 with nonempty nested CloudFormation templates/resources and no missing context. Direct network/app stacks share one Env-dev Stage; pipeline retains Env-dev identity/wiring and explicit physical stack/resource names; frontend-only still emits intended hosting templates. Every generated cross-stack export/import/CDK metadata difference is explained, IAM/default-off feature behavior is unchanged, and the new focused regression is observed red before source change and green afterward, including actual CI execution on the shipped PR head. Required local quality and9 protected remote checks pass; PR into derived main is merged; source evidence/backlinks/usage are visible; then issue is native terminal with configured status:done, rollup runs, binding/context cleared. No deployed AWS/consumer claim is made.

### T6 — Ship configured PR/CI, source evidence and terminal rollup

Owner lifecycle-specialist; status pending; dependencies T5.

Acceptance criteria:

- PR targets derived main with non-closing work-item ref and verified reciprocal backlink.
- All9 protected checks and unresolved-review gates pass on final head; actual regression CI log proves suite execution.
- Merge is verified and origin/main contains shipped SHA; no live CloudFormation/deploy required by source-only issue.
- Post source evidence and usage, configured status:done and native closure, parent rollup; clear binding/context only after true terminal completion.

Testing requirements:

- Read live PR merge/check conclusion, not only running status.
- Skip no required checks and keep existing #23 human hold untouched.
- Actual GitHub workflow failures outside composition remain separate backlog/owner work, not a claimed source/deployment success.

Verification command: gh pr view <created-pr> --repo CodySwannGT/cdkstarter --json state,mergedAt,mergeCommit,baseRefName,statusCheckRollup; git merge-base --is-ancestor <merge-sha> origin/main; gh issue view 30 --repo CodySwannGT/cdkstarter --json state,labels,comments; node /Users/cody/workspace/lisa/scripts/lisa-work-item.mjs current

Expected: Verified merged/main source, final required successful checks/regression execution, visible evidence/usage/backlinks, native terminal issue and no binding/context aftercleanup.
