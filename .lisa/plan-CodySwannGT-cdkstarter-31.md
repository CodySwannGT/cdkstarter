# [cdkstarter] Grant proxy database access to separate application users

Work item: CodySwannGT/cdkstarter#31. Branch: codex/31-correctness-batch. Production target: main. Shared PR:52. Local foundation: 8755835626432e0b12b0e25b30b7cf1512c09b41, containing #30; released ancestor e706d113. Full ignored context: /tmp/cdkstarter-31-implementation/.lisa/work-item-context.md; SHA256 11dea464d8acb46b62fd17b662103d3191e9820fc2ae27bfd70f13dde54339d1.

## Acceptance Criteria

```gherkin
Scenario: Application proxy grant
  Given application user and proxy are configured
  When IAM and Aurora stacks synthesize
  Then rds-db:connect names arn:aws:rds-db:<region>:<account>:dbuser:prx-<id>/<configured-user>, with no rds cluster ARN grant or app read of the master secret

Scenario: Repeat bootstrap
  Given a mocked database contains an existing application/read-only user
  When bootstrap is executed twice
  Then grants converge idempotently, read-only user cannot write, and logs contain no secret values

```

## Execution

1. Read the complete context, identify owning code and primary documentation, and reproduce each required failure with the highest practical offline fixture. Record the meaningful RED result.
2. Implement the smallest correction and passing success/rejection cases. Update affected setup and migration guidance. Keep one ticket-linked commit per coherent correction through normal hooks.
3. A teammate who did not implement the change reviews it. Root integrates related commits and runs full supported quality plus named regression tests once for the completed batch.
4. Root pushes the full batch to PR52 and drives review, CI, merge and configured source release. Original local evidence retains its actual source identity.
5. Verify the released batch, publish the three typed Validation Journey artifacts, post/read usage and backlinks, adopt a schema2 verdict and close this leaf natively. Roll up parents and clear binding/context only after true terminal completion.

No live AWS or downstream mutation. Normal runtime Node22.23.3/npm10.9.9 and the unchanged locked graph are shared. Preserve unrelated edits; do not reset, clean, stash or bypass hooks. Status: source implemented and targeted verification passed; independent review/batch delivery pending.

## Implementation decisions

Use end-to-end proxy IAM plus cluster IAM authentication to satisfy required rds_iam membership without mixing PostgreSQL password-backed proxy authentication. Separate application/optional-read-only secret records remain isolated, but the proxy omits explicit Auth entries: AWS AuthFormat SECRETS selects backend password authentication and conflicts with IAM-only users. This necessary evidence-backed deviation replaces the issue’s secret-registration wording. The master secret is not registered or readable by runtime IAM. Explicit operator bootstrap uses IAM-only PASSWORD NULL users, convergent grants and mocked clients; live execution requires a separate authorized migration. Source resource identities are retained; dedicated secrets, narrowed proxy/cluster IAM and bootstrap grants are intentional changes. All remote review/CI/release/usage/evidence/closure remain pending.

## Local verification

Actual Node22.23.3/npm10.9.9: auth-corrected-green passed all 17 named tests (three database integration and fourteen existing IAM), typecheck passed, and canonical test:integration passed all nine adoption/composition/database cases. Receipts: /tmp/cdkstarter-31-evidence/auth-corrected-{green,typecheck,integration}.log. The initial baseline regression failed all three required cases for invalid IAM/absent bootstrap and also retained an ancillary generic-runner scratch error. Earlier failed attempts remain historical. No live database or remote delivery claim.
