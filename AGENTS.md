# cdkstarter — Agent Notes

Repo-specific traps and conventions for agents working in this repo.

_None recorded yet._

<!-- LISA_HOST_RULES_START -->
## Host Rules

Read every file under `.agents/rules/`. Make operator-requested rule edits directly; no learning-promotion step is needed.
Also read `.claude/rules/PROJECT_RULES.md`, unless your runtime auto-loads it —
Claude Code auto-loads `.claude/rules/`.
<!-- LISA_HOST_RULES_END -->

<!-- LISA_PROJECT_LEARNINGS_START -->
Antigravity startup bridge: before normal task work, resolve the canonical
machine-managed project-learnings ledger from `.lisa.config.json` (the
optional `learnings.file` override, else the default `.lisa/PROJECT_LEARNINGS.md`).
Consume it only through the Lisa learnings contract's bounded projection — never
read the raw ledger wholesale into context. If it is absent, continue silently.
If it is malformed, warn once and ignore it.

Resolved path for this project: `.lisa/PROJECT_LEARNINGS.md`.

- If you can't reach something you need, such as a repository, a secret, an API, or a connector, say exactly what's missing in your first message and stop. Don't substitute, mock, or guess.
If the missing access is discovered after work begins, say exactly what's missing in your next message and stop.
<!-- LISA_PROJECT_LEARNINGS_END -->
