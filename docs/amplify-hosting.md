# Optional Amplify hosting

## Context

The routing, header and notification options preserve existing static hosting
when omitted.
SPA routing, explicit response headers and failed-build notifications are
independent options. This module does not add frontend framework assumptions,
source-map uploads, Sentry connections, or build tools. Caller-provided build
commands retain their exact order. Build-tool defaults are maintained separately.
The new npm defaults require [explicit migration for existing Bun builds](../config/amplify-build-tools/README.md#migrating-existing-bun-builds).

## Goal

Enable only the behavior a consuming frontend needs. Configure the existing
`amplifyHosting` block and enable `features.amplifyHosting` for the stage.
The application and source branch retain their construct/resource identities.

## Changes

```ts
amplifyHosting: {
  owner: "example",
  repository: "frontend",
  branch: "main",
  oauthTokenSecretName: "example/amplify/github-token",
  preBuildCommands: ["npm ci"],
  buildCommands: ["npm run build"],
  artifactBaseDirectory: "dist",
  spaFallback: { enabled: true },
  customRules: [{ source: "/old", target: "/new", status: "301" }],
  customHeaders: [{
    pattern: "/assets/*",
    headers: { "X-Content-Type-Options": "nosniff" },
  }],
  buildFailureNotifications: {
    enabled: true,
    topicArn: "arn:aws:sns:us-east-1:111111111111:frontend-builds",
    branches: ["main"],
  },
}
```

## Implementation

SPA fallback defaults off. When enabled, it appends a `200` rewrite to
`/index.html` after the ordered explicit rules. The pattern excludes known
static extensions including `htm` and `html`, so a real `/auth/callback.html` asset is
served normally. An explicit rule with the same source pattern, destination,
status and no condition suppresses the appended duplicate. Other caller rules
are preserved exactly. Explicit rules work even when SPA fallback is off.

The supported statuses are `200`, `301`, `302`, `404` and `404-200`. Source,
target and optional country condition must be nonempty single-line strings.
Header names must be HTTP token names and values must be single-line strings.
Header YAML is serialized so quoted values and backslashes roundtrip unchanged.
Headers are rendered into Amplify's `CustomHeaders` property for their exact
caller-defined patterns, separate from the build specification. No CSP or
other security policy is selected implicitly. A frontend `customHttp.yml`
can override the app-level headers, as described by
[AWS's header documentation](https://docs.aws.amazon.com/amplify/latest/userguide/setting-custom-headers.html).

Build notifications also default off. Enabling them requires an explicit
standard SNS topic ARN. Branch selection defaults to the configured source
branch, or uses the supplied nonempty list of exact branch names. The rule
matches `aws.amplify` / `Amplify Deployment Status Change`, the synthesized
application ID, selected branches and `jobStatus: FAILED`. Successful builds
and unrelated applications/branches do not match. The complete event is sent
to the supplied topic. No topic, subscription or external HTTP endpoint is
created.

The target uses an EventBridge execution role with only `sns:Publish` on that
one topic ARN. Existing topic policies are not replaced. Current
[AWS authorization documentation](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-use-resource-based.html)
supports this role-based SNS authorization. A cross-account destination needs
its owner to authorize that role. For a customer-managed encrypted topic,
its key owner must grant the required key permissions too. Existing explicit
denies continue to apply. Configure an eligible destination in the app's
region and verify delivery/subscriptions during separately authorized live
consumer adoption.

## Notes

[Amplify service events are best effort](https://docs.aws.amazon.com/eventbridge/latest/ref/events-ref-amplify.html).
This rule is an alert route, not a guarantee that every failure produces a
notification. The offline suite proves rendered configuration, representative
path/event filtering, rejection paths and default-off identity/IAM preservation.
It does not deploy Amplify, call AWS, or prove live SNS delivery. Real static
HTML files still need to exist in the published frontend artifacts.

Run the named regression through the project's managed runner, then execute
the full batch's normal quality and offline synth gates:

```bash
npx lisa-test-run --profile cdk --adapter vitest -- vitest run test/integration/starter-optional-amplify.integration.test.ts
```
