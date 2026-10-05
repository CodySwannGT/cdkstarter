# Optional SMS spend monitoring and recovery

## Context

This is an explicit support-account SNS SMS monitor. Omit `smsMonitoring` or set `enabled: false` for no new SMS resources or permissions. Enabling defaults to `observe`; it does not set an account preference during deployment and does not create a country policy, quota increase, recipient subscription or SMS sender.

## Goal

Report caller-defined spend thresholds and optionally lower an account/region's monthly SMS preference after a fresh estimated daily-cap breach. SNS preferences are a best-effort account-wide limit. They can affect unrelated SNS SMS users, including Cognito configured for that SMS region. They do not cover every region/provider, stop each message instantly or guarantee a maximum bill.

## Changes

Add one explicit block to the support environment that owns the SMS account and region in `config/environments.ts`:

```typescript
smsMonitoring: {
  enabled: true,
  mode: "observe",
  monthlyPreferenceUsd: 100,
  warningPercent: 80,
  dailyCapUsd: 10,
  fiveMinuteSurgeUsd: 5,
  notificationTopicArn: "arn:aws:sns:us-east-1:111111111111:sms-alerts",
},
```

Amounts in this example are illustrative caller choices, not defaults or recommendations. All limits/destination are required; amounts must be finite and positive, daily cap must not exceed the monthly preference, and warning percentage must be strictly between zero and 100. Use an existing standard topic in that same account, region and partition. The repository rejects multiple enabled controllers for the same account/region. The owner must also ensure no other repository/operator competes with this controller.

`observe` creates a five-minute evaluator and monthly/daily/surge/error alarms. Its role cannot call `sns:GetSMSAttributes` or `sns:SetSMSAttributes`. It can read CloudWatch, publish the derived estimates and send metadata to only the supplied topic. `enforce` additionally creates retained DynamoDB operation state, and narrowly allows `sns:GetSMSAttributes`/`sns:SetSMSAttributes` on unavoidable `Resource: *`, conditioned on the SMS region. State permissions are only `GetItem`/`UpdateItem` on that table. Metric publishing is restricted to `Starter/SmsSpend`. IAM does not constrain these account API actions to a single preference field; this handler sends only `MonthlySpendLimit`. Neither mode grants phone-number publishes, country-policy APIs, quota/support actions or assume-role access.

## Implementation

AWS exposes the cumulative `AWS/SNS` `SMSMonthToDateSpentUSD` counter without dimensions. The evaluator reads five-minute `Maximum` points for the current UTC day. Daily/surge signals are estimates derived from that counter, not native AWS daily metrics or exact per-message charges. A usable latest sample must be at most ten minutes old, finite/nonnegative and in the current month; future, duplicate or decreasing readings fail observably. A day estimate needs an observation in the first ten minutes after UTC midnight and subtracts that value from the latest counter. Spend before that anchor can be omitted. Surge needs a preceding same-month point with exactly 300 seconds of timestamp separation. Before 00:15 UTC (the ten-minute anchor window plus one five-minute sampling period), insufficient otherwise valid, fresh current-day samples return metadata-only `WARMING_UP`, with no fabricated spend metrics, notifications or preference changes. Usable two-point data is processed immediately even during that window. Malformed, future, duplicate, decreasing, wrong-month or stale counters always fail; missing windows at or after 00:15 also fail. Retained trips still retry pending notification, and uncertain effects/recoveries still require their normal reconciliation before reading spend. Outside that narrow warmup, gaps and missing idle-period samples produce an evaluator error rather than zero spend or a false healthy result. Ten minutes is a local availability policy, not an AWS freshness SLA.

A native monthly warning alarm compares spend to the configured ceiling's percentage. Derived daily and surge alarms use only the caller's thresholds. `EvaluatorFailure` reports missing/stale data and service/state errors. Missing alarm data is not breaching; absence is handled by the evaluator's error signal. Both direct notifications and alarm actions require an operational topic consumer. Existing topic/key owners must provide CloudWatch topic-policy authorization and any customer-managed-key IAM/key permissions for the evaluator; this module does not overwrite external policies or invent a key ARN.

Enforcement trips only on a fresh daily estimate strictly greater than the cap. It observes the existing positive monthly preference, then conditionally persists `TRIPPING` intent before attempting one `SetSMSAttributes` call. Its target is the minimum of current observed preference, configured ceiling and positive observed month-to-date spend. It never invents a service minimum, rounds up to a fixed floor, requests a quota change or raises an already observed lower preference. Plain decimal formatting avoids scientific notation; AWS can still reject small amounts or precision. Rejection is an observable unresolved operation, without a fallback attempt.

