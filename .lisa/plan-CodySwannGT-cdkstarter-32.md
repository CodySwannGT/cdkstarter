# [cdkstarter] Support immutable GitHub OIDC subjects and explicit repository trust

Work item: CodySwannGT/cdkstarter#32. Branch: codex/32-correctness-batch. Production target: main. Shared PR:52. Local foundation: 8755835626432e0b12b0e25b30b7cf1512c09b41, containing #30; released ancestor e706d113. Full ignored context: /tmp/cdkstarter-32-implementation/.lisa/work-item-context.md; SHA256 6483415aaa9e200e4e97fc4f303124319f02e79666c0f204a1bf339e91f81b7d.

## Acceptance Criteria

```gherkin
Scenario: Immutable subject match
  Given a configured allowed repository, owner/repo IDs, and main ref
  When the trust policy is synthesized and evaluated against sample sub claims
  Then the immutable allowed claim matches; another repository or ref is denied

Scenario: Explicit legacy transition
  Given legacy compatibility is disabled then explicitly enabled
  When legacy and immutable subjects are evaluated
  Then legacy is denied by default and accepted only for the configured repository/filter when enabled

```

## Execution

1. Read the complete context, identify owning code and primary documentation, and reproduce each required failure with the highest practical offline fixture. Record the meaningful RED result.
2. Implement the smallest correction and passing success/rejection cases. Update affected setup and migration guidance. Keep one ticket-linked commit per coherent correction through normal hooks.
3. A teammate who did not implement the change reviews it. Root integrates related commits and runs full supported quality plus named regression tests once for the completed batch.
4. Root pushes the full batch to PR52 and drives review, CI, merge and configured source release. Original local evidence retains its actual source identity.
5. Verify the released batch, publish the three typed Validation Journey artifacts, post/read usage and backlinks, adopt a schema2 verdict and close this leaf natively. Roll up parents and clear binding/context only after true terminal completion.

No live AWS or downstream mutation. Normal runtime Node22.23.3/npm10.9.9 and the unchanged locked graph are shared. Preserve unrelated edits; do not reset, clean, stash or bypass hooks. Status: source implementation complete; independent review and consolidated batch delivery pending.

Focused RED: all 8 OIDC acceptance/invalid-configuration cases failed on baseline 8755835; log `/tmp/cdkstarter-32-evidence/baseline-regression.log`.
Focused GREEN: 8 OIDC plus 6 IAM deploy-role and 21 pipeline unit cases passed (35 total), `/tmp/cdkstarter-32-evidence/fixed-success-and-edge-2.log`. Typecheck passed. Direct test runs also exposed unowned CDK assembly cleanup, now removed in afterEach without disabling Lisa's leak guard.

Only OIDC5.2.0 and constructs10.7.2 changed in the installed graph. Normal npm10 lock resolution and isolated CI=1 npm ci succeeded. The old Lambda-backed OIDC custom resource becomes the native IAM provider; migration documentation requires administrator-controlled provider import/migration for existing accounts. GitHub subject allowlists fail closed on placeholder IDs, with explicit legacy opt-in. No live AWS, GitHub settings or downstream mutation.
