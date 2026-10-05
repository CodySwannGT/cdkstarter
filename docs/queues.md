# Optional queues and existing workers

## Context

The starter can provision standard SQS queues with a dedicated DLQ, source backlog alarms and optional bindings to existing Lambda workers. It creates no application worker, producer, automatic redrive or business retry handler. Omit `queues` or set `enabled: false` to preserve the existing stage templates, IAM and identities.

## Goal

Make failed messages visible without adding downstream-specific code or assuming an existing function's execution role. All queue resources and metric references belong to one `QueuesStack` in the environment stage.

## Changes

Each definition uses a stable `key`; reordering definitions preserves construct identities. The default source name is `${stageName}-${key}` and its DLQ appends `-dlq`. Explicit names must leave space for that suffix (source maximum 76 characters), and all source/DLQ names must be unique standard SQS names. FIFO queues are outside this module.

Defaults are 180 seconds of visibility, three receives, four days of source retention and fourteen days of DLQ retention. Both queues use SQS-managed encryption. Visibility is 0..43,200 seconds, retention is 60..1,209,600 seconds and receive count is an integer 1..1,000. The DLQ visible-message alarm uses `Maximum` over five minutes, strictly greater than zero, one evaluation period and missing data as not breaching. The source oldest-message alarm defaults to strictly greater than 300 seconds. These are approximate metrics, not a guarantee of immediate notification after an individual failure.

## Implementation

Add an explicit configuration block to the desired stage in `config/environments.ts`:

```typescript
queues: {
  enabled: true,
  definitions: [
    {
      key: "jobs",
      notificationTopicArns: ["arn:aws:sns:us-east-1:111111111111:worker-alerts"],
      worker: {
        functionArn: "arn:aws:lambda:us-east-1:111111111111:function:jobs-worker",
        executionRoleArn: "arn:aws:iam::111111111111:role/jobs-worker-role",
        timeoutSeconds: 30,
        alarms: { errors: true, throttles: true },
      },
    },
    { key: "unbound" },
  ],
},
```

A binding requires the existing function's unqualified ARN, existing execution-role ARN and actual timeout. The function and role must be in the queue's account and partition; the function must also be in the same region. Validation runs at the configuration loader and owning constructor, without AWS lookups. The declared timeout/role must match the deployed function; offline synth does not establish that live identity. A 40-second worker requires at least 240 seconds of visibility. The event source uses batch size ten and zero batching window, so there is no additional window to add to the six-timeout minimum.

The imported mutable role receives one stable, module-specific inline policy with only `ReceiveMessage`, `DeleteMessage`, `ChangeMessageVisibility`, `GetQueueAttributes` and `GetQueueUrl` on its source queue ARN. CDK generates the physical policy name from that keyed construct. No send, purge, redrive, DLQ consume or wildcard resource grants are added. The deployer must have authority to attach the role policy and create an event-source mapping. The worker must already provide its own logging and application permissions. Producer grants and event payload handlers remain the application's responsibility.

Optional `Errors` and `Throttles` alarms use the existing function name. Alarm actions reference only explicitly supplied standard SNS topic ARNs; omission emits alarms with no notification actions. Existing topic owners must authorize CloudWatch delivery, including any cross-account or customer-managed-key policy prerequisites. This module does not create or replace external topic policies. Provide destinations usable from the alarm region.

## Notes

AWS recommends at least five receives for Lambda retries. The accepted starter contract retains three by default; choose a larger `maxReceiveCount` where that retry budget is appropriate. Lambda/SQS delivery can repeat, so handlers must tolerate duplicates. A failed batch may retry healthy records unless the application explicitly implements partial-batch behavior outside this module.

For standard queues, retention in the DLQ is based on the original enqueue timestamp, while the DLQ age metric reflects time since transfer. Keep DLQ retention longer than source retention where investigation time matters. Queue depth/age signals are approximate. Investigate and manually redrive only after repairing the consumer; the starter grants no automated redrive privileges.

Run `npm run test:integration -- test/integration/starter-optional-workers.integration.test.ts` with the documented Node toolchain for offline configuration/template regressions. No live AWS message, function execution or notification delivery is established by these tests.

Sources: [Lambda SQS configuration](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html), [standard DLQ retention](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/setting-up-dead-letter-queue-retention.html), [SQS attributes](https://docs.aws.amazon.com/cli/latest/reference/sqs/set-queue-attributes.html), [receive-count limit](https://repost.aws/knowledge-center/sqs-dead-letter-queue).
