# [cdkstarter] Add optional GraphQL operation alarms and cause fingerprints

Work item: CodySwannGT/cdkstarter#45. Target main. Bound worktree /tmp/cdkstarter-45-implementation, branch codex/45-optional-batch. Reviewed source foundation 289ebe3b83c6f1d9ed9fe61259a59c0b3c228d80; prior batch released as v0.0.2, source a8766e5e965d86138b996de31f373ccc2196a065. Full ignored context .lisa/work-item-context.md, SHA256 cf61102e36ff19c33f87cf54fac29e8afd99ced5bffd67c996f4186d408f5f68. Verified native claim/binding before this plan.

## Acceptance Criteria

```gherkin
Scenario: Monitoring and grouping are opt-in
  Given a fixture with GraphQL monitoring and cause grouping omitted
  When the app and forwarder tests execute offline
  Then no GraphQL alarms are emitted and existing alert fingerprint behavior is preserved

Scenario: Protected traffic has a safe instrumentation transition
  Given a configured protected operation with authenticated and anonymous dimensions
  When metric expressions are synthesized and evaluated with representative populated and absent auth-state series
  Then authenticated traffic is rated when auth-state data exists and the all-traffic fallback remains meaningful when those series are absent

Scenario: Public and low-volume operations are explicit
  Given one public operation and one operation below the caller-defined invocation floor
  When the rate-expression fixtures are evaluated
  Then public traffic is never excluded as anonymous and below-floor traffic yields zero without division by zero

Scenario: Severity changes do not split a cause
  Given warning and critical events with the same explicit cause/resource/environment metadata and enabled grouping
  When the mocked forwarder produces outgoing payloads
  Then their fingerprints match while severity is retained, and different causes, resources, or environments generate different fingerprints

Scenario: Malformed configuration and downstream failures are observable
  Given duplicate operation definitions or warning thresholds at or above critical, plus a mocked failing notification response
  When validation and handler tests execute
  Then invalid definitions fail before synthesis and notification failures produce bounded redacted error output without silently claiming success

```


## Execution

1. Read the complete canonical context and existing bounded owning research. Preserve actual dependency edges. Prove meaningful baseline regressions and passing controls at the highest supported offline boundary.
2. Implement only this optional module and required named tests/documentation. Default-off behavior must preserve existing resources, identities, outputs and IAM. Preserve managed configuration and quality thresholds. Normal ticket-linked small commits and hooks.
3. Root independently reviews exact source and evidence. Integrate optional leaves after green38-41 and released PR52 ancestry; run actual combined named tests, native synth and quality gates.
4. Drive batched PR through real review, CI, ordinary merge, configured release, actual released-source verification, typed published artifacts, canonical usage/backlinks and native closeout. No AWS or downstream adoption claims.

The user explicitly authorized small local commits and batched PRs to avoid serial CI waits. Root authorizes the same narrow active technical body-prerequisite timing exception for optional source implementation while #41 is built and #38/#40 are green/#39 active. Preserve every dependency edge and actual OPEN status. No human hold is discharged, #23 remains excluded, and no container or AWS deployment claim is authorized. The next optional PR cannot merge or close before PR52 released ancestry and integrated green #38–41 are established. Code foundation is exact reviewed/root 289ebe3b83c6f1d9ed9fe61259a59c0b3c228d80.

## Local implementation proof (independent review and delivery pending)

The reviewed #38 source was carried normally onto the bound289ebe foundation as88d0148d00d9d57e2a00af60326ed59208ba7172, retaining its original Work-Item38 trailer; the native binding was restored to45 before implementation. Root will integrate original38 first and only the new45 delta. Full45 ignored context remains unchanged.

The initial21-case required suite and its exact source were preserved privately before implementation. It returned16 failures and5 passing default-off/fallback controls. The final suite has27 cases, adding latency, threshold-boundary and independent-switch controls. It evaluates actual emitted CloudFormation query graphs against independent input series, without importing production math helpers. Protected anonymous-only traffic rates zero; missing auth-state data falls back to all traffic. Strict budget exceedance keeps zero warning budgets nonbreaching below the invocation floor. Grouping uses bounded versioned descriptions and retains severity separately; malformed/mismatched metadata falls back to the original alarm-name fingerprint.

Focused GraphQL/handler/SNS/stage controls passed86 cases before the last independent-switch fixture addition. The managed integration route subsequently passed113 cases across11 files, including all27 GraphQL cases. Typecheck and focused ESLint passed. Private exact sources, logs and freeze receipt are under `/tmp/cdkstarter-45-evidence`. Existing Node20 forwarder deprecation warnings are preserved, without a new runtime pin policy. Default-off resource identities, routes and IAM are unchanged; the existing forwarder asset intentionally changes for opt-in grouping and generic redacted rejection errors. These observations do not claim live backend metrics, Sentry ingestion, CI, optional-batch merge/release or closeout.
