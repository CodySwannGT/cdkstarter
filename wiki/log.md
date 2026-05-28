# Your Project — Log

> Append-only. One row per operation. Operations:
> `INIT, SETUP, INGEST, CREATE, UPDATE, MERGE, DEPRECATE, LINT, QUERY, REBUILD-INDEX`.

| Date | Operation | Target | Notes |
|---|---|---|---|
| 2026-05-27 | SETUP | wiki/ | Initialized Your Project with the lisa-wiki kernel. |
| 2026-05-28 | INGEST | sources/git/ | git connector: 247 commits + 20 merged PRs (HEAD fa3c66d, latest PR #153) → source note. |
| 2026-05-28 | INGEST | sources/roles/ | roles connector: 7 roles / 7 staff pages → source note. |
| 2026-05-28 | CREATE | architecture/infrastructure-overview.md | Synthesized CDK architecture overview from git source note + code. |
| 2026-05-28 | CREATE | concepts/cdk-stage-model.md | Synthesized CDK stage-model concept from git source note + code. |
| 2026-05-28 | REBUILD-INDEX | index.md | Added architecture, concepts, staff, and sources entries. |
