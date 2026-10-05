# Optional GraphQL monitoring and cause grouping

Monitoring and cause grouping are independent, default-off features. The starter supplies no operation manifest or workload budgets. Configure only operations your backend actually publishes, using caller-calibrated thresholds.

```ts
observability: {
  // Keep the existing observability settings here.
  graphqlMonitoring: {
    enabled: true,
    namespace: "YourBackend/GraphQL",
    stageDimension: "dev",
    minimumInvocations: 20,
    errorRatePercent: { warning: 5, critical: 10 },
    latencyMilliseconds: { warning: 500, critical: 1000 },
    latencyStatistic: "p95",
    operations: [
      { name: "ExampleQuery", type: "query", public: false },
      { name: "ExampleMutation", type: "mutation", public: true },
    ],
  },
  sentryDsn: "https://your-key@your-sentry-host/your-project",
  causeGrouping: true,
}
```

The example budgets are fixture values, not recommended calibration. Remove either optional setting or set its switch to false to disable it. Monitoring requires `features.observability`; grouping additionally requires the existing Sentry forwarder/DSN. Grouping can be enabled for other explicitly annotated alarms without GraphQL monitoring. Monitoring can send SNS/email alerts without grouping or Sentry.

## Backend metric contract

Publish custom metrics in the configured namespace with exactly `OperationName`, `OperationType` (`query` or `mutation`), and `Stage` (the caller's `stageDimension` value). Publish `Duration` in milliseconds for each invocation; alarms use its `SampleCount` as invocation count and the caller-selected `Average`, `Maximum`, `p95`, or `p99` for latency. Publish `Errors` in Count units; alarms use `Sum`. Count failed invocations consistently rather than multiplying one invocation by its individual GraphQL error messages.

For protected operations, also publish separate series with the additional `AuthState` dimension set to `authenticated` or `anonymous`. Both states' Duration sample counts must be instrumented for the selection contract to work. Also retain the all-traffic series without AuthState during the migration. Different dimension sets are independent CloudWatch metrics; the starter does not create or aggregate backend instrumentation. Public operations always use all-traffic series.

Every metric and expression uses a five-minute period. Protected operations select authenticated count, errors and latency when the sum of authenticated and anonymous invocation counts is positive. Anonymous-only traffic therefore selects zero authenticated traffic, rather than accidentally falling back to all traffic. When both auth-state series have no traffic/missing data, selection falls back to the all-traffic series. Missing count, errors and latency points use `FILL(...,0)`.

The error rate is `IF(n>=floor,100*e/IF(n>0,n,1),0)` after traffic selection. Latency is similarly gated by the minimum invocation floor. Alarms fire when the resulting value strictly exceeds its warning or critical budget. This keeps a zero warning percentage valid without alarming on a zero-volume/under-floor result. Thresholds must be finite, warning must be lower than critical, percentages must be within 0..100, latency thresholds must be nonnegative milliseconds, and the invocation floor must be a positive integer. Duplicate operation name/type entries and malformed manifests fail startup validation. Warning and critical alarms use existing SNS routes and participate in the existing optional composite alarm.

Missing data is nonbreaching. That choice does not prove backend health or instrumentation completeness. AWS notes that recently delayed metrics with FILL can affect alarm evaluation; calibrate budgets and verify real metric publication separately. The source fixtures model values at sample timestamps and evaluate the emitted queries, without claiming live CloudWatch equivalence or calibration. See [AWS metric-math semantics](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/using-metric-math.html).

## Explicit cause fingerprints

The forwarder only reads cause metadata when `causeGrouping` is true. GraphQL alarm descriptions contain bounded versioned JSON:

```json
{
  "version": 1,
  "environment": "dev",
  "identity": "graphql:YourBackend/GraphQL:query:ExampleQuery",
  "cause": "error-rate"
}
```

Warning and critical alarms for the same operation/cause use the same description. The Sentry fingerprint is `infra-cause-v1`, environment, identity, cause; severity remains a separate tag. Latency uses a different cause. Different operation identities, namespaces and environments stay separate. Other alarms can opt in by following this same explicit contract. Identity/cause fields must be nonempty bounded strings without control characters, the JSON must be at most 1024 characters, version must be 1, and its environment must exactly match the forwarder's configured stage.

Absent, malformed, unsupported-version, oversized or mismatched metadata falls back to the existing `[AlarmName]` fingerprint. OK/INSUFFICIENT_DATA state handling and pipeline, generic SNS and Backup routes retain their existing behavior and construct IDs.

Ingestion HTTP failures reject with only a bounded HTTP status, and network/timeout failures reject with generic categories. Errors never include the raw transport error, response body, DSN, event body or cause metadata. No internal retry is added. Lambda/SNS/EventBridge may retry the invocation externally; this is not an exactly-once delivery or live Sentry integration claim.
