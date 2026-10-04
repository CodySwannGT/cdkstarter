# [cdkstarter] Constrain application deploy permissions with an attached boundary

Work item: CodySwannGT/cdkstarter#33. Branch: codex/33-correctness-batch. Production target: main. Shared PR:52. Local foundation: 8755835626432e0b12b0e25b30b7cf1512c09b41, containing #30; released ancestor e706d113. Full ignored context: /tmp/cdkstarter-33-implementation/.lisa/work-item-context.md; SHA256 91fdb1741b8bac73283c0f50bce6d04cb67da5d6d3021269269e2596b78574e9.

## Acceptance Criteria

```gherkin
Scenario: Application ceiling
  Given an application stack prefix and role allowlist are configured
  When deploy policy plus attached boundary are synthesized and evaluated
  Then the approved application deploy is allowed, while unrelated IAM writes/pass-role and sts:AssumeRole on arbitrary targets are denied

Scenario: No inert boundary
  Given a deploy role uses an application permission ceiling
  When the IAM template is inspected
  Then the role attaches the boundary ARN and the boundary constrains the granted actions

Scenario: Execution roles cannot bypass the ceiling
  Given an attempted administrator CloudFormation execution role, unbounded created app role or boundary removal
  When the combined policies and boundary are evaluated
  Then all three escalation paths are denied while approved bounded application deployment remains allowed

```

## Execution

1. Read the complete context, identify owning code and primary documentation, and reproduce each required failure with the highest practical offline fixture. Record the meaningful RED result.
2. Implement the smallest correction and passing success/rejection cases. Update affected setup and migration guidance. Keep one ticket-linked commit per coherent correction through normal hooks.
3. A teammate who did not implement the change reviews it. Root integrates related commits and runs full supported quality plus named regression tests once for the completed batch.
4. Root pushes the full batch to PR52 and drives review, CI, merge and configured source release. Original local evidence retains its actual source identity.
5. Verify the released batch, publish the three typed Validation Journey artifacts, post/read usage and backlinks, adopt a schema2 verdict and close this leaf natively. Roll up parents and clear binding/context only after true terminal completion.

No live AWS or downstream mutation. Normal runtime Node22.23.3/npm10.9.9 and the unchanged locked graph are shared. Preserve unrelated edits; do not reset, clean, stash or bypass hooks. Status: implementation complete; independent review and consolidated batch delivery pending.

Local prerequisite #32 commit 662d02e is an ordinary cherry-pick of ee550aa (root integrates the original #32 leaf separately). The #33 baseline reproduces all three required scenario failures with real synthesized inline policy, including administrator executor acceptance and missing attached boundary. Log: `/tmp/cdkstarter-33-evidence/baseline-regression.log`.

Focused GREEN: 3 effective-permission scenarios plus all 8 OIDC cases and 6 IAM stack cases pass (17 total), `/tmp/cdkstarter-33-evidence/fixed-success-and-edge-3.log`. The evaluator resolves actual fixture CloudFormation partition joins, intersects actual role inline statements with its attached managed boundary, enforces explicit denies and condition absence, and tests approved deployment plus arbitrary STS, unrelated IAM/PassRole/stack, admin executor, unbounded CreateRole, boundary removal/replacement and protected policy/executor writes. Typecheck passes.

The protected ceiling and CloudFormation execution role are new resources. The deploy-role identity/output name remains unchanged, but its former account administrator policy is intentionally replaced with the configurable application ceiling. Direct Create/Update/DeleteStack requests require the exact executor. Change-set creation/execution is denied because execution cannot carry a required RoleArn request. Setup documentation names this workflow restriction and administrator-controlled migration of any existing allowlisted roles into the boundary. No live AWS, downstream, legacy observer or bootstrap-administrator mutation.
