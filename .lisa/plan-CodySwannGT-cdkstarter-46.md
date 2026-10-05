# [cdkstarter] Add optional SSM secret copying and exact build-tool pins

Work item CodySwannGT/cdkstarter#46, bound worktree /tmp/cdkstarter-46-implementation, branch codex/46-optional-batch, source foundation 289ebe3b83c6f1d9ed9fe61259a59c0b3c228d80; full ignored canonical context SHA256 78057ba513585c97b03db7be511e5fb1b683bd209cc503d90e7a50e87495f0c4. Verified claim and binding precede this plan.

## Acceptance Criteria

```gherkin
Scenario: Defaults add neither secret copying nor build executables
  Given both optional blocks are absent
  When app synthesis and Amplify build-spec rendering run offline
  Then no copier resources or downloaded CLI commands are emitted

Scenario: Copy resources carry references only
  Given one explicitly configured SSM-to-secret mapping and customer-managed key references
  When the fixture synthesizes offline
  Then custom-resource properties contain identifiers only and IAM grants target only the mapping parameter, destination secret, and supplied KMS keys

Scenario: Copy lifecycle is idempotent and redacted
  Given mocked create/update/delete/change events and a distinctive fake secret value
  When the real handler runs using injected SDK collaborators
  Then equal values skip writes, delete performs no write, unrelated change events are ignored, and the value never appears in responses, logs, thrown errors, or recorded custom-resource data

Scenario: Failed secret access cannot be mistaken for a completed copy
  Given an empty source value or mocked SDK error containing a secret value
  When the copier handles the event
  Then the invocation fails with a generic identifier-only error and sanitized output without leaking the SDK message

Scenario: Only exact approved executable versions are rendered
  Given a caller-selected build tool with an exact manifest version and a range/tag alternative
  When configuration validation and build-command rendering run
  Then the exact version is referenced from the single manifest, the range/tag is rejected, and a mismatched preinstalled version cannot silently bypass the selected pin

```


## Execution

1. Read entire canonical context and prior bounded research. Prove meaningful baseline regressions and passing controls.
2. Implement owning default-off source, named tests and documentation only. Preserve source/IAM identities and managed quality settings. Normal small ticket-linked commits and hooks.
3. Root independent source/security/evidence review then integrate green38-41 and optional modules into bounded batched PRs after actual PR52 release ancestry. Actual named tests/native/quality gates.
4. Authentic review/CI/ordinary merge/configured source release, fresh released-source verification, typed published artifacts, canonical usage/backlinks and native closeout. No AWS/downstream adoption claim.

The user explicitly authorized small local commits and batched PRs to avoid serial CI waits. Root authorizes the same narrow active technical body-prerequisite timing exception for optional source implementation while #41 is built and #38/#40 are green/#39 active. Preserve every dependency edge and actual OPEN status. No human hold is discharged, #23 remains excluded, and no container or AWS deployment claim is authorized. The next optional PR cannot merge or close before PR52 released ancestry and integrated green #38–41 are established. Code foundation is exact reviewed/root 289ebe3b83c6f1d9ed9fe61259a59c0b3c228d80.


## Implementation proof

Ownership: `SecretCopier`, the deployed JavaScript asset, metadata-only mapping validation and stage wiring; one exact tool manifest/renderer and the narrow Amplify default build policy. #43 owner confirmed explicit command arrays remain caller-owned and its frozen hosting options are independent. No dependency/lock, managed gate, global plugin, AWS or downstream edits.

The initial managed required suite failed all17 cases: default hidden floating Bun was observed, and the new construct/asset/renderer were absent. Subsequent implementation passed17. The additional actual shell regression then failed2 with20 positive controls because piping `--version` into sed concealed a nonzero executable exit. Replacing that check with exit-aware command substitution fixed it; the expanded managed suite now passes30 required cases plus31 existing stage/config/hosting cases,61 total. Original raw RED logs remain in `/tmp/cdkstarter-46-evidence`.

Fixtures synthesize exact data and CMK grants in aws/aws-cn/aws-us-gov, evaluate positive/negative action/resource/context requests, assert no Delete/wildcard data operations, and cover caller-scope physical/logical stability, no-key grants, absent stage/resources, exact Create/Update change rules, SDK entrypoint/delete/config failures, source/target errors, redaction, idempotent retries and explicit caller commands. Actual local shell controls prove matching versions skip installation, missing/wrong versions install/recheck, and failing installed binaries fail; no network is used.

Primary AWS contracts checked: Parameter Store `PARAMETER_ARN`, Secrets Manager `SecretARN`, and KMS ViaService `.amazonaws.com` for every partition. Concrete owning account/region and current destination SecretString are required; no cross-account transport, destination creation or atomic/exactly-once claim. Default frontend npm commands intentionally replace hidden Bun behavior under this ticket.

Typecheck and focused fast/slow lint pass without changing gate settings. Root owns full combined gates, independent review and actual three-mode native synthesis, release evidence and ticket closeout. Public dependency adoption under #39 remains separate and pending.
