# [cdkstarter] Add optional Amplify SPA rules, headers, and build alerts

Work item: CodySwannGT/cdkstarter#43. Target main. Bound worktree /tmp/cdkstarter-43-implementation, branch codex/43-optional-batch. Reviewed source foundation 289ebe3b83c6f1d9ed9fe61259a59c0b3c228d80; prior batch released as v0.0.2, source a8766e5e965d86138b996de31f373ccc2196a065. Full ignored context .lisa/work-item-context.md, SHA256 90653d9acddbe1e20a01bde0087731be9a115f81e69f1f81c5fdb465ef7a0652. Verified native claim/binding before this plan.

## Acceptance Criteria

```gherkin
Scenario: Non-SPA projects preserve behavior
  Given the current Amplify fixture without any new options
  When the fixture synthesizes offline
  Then the build spec and existing app/branch identities are unchanged and no fallback rewrite, custom headers, or build-failure rule is added

Scenario: SPA fallback preserves explicit routes and real HTML assets
  Given SPA fallback enabled with one caller-defined redirect and a real HTML callback asset path
  When rewrite configuration is rendered and tested against representative paths
  Then the explicit redirect precedes the fallback, extensionless application paths rewrite to /index.html with status 200, and static assets including the HTML callback bypass the fallback

Scenario: Headers are explicit and validated
  Given caller-defined headers for a path pattern and a fixture containing an invalid newline in a header value
  When configuration is rendered or validated
  Then valid headers appear only on configured patterns and the malformed value fails validation

Scenario: Failed builds route only to the configured destination
  Given notifications enabled for one application and branch with an explicit SNS topic ARN
  When EventBridge rule templates and representative success/failure event fixtures are inspected
  Then only FAILED events for the configured application/branches match and the target is the configured topic

Scenario: Partial options do not create hidden integrations
  Given SPA routing alone is enabled and no notification destination is set
  When the fixture synthesizes offline
  Then no Sentry, source-map upload, global CLI installation, or notification resource is added

```


## Execution

1. Read the complete canonical context and existing bounded owning research. Preserve actual dependency edges. Prove meaningful baseline regressions and passing controls at the highest supported offline boundary.
2. Implement only this optional module and required named tests/documentation. Default-off behavior must preserve existing resources, identities, outputs and IAM. Preserve managed configuration and quality thresholds. Normal ticket-linked small commits and hooks.
3. Root independently reviews exact source and evidence. Integrate optional leaves after green38-41 and released PR52 ancestry; run actual combined named tests, native synth and quality gates.
4. Drive batched PR through real review, CI, ordinary merge, configured release, actual released-source verification, typed published artifacts, canonical usage/backlinks and native closeout. No AWS or downstream adoption claims.

The user explicitly authorized small local commits and batched PRs to avoid serial CI waits. Root authorizes the same narrow active technical body-prerequisite timing exception for optional source implementation while #41 is built and #38/#40 are green/#39 active. Preserve every dependency edge and actual OPEN status. No human hold is discharged, #23 remains excluded, and no container or AWS deployment claim is authorized. The next optional PR cannot merge or close before PR52 released ancestry and integrated green #38–41 are established. Code foundation is exact reviewed/root 289ebe3b83c6f1d9ed9fe61259a59c0b3c228d80.

## Local implementation checkpoint

Steps1–2 completed locally. Exact final eighteen-case regression on archived289 baseline: sixteen failures and two retained controls. Candidate normal managed suite: eighteen new cases plus prior hosting/config-loader tests, three files/47passes. Typecheck, scoped ESLint and scoped slow/SonarJS checks pass with no warnings.

The original default hosting fixture with implicit build commands synthesizes a byte-identical complete template before/after this slice. App/branch identities, outputs, build specification and default IAM are preserved. Explicit options affect only app routing/header properties and, when enabled, an exact FAILED/appID/branches rule plus a topic-scoped publish role. Imported topic policies are not overwritten. Current AWS primary documentation supports role-based SNS authorization; external cross-account/CMK permissions and live delivery remain consumer prerequisites.

Full canonical context2165688B/SHA90653d9acddbe1e20a01bde0087731be9a115f81e69f1f81c5fdb465ef7a0652 read/parsed, both primary comment obligations5960678833/5985322197 retained. Pinned donor and primary AWS contracts are recorded in /tmp/cdkstarter-43-evidence/implementation/research-inputs.json. No changes to explicit build commands or existing implicit defaults;46 owns their intentional tool changes.

Steps3–4 remain pending root independent source review, integrated dependency/module graph quality and offline synth, batched PR review/CI/source release and terminal proof. No AWS service invocation, live delivery or downstream adoption claim.
