# Your Project

## LLM Wiki

This project has a git-native LLM Wiki at `wiki/`, maintained by the `lisa-wiki` kernel.

- **Answer questions from the wiki first:** run `/query "<question>"` (Codex: `$lisa-wiki-query`) before ad-hoc code search or web lookups.
- **Add durable knowledge:** `/ingest <url|file|prompt>` (Codex: `$lisa-wiki-ingest`); a bare `/ingest` runs a full ingest across all enabled non-external-write sources.
- **Orientation:** [wiki/start-here.md](wiki/start-here.md) · **Rules:** [wiki/schema/llm-wiki-contract.md](wiki/schema/llm-wiki-contract.md) · **Map:** [wiki/index.md](wiki/index.md).
