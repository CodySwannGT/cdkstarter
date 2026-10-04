# Starter braces advisory acceptance

On 2026-10-04, owner CodySwannGT explicitly accepted the development and CI availability risk from [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) in the reviewed root `node_modules/braces` 3.0.3 occurrence. The reviewed registry observations found no patched release. This is an affected dependency, not a false positive.

Knip passes package manifest entry/bin patterns through fast-glob and micromatch into braces. Vite also parses `import.meta.glob` source patterns. Pull requests can change these inputs, so malicious patterns can exhaust resources in developer or CI quality processes. Development-only installation does not remove that exposure.

The local exclusion records this acceptance while [issue #39](https://github.com/CodySwannGT/cdkstarter/issues/39) tracks dependency follow-up. The manual review deadline is **2026-10-16T23:59:59Z**. The loader does not enforce expiry: it matches the GHSA identifier only, without enforcing package, installed path, owner or review date. Raw audits can still report the vulnerability when the qualified filter passes.

Reassess or remove the acceptance when the dependency graph, callers, manifest/source glob inputs or trust boundary changes. Remove it when a compatible patch or tested caller fix becomes available. Copied or forked starters must independently reassess the acceptance because a copied exclusion would still match the advisory ID.

This acceptance is separate from the existing CDK bundled `brace-expansion` dispositions in [CDK bundled advisories](cdk-bundled-advisories.md). Those exceptions remain unchanged.
