# [cdkstarter] Add a configurable optional SMS spend circuit breaker

Work item CodySwannGT/cdkstarter#47, bound worktree /tmp/cdkstarter-47-implementation, branch codex/47-optional-batch, source foundation 289ebe3b83c6f1d9ed9fe61259a59c0b3c228d80; full ignored canonical context SHA256 4ae4f86df381da7d85006b876f3373d01bc951ea47947f6c7e3bb1b3a1b4b003. Verified claim and binding precede this plan.

## Acceptance Criteria

```gherkin
Scenario: Default configuration has no SMS side effects
  Given the module is absent or enabled:false
  When the app synthesizes offline
  Then no SMS monitor, evaluator, preference mutation, country-policy resource, or new SMS permission is emitted

Scenario: Observe mode cannot change spend preferences
  Given complete monitoring configuration with mode omitted
  When the fixture synthesizes and a mocked cap breach is processed
  Then monitoring uses caller-defined thresholds and notification destination while no sns:SetSMSAttributes allow is emitted or invoked

Scenario: Enforcement trips once and requires explicit recovery
  Given mode enforce, a mocked daily cap breach, and persisted state initially untripped
  When the evaluator processes the breach twice and then a new UTC day/month
  Then one preference-reduction operation occurs, trip state and notification retain configured identifiers, and later evaluations never automatically restore sending

Scenario: Recovery respects the chosen account ceiling
  Given a tripped fake state with a successful then failing preference-update response
  When the explicit recovery command runs with injected clients
  Then it never restores above the configured monthly preference and clears trip state only after a successful update

Scenario: Invalid input and stale data do not cause silent enforcement
  Given incomplete limits, a nonpositive cap, or missing/stale metric samples
  When validation and mocked evaluator tests run
  Then invalid input fails before synthesis and unavailable/stale spend data raises an observable evaluator error without lowering or restoring the account preference

```


## Execution

1. Read entire canonical context and prior bounded research. Prove meaningful baseline regressions and passing controls.
2. Implement owning default-off source, named tests and documentation only. Preserve source/IAM identities and managed quality settings. Normal small ticket-linked commits and hooks.
3. Root independent source/security/evidence review then integrate green38-41 and optional modules into bounded batched PRs after actual PR52 release ancestry. Actual named tests/native/quality gates.
4. Authentic review/CI/ordinary merge/configured source release, fresh released-source verification, typed published artifacts, canonical usage/backlinks and native closeout. No AWS/downstream adoption claim.

The user explicitly authorized small local commits and batched PRs to avoid serial CI waits. Root authorizes the same narrow active technical body-prerequisite timing exception for optional source implementation while #41 is built and #38/#40 are green/#39 active. Preserve every dependency edge and actual OPEN status. No human hold is discharged, #23 remains excluded, and no container or AWS deployment claim is authorized. The next optional PR cannot merge or close before PR52 released ancestry and integrated green #38–41 are established. Code foundation is exact reviewed/root 289ebe3b83c6f1d9ed9fe61259a59c0b3c228d80.

## Local implementation checkpoint

Full canonical input was parsed/read before source work (2,167,960 bytes; SHA256 4ae4f86df381da7d85006b876f3373d01bc951ea47947f6c7e3bb1b3a1b4b003). Primary obligations 5960680946/5985502220 remain preserved. Pinned donor source and primary SNS/CloudWatch/IAM/Node runtime references were reviewed; donor limits, floor, countries and custom-resource preference changes were not copied.

The accepted API interpretation uses positive observed MTD, without claiming an unverified service minimum or decimal precision. Day/surge values are timestamped estimates requiring an early-day anchor and an exact 300-second same-month pair. Ten-minute freshness is a local policy, not an AWS SLA. Persisted conditional intent prevents repeated normal-path reductions; SNS has no transactional/idempotency token, so crashes require exact readback/manual reconciliation. A retained positive preference can permit SMS again after monthly reset; no indefinite freeze is claimed. Root authorized the AWS CLI Lambda invocation plus exported injected-client recovery boundary instead of new local SDK/package dependencies.

Exact final named test bytes on archived 289ebe3 yielded 33 intended failures and two controls passing; final candidate managed execution passed 71 cases across three files, including all 35 SMS cases. Typecheck, scoped source ESLint, applicable TypeScript slow rules and formatting passed. Main lint covers runtime JS; the canonical slow config intentionally excludes JS/CJS/MJS. Default-off complete support templates with existing flow logs remain byte-equal to the foundation. Earlier fixture/import/data-table observations remain separately preserved.

Local proof covers real synth IAM/resources, genuine injected controller/handler/SDK command adapters and explicit CLI recovery payload/cleanup. No AWS credentials, SMS sends, deployment, live preferences/topic delivery or downstream adoption were exercised. Root independent review, combined graph/full quality, CI/review/merge/release and typed evidence/native closeout remain pending.
