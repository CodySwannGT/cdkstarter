# [cdkstarter] Enroll intended resources in AWS Backup and validate selections

Work item: CodySwannGT/cdkstarter#36. Branch: codex/36-correctness-batch. Production target: main. Shared PR:52. Local foundation: 8755835626432e0b12b0e25b30b7cf1512c09b41, containing #30; released ancestor e706d113. Full ignored context: /tmp/cdkstarter-36-implementation/.lisa/work-item-context.md; SHA256 66ae15d64671009a14070d1416908d73b84a56c754121c61cdde630ec94181b0.

## Acceptance Criteria

```gherkin
Scenario: Enrollment matches
  Given production enables AWS Backup
  When the full environment synthesizes
  Then Aurora is tagged backup=yes and the selection matches it; invalid/empty structural selections fail

Scenario: One failure route
  Given a mocked failed/expired/aborted backup event arrives
  When existing notification handler executes
  Then one alert per event reaches the configured severity route, while successful backups do not page

```

## Execution

1. Read the complete context, identify owning code and primary documentation, and reproduce each required failure with the highest practical offline fixture. Record the meaningful RED result.
2. Implement the smallest correction and passing success/rejection cases. Update affected setup and migration guidance. Keep one ticket-linked commit per coherent correction through normal hooks.
3. A teammate who did not implement the change reviews it. Root integrates related commits and runs full supported quality plus named regression tests once for the completed batch.
4. Root pushes the full batch to PR52 and drives review, CI, merge and configured source release. Original local evidence retains its actual source identity.
5. Verify the released batch, publish the three typed Validation Journey artifacts, post/read usage and backlinks, adopt a schema2 verdict and close this leaf natively. Roll up parents and clear binding/context only after true terminal completion.

No live AWS or downstream mutation. Normal runtime Node22.23.3/npm10.9.9 and the unchanged locked graph are shared. Preserve unrelated edits; do not reset, clean, stash or bypass hooks. Status: implementation complete; independent review and batch delivery pending.

## Local implementation evidence

Full677738-byte context SHA66ae15d64671009a14070d1416908d73b84a56c754121c61cdde630ec94181b0 was read; primary accepted-comment5960674706 and claim5982699899 preserve their obligations. AWS resource-selection/state-change documentation and installed CDK selection API confirm matching tag selectors, FAILED/ABORTED/EXPIRED states and automatic default Backup managed policy attachment. No additional IAM role policy was necessary. Baseline87558316-case suite has14 intended failures/2 controls; identical final fixture passes together with existing BackupStack and actual asset-handler contracts (35 total). Typecheck/scoped lint pass. Corrected initial matcher/array-row shape run retained separately. Logs under `/tmp/cdkstarter-36-evidence`; root owns independent review, full quality/final CLI/template proof, named CI, release, typed publication and canonical closeout.

Enrollment tags are applied in unified EnvironmentStage and legacy AppStage, avoiding changes to AuroraStack core owned by31/37. Default backup=yes selection and native retention remain. Explicit selectionTags must be structurally nonempty/valid. The original one EventBridge target remains; direct failures are critical/error, SNS failures retain warning/critical routing, and successful/in-progress jobs emit no request. This proves one request per input event, not durable exactly-once delivery or successful live backups/restores.
