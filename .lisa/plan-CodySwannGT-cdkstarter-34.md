# [cdkstarter] Correct Aurora saturation alarm units and direction

Work item: CodySwannGT/cdkstarter#34. Branch: codex/34-correctness-batch. Production target: main. Shared PR:52. Local foundation: 8755835626432e0b12b0e25b30b7cf1512c09b41, containing #30; released ancestor e706d113. Full ignored context: /tmp/cdkstarter-34-implementation/.lisa/work-item-context.md; SHA256 87b391c20ce5f504d0471f62ea2ca0a72c07c76b8e1bdffbd38ab9cc802e92be.

## Acceptance Criteria

```gherkin
Scenario: Capacity thresholds
  Given dev max2, staging max8, production max32
  When alarm templates are synthesized
  Then warning/critical ACU thresholds equal80/90% of each ceiling and breach at high capacity, not low capacity

Scenario: Role and identity stability
  Given a writer and optional readers exist
  When saturation rises on one role
  Then role-specific signals retain Maximum and existing alarm identities; missing data does not falsely page

```

## Execution

1. Read the complete context, identify owning code and primary documentation, and reproduce each required failure with the highest practical offline fixture. Record the meaningful RED result.
2. Implement the smallest correction and passing success/rejection cases. Update affected setup and migration guidance. Keep one ticket-linked commit per coherent correction through normal hooks.
3. A teammate who did not implement the change reviews it. Root integrates related commits and runs full supported quality plus named regression tests once for the completed batch.
4. Root pushes the full batch to PR52 and drives review, CI, merge and configured source release. Original local evidence retains its actual source identity.
5. Verify the released batch, publish the three typed Validation Journey artifacts, post/read usage and backlinks, adopt a schema2 verdict and close this leaf natively. Roll up parents and clear binding/context only after true terminal completion.

No live AWS or downstream mutation. Normal runtime Node22.23.3/npm10.9.9 and the unchanged locked graph are shared. Preserve unrelated edits; do not reset, clean, stash or bypass hooks. Status: implementation complete; independent review and batch delivery pending.

## Local implementation evidence

Primary comments5960673742 (accepted leaf) and5982696972 (managed claim), both CodySwannGT/User292923, were read in full. No secret values were copied. AWS metrics/dimensions documentation confirms ACUs and WRITER/READER role dimensions. The current41 targeted tests pass; the identical-final14-case regression fails on the archived875583 baseline. Actual logs under `/tmp/cdkstarter-34-evidence` retain the initial fixture-shape/scratch corrections and failed direct-bin managed runner invocation separately. Typecheck passed; scoped lint/format run after documentation fixes. Root owns full quality, actual final-commit/offline CLI/template review, required CI, source release, published three typed assets and canonical lifecycle closeout. No AWS or downstream behavior is established.