Successful reduction records `TRIPPED`, prior/configured preference, target, sample time and operation ID. Repeated/concurrent normal evaluations do not repeat the reduction. Tripped evaluations continue publishing available spend estimates without changing preferences. Notification failure retains the trip and a pending flag; a later run retries notification only. Notifications are at least once, not exactly once.

DynamoDB conditional versions coordinate this controller and recovery command, with evaluator concurrency one. They cannot transact or atomically fence the SNS API. A crash or timeout can occur before/after SNS acceptance. `TRIPPING`/`NEEDS_RECONCILIATION` retain the intent: later exact preference readback can confirm the target without another Set; a different value raises a manual-reconciliation error. A state-write failure after Set remains unresolved rather than claiming success. SDK mutation retries are disabled. Keep one designated preference writer; external writers can race the observed current value.

## Notes

A retained positive monthly preference can allow SMS spend again when the service resets its monthly counter. Preserved `TRIPPED` state guarantees no automatic restoration call by this module, not an indefinite account freeze. Day/month boundaries do not clear state. Use backend/provider authorization, rate limits and an explicit destination-country allowlist for OTP abuse control; no country-discovery API or policy automation is supplied here. SNS stops within minutes and can incur excess cost before enforcement takes effect. The five-minute schedule does not guarantee five-minute billing visibility.

Recovery is an explicit account-owner action. First inspect the operation, current SNS preference and affected authentication flows. With AWS CLI v2 installed and credentials for the owning account, invoke the stack's `EvaluatorArn` output:

```bash
node scripts/recover-sms-spend.mjs EVALUATOR_FUNCTION_ARN ACCOUNT REGION POSITIVE_USD
```

The command verifies STS caller account and invokes only that Lambda. The operator needs `lambda:InvokeFunction` on the evaluator and its normal credential chain; no local SDK dependency is needed. The handler validates its invocation account/region and the request. Restore limit must not exceed the current configured ceiling, the trip's recorded configured ceiling or the prior observed preference. It is not an AWS-approved quota increase. A conditional `RECOVERING` intent precedes Set; state becomes `READY` only after acknowledgement. Failure retains the recovery intent and does not claim a clear.

If Set succeeded but its result/state write was uncertain, use the same requested target with `--reconcile` after the account owner verifies the effect. This explicit path clears only an existing `RECOVERING` operation whose actual preference exactly matches its recorded target. Scheduled evaluation never clears an uncertain recovery. After a successful clear, a still-breached daily estimate can trip again on the next evaluation; repair the underlying traffic/abuse condition before rearming. A mismatched/unresolved trip requires manual owner reconciliation: stop competing invocations/writers, inspect SNS and retained versioned state, verify whether the original effect completed, and authorize any preference/state correction deliberately. Do not expire or blindly delete the item and retry an unknown effect. Disabling/removing the stack does not restore the SNS preference; the retained table is not automatically reused by a newly created stack. Plan recovery and state ownership before removal/recreation.

The command and handler emit only status/account/region/operation/amount/time metadata. They do not log recipient numbers, country lists, credential/client dumps or raw service response text. The exported `recoverSmsSpend` entry point accepts injected services for the offline tests. SDK services in Lambda come from its documented Node22 managed runtime; their minor version is controlled by AWS and can vary by region. Tests exercise command shapes with injected modules, not a live SDK deployment.

Run `npm run test:integration -- test/integration/starter-optional-sms.integration.test.ts` for real offline synth and injected handler/recovery regressions. Deploying this controller, exercising preferences/SMS, proving notification delivery or adopting it downstream requires a separate account-owner rollout. All source acceptance here is offline.

Sources: [SNS metrics](https://docs.aws.amazon.com/sns/latest/dg/sns-monitoring-using-cloudwatch.html), [recommended CloudWatch alarms](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Best_Practice_Recommended_Alarms_AWS_Services.html), [GetSMSAttributes](https://docs.aws.amazon.com/sns/latest/api/API_GetSMSAttributes.html), [SetSMSAttributes delays and errors](https://docs.aws.amazon.com/sns/latest/api/API_SetSMSAttributes.html), [SNS IAM resource support](https://docs.aws.amazon.com/service-authorization/latest/reference/list_sns.html), [SNS API quotas](https://docs.aws.amazon.com/general/latest/gr/sns.html), [runtime-included SDK](https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html), [conditional state updates](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_UpdateItem.html).
