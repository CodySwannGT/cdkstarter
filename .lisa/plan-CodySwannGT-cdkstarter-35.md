# [cdkstarter] Honor configured VPC gateway and interface endpoints

Work item: CodySwannGT/cdkstarter#35. Branch: codex/35-correctness-batch. Production target: main. Shared PR:52. Local foundation: 8755835626432e0b12b0e25b30b7cf1512c09b41, containing #30; released ancestor e706d113. Full ignored context: /tmp/cdkstarter-35-implementation/.lisa/work-item-context.md; SHA256 7ae51fd8ea9af9220e8b34e91be5025b086de6b764b462782f946029f49674d3.

## Acceptance Criteria

```gherkin
Scenario: Gateway endpoints
  Given default S3/DynamoDB endpoints are configured
  When the offline environment synthesizes
  Then both gateway endpoint resources exist with private route-table associations

Scenario: Optional interfaces
  Given interface endpoints are absent, then explicitly configured
  When the templates are compared
  Then none appear by default; configured supported interfaces appear with bounded ingress and private DNS; unknown services fail validation

```

## Execution

1. Read the complete context, identify owning code and primary documentation, and reproduce each required failure with the highest practical offline fixture. Record the meaningful RED result.
2. Implement the smallest correction and passing success/rejection cases. Update affected setup and migration guidance. Keep one ticket-linked commit per coherent correction through normal hooks.
3. A teammate who did not implement the change reviews it. Root integrates related commits and runs full supported quality plus named regression tests once for the completed batch.
4. Root pushes the full batch to PR52 and drives review, CI, merge and configured source release. Original local evidence retains its actual source identity.
5. Verify the released batch, publish the three typed Validation Journey artifacts, post/read usage and backlinks, adopt a schema2 verdict and close this leaf natively. Roll up parents and clear binding/context only after true terminal completion.

No live AWS or downstream mutation. Normal runtime Node22.23.3/npm10.9.9 and the unchanged locked graph are shared. Preserve unrelated edits; do not reset, clean, stash or bypass hooks. Status: implementation complete; independent review and batch delivery pending.

## Local implementation evidence

Full678232-byte context SHA7ae51fd8ea9af9220e8b34e91be5025b086de6b764b462782f946029f49674d3 was read; primary accepted-comment5960674251 and claim5982698525 retain their obligations. Primary AWS gateway/interface documentation confirms private route associations, one interface subnet per AZ, DNS and security-group requirements. Baseline875583 focused8 cases failed; the same final fixture passes, together with ten existing VPC tests (18 total). Typecheck/scoped ESLint pass. Initial Object.hasOwn compilation failure retained; equivalent ES2019-safe own-property checks preserve prototype-key rejection. Logs under `/tmp/cdkstarter-35-evidence`; root owns full batch gates, independent review/final CLI/template proof, CI/release and three typed artifact publication/closeout. No AWS/downstream claim.
