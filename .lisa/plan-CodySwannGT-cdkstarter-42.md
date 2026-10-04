# [cdkstarter] Add optional cross-account DNS delegation

Work item: CodySwannGT/cdkstarter#42. Target main. Bound worktree /tmp/cdkstarter-42-implementation, branch codex/42-optional-batch. Reviewed source foundation 289ebe3b83c6f1d9ed9fe61259a59c0b3c228d80; prior batch released as v0.0.2, source a8766e5e965d86138b996de31f373ccc2196a065. Full ignored context .lisa/work-item-context.md, SHA256 701754ec0315c95b3f9324c91f4cdb7b57900aee5d45371144c363bceff7ad03. Verified native claim/binding before this plan.

## Acceptance Criteria

```gherkin
Scenario: Default configuration remains unchanged
  Given a configuration with no DNS delegation block
  When the support and application fixtures synthesize offline
  Then no DNS delegation role or cross-account custom resource is emitted and existing DNS resource logical IDs are unchanged

Scenario: Configured cross-account delegation is narrowly scoped
  Given parent zone example.test in account 111111111111 and child dev.example.test in account 222222222222 with explicit delegation role settings
  When both fixtures synthesize without context lookups
  Then the child delegates through the supplied parent role ARN and the parent grants NS changes only for dev.example.test in the configured hosted zone to the configured child account

Scenario: Invalid domain and trust input fails before deployment
  Given a child outside its parent, duplicate child entries, or a malformed trusted account ID
  When configuration validation runs
  Then a specific actionable error is raised before stacks are constructed

Scenario: Deletion and migration behavior is explicit
  Given a valid enabled delegation fixture and the existing support DNS fixture
  When templates and lifecycle properties are compared
  Then existing zone and certificate identities are preserved and default deletion retains the delegation record with an explicit documented cleanup procedure

```


## Execution

1. Read the complete canonical context and existing bounded owning research. Preserve actual dependency edges. Prove meaningful baseline regressions and passing controls at the highest supported offline boundary.
2. Implement only this optional module and required named tests/documentation. Default-off behavior must preserve existing resources, identities, outputs and IAM. Preserve managed configuration and quality thresholds. Normal ticket-linked small commits and hooks.
3. Root independently reviews exact source and evidence. Integrate optional leaves after green38-41 and released PR52 ancestry; run actual combined named tests, native synth and quality gates.
4. Drive batched PR through real review, CI, ordinary merge, configured release, actual released-source verification, typed published artifacts, canonical usage/backlinks and native closeout. No AWS or downstream adoption claims.

The user explicitly authorized small local commits and batched PRs to avoid serial CI waits. Root authorizes the same narrow active technical body-prerequisite timing exception for optional source implementation while #41 is built and #38/#40 are green/#39 active. Preserve every dependency edge and actual OPEN status. No human hold is discharged, #23 remains excluded, and no container or AWS deployment claim is authorized. The next optional PR cannot merge or close before PR52 released ancestry and integrated green #38–41 are established. Code foundation is exact reviewed/root 289ebe3b83c6f1d9ed9fe61259a59c0b3c228d80.

## Local implementation proof (delivery remains pending)

At the bound source foundation above, the required named fixture first returned 7 failures and 1 passing default-off control. It exposed absent authorization/delegation and accepted invalid child/trust inputs. The implementation preserves legacy support-zone/certificate resources and outputs, reuses the CDN ApiZone/EdgeCertificate identity, and retains both the new delegation record and its child zone. Parent authorization targets the supplied existing zone ID without replacing managed zones. Each parent role is separate and trusts only configured accounts; its policy permits exact-name NS UPSERT/DELETE without hosted-zone listing.

Focused DNS/CDN/stage controls passed 45 cases. The real managed `npm run test:integration` route collected and passed 94 cases across 10 files, including 11 required DNS fixture cases and actual startup validation. Private raw logs and final source receipt are under `/tmp/cdkstarter-42-evidence`. These are offline local observations, not CI, AWS deployment, optional-batch merge/release, or closeout claims. Root independently reviews before integration and performs final combined quality/delivery.
