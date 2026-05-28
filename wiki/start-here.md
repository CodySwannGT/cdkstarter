# Start here — Cdkstarter

## Purpose
The durable knowledge base for the Cdkstarter AWS CDK infrastructure monorepo — the cloud foundation (auth, database, network, observability, and support stacks deployed across staged environments) that the Cdkstarter product runs on. It captures the architecture, design decisions, domain concepts, conventions, and operational playbooks behind the infrastructure so that engineers and agents can understand and safely change it from a single cited source of truth rather than re-deriving everything from the CDK code each time.

## What this is
A git-native LLM Wiki owned by **gunnertech** and maintained by the `lisa-wiki` kernel. It is the
durable home for this project's knowledge (and documentation). Raw sources are preserved under
`wiki/sources/`; distilled knowledge lives in the category pages; the rules are in
`wiki/schema/llm-wiki-contract.md`.

## How to use it
- **New here?** Run `/onboard-me` (Codex: `$lisa-wiki-onboard-me`) for a guided tour + sample questions.
- **Find/answer something:** `/query "<question>"` — cited answers from the wiki.
- **Add knowledge:** `/ingest <url|file|prompt>` (Codex: `$lisa-wiki-ingest`), or `/ingest` with no
  argument for a full ingest across all enabled non-external-write sources (external-write sources
  require explicit intent).
- **Browse:** [index.md](index.md).
- **Check health:** `/lint`.

## Map
Synthesis categories: concepts, entities, decisions, architecture, requirements, playbooks, open-questions, projects, sales, marketing, finance, customers, people, legal.
Sources: `wiki/sources/` · State: `wiki/state/` · Contract:
`wiki/schema/llm-wiki-contract.md` · Log: `wiki/log.md`.
