# CloudFront + WAF Edge for the HTTP API

WAFv2 cannot attach to an API Gateway v2 HTTP API, so WAF coverage requires a
CloudFront distribution in front with the WebACL on the distribution. This
starter wires that in so it arrives automatically with the production domain
and cannot be forgotten at launch. It is a complete no-op until a domain is
configured for a stage.

## Trigger

`CdnStack` (`lib/stacks/edge/cdn-stack.ts`) is created for a stage when a
primary-domain mapping exists for it (see `config/domains.ts`) AND either:

- the stage is **production** (automatic — not flag-gated), or
- a non-prod stage set **`features.waf: true`** (opt-in, to rehearse the
  ruleset on e.g. staging before launch).

With no domain configured, nothing is created. `validateConfiguration` rejects
a non-prod `waf: true` with no domain so the flag can't rot into a decorative
no-op. The trigger + host derivation live in `util/cdn.ts`.

## Region requirement

An effective edge requires **`us-east-1`**. Configuration validation rejects
other regions before stage construction, including production with a primary
domain and `features.waf: false`. Direct `CdnStack` callers must also supply
`us-east-1` explicitly or inherit it from their stage; an unresolved region is
rejected before edge resources are created.

This composition colocates the CloudFront viewer certificate, CLOUDFRONT
WebACL and regional API origin. It does not create a separate edge-region
stack. Regional environments without an effective edge remain usable elsewhere:
nonproduction with `waf: false`, or production without a usable domain mapping.
The nonproduction flag remains opt-in; production domain activation remains
automatic. See the [AWS WebACL scope requirement](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-wafv2-webacl.html).

## What it creates

- A CLOUDFRONT-scope **WAF WebACL** (us-east-1): a per-IP rate-based rule plus
  the AWS managed groups `Common`, `KnownBadInputs`, and `AmazonIpReputation`.
  `wafOptions.countOnly` puts every rule in Count mode for rehearsal;
  `wafOptions.rateLimitPerFiveMinutes` tunes the rate rule (default 2000).
- A **CloudFront distribution** with the WebACL attached, caching disabled and
  all viewer headers/methods forwarded (so an HTTP/GraphQL API's auth headers
  and POST bodies pass through), redirecting viewers to HTTPS.
- A stable **regional API Gateway custom domain** as the CloudFront origin. The
  application (deployed separately) attaches its HTTP API to this domain via an
  `ApiMapping`, reading the domain name from the SSM parameter
  `{apiContractPrefix}/api/custom-domain-name` (default prefix `/app/{stage}`).
- A **per-stage public hosted zone** for the API subdomain plus the public and
  origin alias records, and stack outputs (public host, distribution domain,
  WebACL ARN).

## Host derivation

- A `subdomain` mapping is served verbatim (`sub.domain`).
- A production `useApex` mapping is served at a dedicated **`api.<domain>`**
  host — the apex stays the app/marketing surface and cannot be delegated to a
  stage account.

## Activation runbook (when domains are configured)

1. **Configure the domain** in `config/domains.ts` (per-stage mapping) and set
   the stage region to `us-east-1`. For a
   non-prod rehearsal also set `features.waf: true` (and optionally
   `wafOptions.countOnly: true`).
2. **Delegate the API subdomain to the stage account.** `CdnStack` creates a
   per-stage public hosted zone for its API host; add the matching **NS
   delegation record** in the primary/DNS-account zone pointing at that stage
   zone's name servers, so the ACM certificate can DNS-validate. Until this
   exists the certificate stays PENDING_VALIDATION — do it before/with enabling
   the stage.
3. **Deploy the stage.** The zone, cert, WebACL, regional origin domain, and
   distribution come up. Nothing serves traffic yet.
4. **Map the application's HTTP API onto the origin.** Read
   `{apiContractPrefix}/api/custom-domain-name` and add an `ApiMapping` from the
   HTTP API's `$default` stage onto that domain, then deploy the app.
5. **Rehearse WAF in Count mode** (staging). Exercise real traffic and inspect
   the WebACL sampled requests / CloudWatch metrics for false positives —
   watch the AWS Common group's **`SizeRestrictions_BODY`** (8 KB body cap)
   against large POST/GraphQL bodies. Flip to Block only when Count is clean.
6. **Cut over DNS** and verify end-to-end (client → public host → CloudFront →
   origin → API).
7. **Close the origin-bypass gap** by implementing and verifying the backend
   contract below. Ship the origin header and backend validator together.

## Origin enforcement contract (backend adoption required)

The starter installs **no origin authentication header or backend validator**.
The origin custom domain and any default API endpoint remain directly reachable.
WAF inspects requests passing through CloudFront; requests sent straight to the
origin bypass that inspection. Offline synth and a region check do not prove
origin enforcement or live protection.

The consuming backend owner must implement this default-deny contract:

- Generate an unpredictable shared secret, distribute it through Secrets
  Manager or SSM **SecureString**, and configure CloudFront's `HttpOrigin`
  `customHeaders` with **`X-Origin-Verify`**. There is no starter secret default.
- Validate that header before business work on every route, including public
  routes. Missing, empty, incorrect or repeated values, or a missing/unavailable
  expected secret, must fail closed with **403**. Handle case-insensitive header
  names and reject duplicates rather than accepting the first value.
- Keep application authentication and authorization in place. The shared header
  is an origin marker, not user authentication or cryptographic proof of a
  distribution's identity.
- Restrict distribution-configuration access and redact the header from logs
  and traces. Encrypted secret storage does not make a configured CloudFront
  header unreadable to principals who can read that configuration.

CloudFront overwrites a viewer-supplied value for a configured origin header.
The backend must still check the resulting value. See [AWS custom origin
headers](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/add-origin-custom-headers.html).

Before claiming enforcement, the backend owner must verify live that:

1. Requests to the origin custom domain without the marker, with a wrong marker,
   or with duplicate markers return 403 before route work.
2. Default `execute-api` and alternative endpoints are disabled when unnecessary
   or enforce the same check. No alternate route bypasses it.
3. Valid CloudFront traffic reaches intended routes while application
   authorization still applies; a viewer-supplied wrong marker is overwritten.
4. Missing configuration or secret-fetch failure denies requests, and coordinated
   rotation retires the old value after the transition.

Consumers own those changes and live positive/negative checks. This starter
source change adds neither secret plumbing nor a backend implementation.

## Notes

- The starter ships PLACEHOLDER account ids, so nothing deploys until real
  accounts + a real domain are set — the sample `example.com` only demonstrates
  the pattern in `cdk synth`.
- WebSocket APIs are out of scope: WAFv2 can't front them either, and
  CloudFront-over-WebSockets is a separate decision.
