---
type: concept
created: 2026-05-28
updated: 2026-05-28
related: [architecture/infrastructure-overview.md]
sources: [sources/git/2026-05-28-your-project-infrastructure-git.md]
sensitivity: internal
---

# CDK Stage Model

This project organizes infrastructure using AWS CDK **stages** rather than flat top-level stacks. A
stage is a deployable unit that groups related stacks; the app instantiates one set of stages per
configured environment.

## Why stages
- **Per-environment isolation.** Each environment (e.g. dev, staging, production) gets its own stage
  instances, driven by `config/environments.ts`.
- **Domain grouping.** Stacks are grouped by concern (network, app/data+auth, observability,
  support) so changes stay scoped to a domain.
- **Synth-without-deploy.** The app can synthesize with `PLACEHOLDER` account IDs; only environments
  with valid account IDs are loaded as deployable (`util/config-loader.ts` →
  `loadDeployableEnvironments`).

## Ordering
Within an environment the stages compose in dependency order: Network → App (Aurora, Valkey,
Cognito, IAM) → Observability → Support.

Source: wiki/sources/git/2026-05-28-your-project-infrastructure-git.md
