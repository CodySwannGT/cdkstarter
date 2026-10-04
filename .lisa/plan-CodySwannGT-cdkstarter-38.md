# [cdkstarter] Cover app composition and observability runtime handlers

Work item: CodySwannGT/cdkstarter#38. Target main. Bound worktree /tmp/cdkstarter-38-implementation, branch codex/38-quality-batch. Code foundation 57a76cb4cb0689505e1ffec7fb737220ca29c165; currently released ancestor e706d113cf5c2a147570d02c334272ad316ca372. Full ignored context .lisa/work-item-context.md; verified claim and native binding before this plan/roster.

## Acceptance Criteria


```gherkin
Scenario: Entrypoint fixtures
  Given configured fake accounts for the three supported modes
  When the new app integration suite runs
  Then all cases collect real tests, synthesize nonzero expected templates, and fail if their expected feature invariants are removed

Scenario: Runtime handler errors
  Given valid/malformed CloudWatch and backup events plus mocked transport failure
  When handler suites and coverage run
  Then success and failure behavior are asserted, runtime JS/bin/config are included, and collection-zero is never accepted as test evidence

```


## Execution

1. Read full canonical context and prior bounded research. Prove required baseline regressions with fake accounts/no-lookups or mocked transports; retain exact source identity and meaningful passing controls.
2. Implement the smallest vertical slice and named success/rejection regressions. Preserve managed Lisa files and quality thresholds. Commit coherent ticket-linked changes through normal hooks.
3. Root and a non-author review source/security contracts. Integrate tickets38-41 in one PR with small commits. Full quality/native gates run on the completed batch, with targeted checks during implementation.
4. Reconcile PR52 released ancestry, then drive review/CI/ordinary merge and configured source release. Re-run named offline verification at actual released source, publish three shared typed artifacts and post/read canonical usage/backlinks.
5. Root semantically adopts per-leaf verification and closes natively only after the complete lifecycle, then updates parents. No AWS deployment or downstream adoption claims.

Ownership: runtime tests, actual app execution coverage, minimal handler error fixes and supported host test overrides. Earlier#29 already includes bin/config/resources in coverage; preserve that work. Execute a real bounded mutation smoke against util/lib source without weakening managed thresholds or enabling a decorative disabled gate.
