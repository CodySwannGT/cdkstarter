# [cdkstarter] Validate accounts, CIDRs, Aurora configuration and feature support

Work item: CodySwannGT/cdkstarter#37. Branch: codex/37-correctness-batch. Production target: main. Shared PR:52. Local foundation: 8755835626432e0b12b0e25b30b7cf1512c09b41, containing #30; released ancestor e706d113. Full ignored context: /tmp/cdkstarter-37-implementation/.lisa/work-item-context.md; SHA256 838ddc47ab33f78c7a6ad541083cedc5a8beee540cebe83d95d0c0137b5f79cd.

## Acceptance Criteria

```gherkin
Scenario: Invalid config fails early
  Given malformed accounts, overlapping CIDRs, duplicate environment names or multiple support environments are supplied
  When configuration loads
  Then each is rejected before constructs are created with a specific actionable message

Scenario: Multiple readers and engine selection
  Given instanceCount3 and an explicit supported-in-fixture engine version are configured
  When Aurora synthesizes
  Then one writer/two uniquely named readers exist; first reader identity is stable and selected engine version renders

Scenario: Truthful feature contract
  Given unsupported options are enabled or xray toggles
  When configuration validates and synthesizes
  Then unsupported settings are rejected; supported tracing changes have observable template effects

```

## Execution

1. Read the complete context, identify owning code and primary documentation, and reproduce each required failure with the highest practical offline fixture. Record the meaningful RED result.
2. Implement the smallest correction and passing success/rejection cases. Update affected setup and migration guidance. Keep one ticket-linked commit per coherent correction through normal hooks.
3. A teammate who did not implement the change reviews it. Root integrates related commits and runs full supported quality plus named regression tests once for the completed batch.
4. Root pushes the full batch to PR52 and drives review, CI, merge and configured source release. Original local evidence retains its actual source identity.
5. Verify the released batch, publish the three typed Validation Journey artifacts, post/read usage and backlinks, adopt a schema2 verdict and close this leaf natively. Roll up parents and clear binding/context only after true terminal completion.

No live AWS or downstream mutation. Normal runtime Node22.23.3/npm10.9.9 and the unchanged locked graph are shared. Preserve unrelated edits; do not reset, clean, stash or bypass hooks. Status: source implemented and targeted verification passed; independent batch review and delivery pending.

## Implementation and local verification

Preserve exact PLACEHOLDER sentinel and the default 16.4 engine. Existing VPC CIDR strings and two-instance identities remain stable. Reject unsupported Shield/DR/custom-widget settings rather than silently accepting decorative values. Empty custom widget defaults preserve DashboardStack built-in metrics. X-Ray only controls application-role trace permissions, with unsupported role-free paths rejected. Retain the starter’s existing 0.5–128 ACU compatibility range and exact supported retention mapping.

Meaningful supervised RED on local #30+#31 foundation failed all three required scenarios: malformed account accepted, duplicate reader construct prevented three-instance synth, and unsupported Shield accepted. Receipts: /tmp/cdkstarter-37-evidence/baseline-regression.log. Focused GREEN passed all 65 configuration/Aurora/IAM cases and typecheck passed on Node22.23.3/npm10.9.9, using the preserved exact original installed graph. Remote CI, merge, release, typed artifacts and native closure remain pending. Source fixtures are fake/offline and do not prove region availability or live connectivity.

The canonical unchanged test:integration route passed all 12 named cases across four suites (adoption3/composition3/database3/configuration3), receipt /tmp/cdkstarter-37-evidence/managed-integration.log. App-owned integration assemblies are removed by afterEach. Normal commit hooks apply formatting, lint and structural rules; no quality threshold, timeout or runner changes.

## Reserved-role review follow-up

PR52 review comment4179109232 is independently confirmed against the AWS Aurora predefined-role documentation: `rdsadmin` is an internal role whose privileges cannot be modified. The shared runtime predicate and operator bootstrap now reject that exact role before IAM grants or credential resolution. Existing `pg_`/`rds_` checks cover the other documented fixed Aurora PostgreSQL roles; `postgres` is a configurable master username, so no unsupported blanket name restriction is added.

Isolated follow-up foundation: 57a76cb4cb0689505e1ffec7fb737220ca29c165, branch codex/37-rdsadmin-fix. Managed RED reproduced five failures: application/read-only early configuration rejection, IAM rejection and application/read-only bootstrap rejection. Managed GREEN passed all 47 cases across the same three owning suites, including an explicit manipulated-secret rejection and existing successful IAM/bootstrap cases. Private receipts: /tmp/cdkstarter-37-rdsadmin-evidence/{red,green,typecheck}.log. No AWS calls, secret retrieval or live SQL execution occurred. Root owns independent review, integration and batch delivery.
