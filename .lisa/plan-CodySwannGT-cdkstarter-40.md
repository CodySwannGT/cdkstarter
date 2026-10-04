# [cdkstarter] Guard CloudFront WAF edge region and document origin enforcement

Work item: CodySwannGT/cdkstarter#40. Target main. Bound worktree /tmp/cdkstarter-40-implementation, branch codex/40-quality-batch. Code foundation 57a76cb4cb0689505e1ffec7fb737220ca29c165; currently released ancestor e706d113cf5c2a147570d02c334272ad316ca372. Full ignored context .lisa/work-item-context.md; verified claim and native binding before this plan/roster.

## Acceptance Criteria

```gherkin
Scenario: Unsupported edge region
  Given CloudFront WAF is enabled outside us-east-1
  When configuration is validated
  Then deployment fails early with a region requirement; valid edge-region fixtures synthesize

Scenario: Accurate runbook
  Given an operator follows edge setup guidance
  When the origin enforcement section is read
  Then it distinguishes WAF coverage on CloudFront from direct-origin traffic and names backend verification requirements

```

## Execution

1. Read full canonical context and prior bounded research. Prove required baseline regressions with fake accounts/no-lookups or mocked transports; retain exact source identity and meaningful passing controls.
2. Implement the smallest vertical slice and named success/rejection regressions. Preserve managed Lisa files and quality thresholds. Commit coherent ticket-linked changes through normal hooks.
3. Root and a non-author review source/security contracts. Integrate tickets38-41 in one PR with small commits. Full quality/native gates run on the completed batch, with targeted checks during implementation.
4. Reconcile PR52 released ancestry, then drive review/CI/ordinary merge and configured source release. Re-run named offline verification at actual released source, publish three shared typed artifacts and post/read canonical usage/backlinks.
5. Root semantically adopts per-leaf verification and closes natively only after the complete lifecycle, then updates parents. No AWS deployment or downstream adoption claims.

Ownership: edge-region validation, owning CDN construct defensive guard, named integration tests and setup guidance. Guard effective primary-domain CloudFront/WAF activation even when the decorative flag is false; preserve no-edge regional behavior and supported us-east-1 IDs. Document direct-origin verification contract without inventing backend implementation.

## Local implementation checkpoint

The full ignored context is 1,055,256 bytes, SHA256 b8b95300fcad5f2f6422b0be2b852c584f31ba7f89eb30a656b5e4a4520c72ec. Primary comments 5960677139 and 5983816532 are CodySwannGT/User/292923: accepted leaf/dependency contract and managed claim, respectively. Historical wait direction is superseded only for implementation timing by the captured batching authorization; release/closeout obligations remain pending.

The issue's exact mandated path is `test/integration/starter-edge.integration.test.ts`. The earlier research's proposed path is corrected by the full accepted body. The baseline has five intended failures and six passing controls; the same assertions pass 11/11 with the two region guards. Supported production/staging CDN templates are byte-identical to baseline (eight resources each); no IAM, resource identity, output or origin-header behavior changes. Managed focused execution with existing CDN/resolver/configuration suites passes 69 tests across four files. Typecheck and scoped source ESLint pass. Default ESLint excludes integration fixtures; this is disclosed rather than claimed as lint coverage.

The runbook explains the concrete X-Origin-Verify default-deny contract, all-origin endpoint checks and secret handling. No header, secret resource or backend implementation is installed. An offline synth does not establish live protection.

Current local work is implemented; independent review, final combined quality/native checks, CI, review, merge, configured source release, published typed artifacts, usage/backlinks and canonical closeout remain pending. Raw logs and template comparisons are private under `/tmp/cdkstarter-40-evidence/implementation`. No AWS or downstream operation is authorized.
