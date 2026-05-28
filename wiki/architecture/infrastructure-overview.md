---
type: architecture
created: 2026-05-28
updated: 2026-05-28
related: [concepts/cdk-stage-model.md]
sources: [sources/git/2026-05-28-your-project-infrastructure-git.md]
sensitivity: internal
---

# Your Project — Architecture Overview

The Your Project infrastructure is an AWS CDK application (TypeScript) that provisions the cloud
foundation for the Your Project product. The CDK app entry point is `bin/infrastructure.ts`, run via
`npx tsx bin/infrastructure.ts` (see `cdk.json`).

## Stage model
For each configured environment the app composes CDK **stages** (in `lib/stages/`), each grouping
related stacks:

1. **NetworkStage** (`network-stage.ts`) — VPC and security groups.
2. **AppStage** (`app-stage.ts`) — the application data and auth plane (Aurora, Valkey, Cognito, IAM).
3. **ObservabilityStage** (`observability-stage.ts`) — SNS topics, alarms, and a dashboard.
4. **SupportStage** (`support-stage.ts`) — DNS, deployment pipeline, and trust policies.

## Stacks
Stacks live under `lib/stacks/<domain>/`:

| Domain | Stacks |
|---|---|
| network | `vpc-stack.ts`, `security-groups-stack.ts` |
| database | `aurora-stack.ts`, `valkey-stack.ts` |
| auth | `cognito-stack.ts`, `iam-stack.ts` |
| observability | `sns-stack.ts`, `aurora-alarms-stack.ts`, `valkey-alarms-stack.ts`, `dashboard-stack.ts` |
| support | `dns-stack.ts`, `pipeline-stack.ts`, `trust-policy-stack.ts` |

## Configuration & environment filtering
Configuration is loaded from TypeScript files under `config/` (`environments.ts`, `domains.ts`,
`observability.ts`). `validateConfiguration()` fails fast on configuration errors (e.g. duplicate
CIDRs, invalid primary domain). Only environments with valid (non-`PLACEHOLDER`) account IDs are
deployed — so the app can `synth` with placeholder values while deploying only configured
environments (`util/config-loader.ts`).

## Toolchain
TypeScript with `tsc --noEmit` for typechecking, Vitest for tests (unit + integration), oxlint +
ESLint for linting, knip for dead-code detection, ast-grep for structural rules, and
`@codyswann/lisa` for governance/templates. CDK tests were migrated from Jest to Vitest (PR #78,
2026-03-19). The package manager was switched from npm to bun (2026-01-19) and later realigned.

Source: wiki/sources/git/2026-05-28-your-project-infrastructure-git.md
