# CDK bundled advisory disposition

Reviewed on 2026-10-02 for [#48](https://github.com/CodySwannGT/cdkstarter/issues/48). This is a bounded dependency and source review, with offline synthesis. It does not attest to deployed AWS resources or the entire dependency graph. The full dependency refresh and cleanup remain in [#39](https://github.com/CodySwannGT/cdkstarter/issues/39).

## Historical scope and combined delivery

The evidence below records the original #48-only source commit `fbf50b2ae4ec461b55ac1058dfa0d5a0bab5f89c`. Its Node 22.21.1 commands, installed-copy counts, raw audit totals and integration collection limitation describe that historical artifact.

The combined [#29](https://github.com/CodySwannGT/cdkstarter/issues/29)/#48 delivery separately adopts Lisa 4.69.1 and Node 22.23.3, preserves the exact CDK security pins and three residual dispositions, and restores a populated integration command. Fresh audit observations report 10 high/3 moderate findings in the full graph and one high production finding; documented policy filters pass while those raw findings remain unresolved. The separate accepted `braces` risk is recorded in [starter braces advisory acceptance](starter-braces-advisory.md).

Completion requires fresh final-head native fixtures, installed-occurrence/caller/asset checks and required CI evidence in each issue's own artifact manifest. Historical proof below must not be presented as proof of that changed combined artifact. Current offline commands use the pinned Node 22.23.3 environment:

```sh
npm run test:unit -- test/starter-cdk-security.test.ts
npm run test:integration
npm run test:cov
npm audit --json
npm audit --omit=dev --json
npm ls aws-cdk-lib @aws-cdk/aws-amplify-alpha aws-cdk constructs brace-expansion
```

## Update and compatibility

The starter pins `aws-cdk-lib` to `2.272.0` and `@aws-cdk/aws-amplify-alpha` to `2.272.0-alpha.0`. Both declare `constructs ^10.5.0`. The retained installed `constructs 10.6.0` satisfies those peers. The retained CDK CLI `2.1132.0` synthesizes both real-entrypoint fixtures successfully under the required Node `22.21.1`. No CLI, constructs, Lisa or unrelated direct dependency refresh was necessary.

The CDK tarball's own `node_modules/brace-expansion` changes from `5.0.8` to `5.0.9`. This fixes [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895), which has no exclusion. The new bundle still has three newer advisories. Calling CDK `2.272.0` fully patched would be incorrect.

The inherited global `brace-expansion >=5.0.9` override forced a newer major into dependents requiring 1.x and 2.x. Version-qualified leaf pins now appear consistently in `resolutions` and `overrides`, without replacing or downgrading parent packages:

| Installed dependent            | Declared brace-expansion range | Compatible leaf |
| ------------------------------ | ------------------------------ | --------------- |
| minimatch 3.1.5                | ^1.1.7                         | 1.1.21          |
| minimatch 9.0.9                | ^2.0.2                         | 2.1.7           |
| nonbundled minimatch 10.2.5    | ^5.0.5                         | 5.0.12          |
| CDK's bundled minimatch 10.2.5 | ^5.0.5                         | bundled 5.0.9   |

These patched leaf versions are available from the [npm registry](https://registry.npmjs.org/brace-expansion) and preserve the dependent ranges. A clean npm install retains CDK's vendored 5.0.9 despite the 5.x leaf override. An override that fixes external copies therefore does not fix this bundle. No installed vendor files are patched manually.

## Remaining exact exceptions

`audit.ignore.local.json` contains three new exact advisory entries for the sole affected installed occurrence, `node_modules/aws-cdk-lib/node_modules/brace-expansion` at `5.0.9`. Each entry records its trigger, scope, exposure assessment, owner, expiry and tracking issue. All six installed brace-expansion copies were enumerated. The other five copies are compatible patched versions, and both raw audit scopes identify only the bundled path for these advisories.

| Advisory                                                                 | Trigger                                                                      | Patched 5.x version |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------- |
| [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) | Repeated rewrite scanning of crafted `{a},b}` patterns stalls the event loop | 5.0.12              |
| [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | Deeply nested brace groups exhaust the call stack                            | 5.0.11              |
| [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | Nested comma-list parsing exhausts the call stack                            | 5.0.10              |

The installed parser retains each vulnerable path. Its expansion limits and minimatch's pattern-length limit do **not** justify the exceptions. The assessment instead follows every installed CDK caller and the source of its pattern argument:

- `aws-cdk-lib/core/lib/stack.js`: `Stack.bundlingRequired` matches construct paths against CLI-provided bundling context, with the static default `**`. This is developer-controlled build context. The test subprocess strips inherited operator CDK context before the CLI generates its context.
- `aws-cdk-lib/core/lib/fs/ignore.js`: `GlobIgnoreStrategy` matches asset filenames against developer-authored exclusion patterns. Filenames are the match subject, not the pattern being brace-expanded. The starter's two explicit `Code.fromAsset` calls have no custom exclusions. CDK's generated custom resource assets use CDK-authored options.
- `aws-cdk-lib/core/lib/mixins/selectors.js`: construct selectors accept developer-authored ID/path patterns. The starter does not use these selectors.

A search across the installed CDK JavaScript found these three callers. No starter request, SNS/EventBridge payload, fetched URL, database value or other application input supplies a pattern to them. Trusted developer source and build context are the boundary of this assessment. A service that accepts untrusted synthesis settings would need a new assessment.

## Actual asset review

The pipeline fixture generates three asset directories containing four JavaScript files: the log-retention handler, the AWS SDK custom resource handler, and the OIDC handler plus its framework entrypoint. Each actual asset file was inspected and its imports enumerated. None includes CDK, minimatch or brace-expansion. The SDK handler's compressed payload decodes to JSON parameter-coercion data, with no vulnerable module or parser implementation. Its dynamic imports are AWS SDK service packages selected by developer-authored custom resource calls, not the CDK dependency bundle. Its existing latest-SDK download behavior is unchanged and is not an assertion about every future downloaded dependency.

The frontend-only fixture has no Lambda assets. The optional `resources/observability/canary/index.js` and `resources/observability/sentry-forwarder/index.js` handlers were also inspected. They use platform APIs without dependency imports. Their URLs and event payloads do not feed glob patterns. The reviewed vulnerable bundled copy is not included in these runtime assets.

## Regression and audit evidence

The same five-case `test/starter-cdk-security.test.ts` suite ran before and after the update. Before the update, the exact target-version and actual bundled-version assertions failed as intended, while peer-mismatch rejection and both actual CLI fixture modes passed. After the update all five cases pass. The mismatch case changes only in-memory metadata and rejects a deliberately incorrect alpha family.

Run the focused suite and its required coverage lane with the pinned runtime:

```sh
mise exec node@22.21.1 -- npm run test:unit -- test/starter-cdk-security.test.ts
mise exec node@22.21.1 -- npm run test:cov
mise exec node@22.21.1 -- npm audit --json
mise exec node@22.21.1 -- npm audit --omit=dev --json
mise exec node@22.21.1 -- npm ls aws-cdk-lib @aws-cdk/aws-amplify-alpha aws-cdk constructs brace-expansion
```

The CLI subprocess uses the installed executable, the real `bin/app.ts`, `--no-lookups`, nonexistent AWS credential/config paths and disabled instance metadata. Pipeline synthesis produces 14 nonempty templates with 140 resources. Frontend-only synthesis produces one nonempty template with four resources. Neither assembly has missing context. The named suite is included by the existing CDK Vitest configuration and runs in the required unit/coverage lane through `test:cov`. It is not opt-in.

The before/after fixture comparison preserves every physical stack name, logical resource ID, IAM policy, import/export, pipeline property and default-off feature. The only differences in all 15 templates are `CDKMetadata.Properties.Analytics`: decoding them shows the CDK library version changed from 2.263.0 to 2.272.0. The four pipeline asset files are byte-identical. No infrastructure migration is introduced by this update.

Raw `npm audit --json` still exits 1 with 15 vulnerable packages (five moderate and ten high), including unrelated findings owned by the full refresh. Raw `npm audit --omit=dev --json` still exits 1 with one high package whose `via` list includes the three residual bundled advisories. Exact exclusions affect the existing policy filter, not the raw audit report. npm's `fixAvailable: true` does not establish that the installed CDK bundle can be replaced by a compatible leaf override. `npm ls` passes after the raw audits.

The unchanged production pre-push filter collects advisory IDs from high/critical package records, including their moderate `via` entries. All three residual IDs therefore need their own evaluated entry. No audit threshold or hook changes are made. Existing exclusions for other packages are not revalidated by this review.

The separate direct/no-pipeline fixture still exposes the existing cross-Stage `CannotDependency` failure, owned by [#30](https://github.com/CodySwannGT/cdkstarter/issues/30). The existing `test:integration` script targets `tests/integration` and can collect zero tests. That runner gap remains separate work in [#38](https://github.com/CodySwannGT/cdkstarter/issues/38) and is not evidence for this update.

## Expiry and removal

Owner: **CodySwannGT**. Expiry: **2026-10-16T23:59:59Z**. Follow-up: [#39](https://github.com/CodySwannGT/cdkstarter/issues/39).

Before expiry, repeat the available-version, clean-install, all-occurrence, caller and asset checks. Remove these exclusions once a compatible CDK tarball ships the fixed bundle. Reassess immediately if dependency versions, glob/context sources, selectors, asset packaging or trust boundaries change. If an affected occurrence gains an untrusted input path, the current non-exposure justification no longer applies. The existing filter does not enforce expiry automatically, so the owner must remove or reassess the entries by that date.
