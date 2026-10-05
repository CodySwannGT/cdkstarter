# Coordinated dependency refresh

The October 4, 2026 review for [#39](https://github.com/CodySwannGT/cdkstarter/issues/39) retains CDK 2.272.0 and Amplify 2.272.0-alpha.0, updates the CLI floor to 2.1144.0 and constructs to 10.8.1, and refreshes compatible dependency floors within TypeScript 6, ESLint 9, Knip 5, Husky 8 and Vitest 4. OIDC remains exact 5.2.0. Registry versions and peer metadata were checked at implementation time.

The paired oxlint and eslint-plugin-oxlint versions are pinned at 1.73.0. That is the newest reviewed pair compatible with Lisa's retained oxlint-tsgolint 0.24.0. Newer oxlint releases require a newer type-aware checker; raising that family without coordinating Lisa would create an invalid peer graph.

Version-qualified npm overrides update minimatch 10.x and qs 6.x without changing their parents' major requirements. The old unbounded js-yaml override could select 5.x for callers requiring 4.x; its replacement applies only to js-yaml 4.x at the patched 4.3.2 floor. The supported dollar-reference aliases for CDK, esbuild and Vite remain intact. No bundled CDK files are patched manually.

The portable lock was generated normally with task-private npm 11.21.0 after npm 10.9.9's clean resolver repeatedly failed on the existing supported `$esbuild` alias. A fresh documented Node 22.23.3/npm 10.9.9 `npm ci` then succeeded with normal lifecycle scripts, and the complete installed `npm ls --all` graph passed. No force, legacy-peer-deps, engine override or disabled hook was used.

## Audit accounting

Fresh full-graph `npm audit --json` exits 1 with eight high package findings and no moderate findings. Fresh `npm audit --omit=dev --json` exits 1 with one high package finding. These are raw findings, not a clean audit. Both scopes contain only the four previously accepted advisory IDs: the three CDK-bundled brace-expansion advisories and GHSA-vfj7-8cjw-p6xm in root braces 3.0.3.

The existing qualified filter selects high/critical package records, includes every object advisory in their `via` arrays (including lower-severity entries), deduplicates GHSA IDs and removes the merged managed/local ID dispositions. Both scopes have zero unresolved IDs under that policy. Eleven obsolete local exclusions were removed only after checking their absence from the actual raw graph. The four remaining records retain their original owner, installed-path scope, trust-boundary limits and October 16 manual review deadline. That date requires follow-up and does not defer this refresh or enforce automatic expiry.

See [CDK bundled advisories](cdk-bundled-advisories.md) and [accepted braces exposure](starter-braces-advisory.md). Their earlier source/template counts are historical. The root braces risk remains reachable through pull-request-controlled Knip/Vite glob inputs; it has not been relabeled a false positive or made safe by a successful filtered check. The new graph still needs reassessment when those inputs, callers, packages or asset boundaries change.

## Verification

Run the supported installed-graph and real offline synthesis regressions:

```sh
npm run test:integration -- test/integration/starter-dependencies.integration.test.ts
npm run test:unit -- test/starter-cdk-security.test.ts
npm ls --all
npm audit --json
npm audit --omit=dev --json
```

The dependency suite executes the installed CDK CLI with the actual application entrypoint in direct, pipeline and frontend-only modes, fake account IDs and no lookups. It also rejects deliberately mismatched alpha/CDK peers and a stale CLI through in-memory controls. Native child processes disable Node's optional disk compile cache and use a disposable `CDK_HOME`, so cleanup cannot race an exit-time cache write and CDK state stays inside each owned output. The Lisa lease and scratch-leak checks remain enabled.

Published Lisa template adoption and final native template/asset comparison are recorded separately against the final released graph. An initial official Lisa 4.69.3 apply correctly refused its obsolete forced OIDC 2.x template against this starter's exact 5.2.0 pin. The owning upstream correction is [Lisa #4343](https://github.com/CodySwannGT/lisa/issues/4343), which preserves explicit host OIDC versions and defaults new hosts to compatible 5.2.0. Consume its public release through the official updater; do not lower OIDC or patch managed files to bypass that refusal.

The final aggregate adopts exact public Lisa 4.69.4 after its upstream correction completed, with source-only reusable workflow callers pinned to release `694f06d31be324bfc6675bb818d73f77904afd89`. Normal npm11.21.0 resolution produced a portable lock preserving starter version0.0.2, its absent executable advertisement and generated-project smoke command. Documented npm10.9.9 clean installation and the full peer inventory passed. Fresh raw audit exits/counts remain1/8high for the full graph and1/1high for production; the qualified filter still has zero unresolved IDs and the same four accepted dispositions. The genuine dependency, adoption and security suites passed15cases before the official project Codex apply. Final generator/template evidence follows separately.

The fresh aggregate graph exposed #43's test-owned YAML import relying on undeclared transitive typings. The actual source typecheck and normal commit hook refused it. Declare `js-yaml`4.3.2 and matching `@types/js-yaml`4.0.9 directly as development dependencies; no ambient `any` stub or source43 change is used. Public registry latest js-yaml is5.x, so retain the supported4.x family deliberately. The original failure and normal clean-install retry are preserved as evidence.
