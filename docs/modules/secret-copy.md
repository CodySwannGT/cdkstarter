# Optional secret copying

Omit `StageEnvironment.secretCopy` to create no copier stack, Lambda, provider,
or change subscription. This feature moves values at runtime inside one AWS
account and region. CloudFormation properties, Lambda environment variables,
outputs, logs, and provider responses carry identifiers only.

Set an explicit owning account and region and configure existing resources:

```ts
secretCopy: {
  mappings: [{
    key: "api",
    parameterName: "/example/api",
    secretArn: "arn:aws:secretsmanager:us-east-1:123456789012:secret:example-api-Ab1234",
    sourceKeyArn: "arn:aws:kms:us-east-1:123456789012:key/11111111-1111-1111-1111-111111111111",
    targetKeyArn: "arn:aws:kms:us-east-1:123456789012:key/22222222-2222-2222-2222-222222222222",
  }],
  synchronizeChanges: false,
}
```

These are synthetic references, not secrets or a deployable configuration.
Mappings require unique keys and destination ARNs, absolute parameter names,
complete secret ARNs including the six-character suffix, and exact KMS key ARNs
when customer-managed keys are used. References must match the stack's account,
region, and partition. No inline value fields or wildcard resources are accepted.
The destination must exist with an accessible `SecretString` version; missing,
versionless, binary, or malformed destinations fail without being recreated.
Create the initial destination value separately under your provisioning policy.

The dedicated runtime receives only `ssm:GetParameter` for each exact parameter
and `secretsmanager:GetSecretValue` / `PutSecretValue` for each exact destination.
Customer-managed source keys allow `kms:Decrypt` through SSM with the exact
`PARAMETER_ARN` encryption context. Destination keys allow `kms:Decrypt` and
`GenerateDataKey` through Secrets Manager with the exact `SecretARN` context.
Key policies must also permit the copier role. The
[AWS KMS ViaService table](https://docs.aws.amazon.com/kms/latest/developerguide/conditions-kms.html#conditions-kms-via-service)
requires `.amazonaws.com` in all partitions, including China. ARN partitions
still follow the owning region. See the
[Parameter Store encryption context](https://docs.aws.amazon.com/systems-manager/latest/userguide/secure-string-parameter-kms-encryption.html)
and [Secrets Manager encryption contract](https://docs.aws.amazon.com/secretsmanager/latest/userguide/security-encryption.html).

Create/update fetches decrypted source strings, compares the current destination,
and writes only different values. Replays after a completed write skip that
write. Partial failures fail the invocation; retries compare completed mappings
again. Delete performs no reads, writes, or secret deletion. Removing a mapping
does not delete either resource. The scope-derived physical ID stays stable when
mapping contents change; preserve the caller's construct scope and ID when moving
configuration.

`synchronizeChanges: true` adds one EventBridge rule for only configured names
and Parameter Store Create/Update operations. The handler independently filters
source, detail type, operation and name. Delivery is best effort and asynchronous;
this is neither an atomic transfer nor exactly-once synchronization. A missed
change can be reconciled by an explicit update. Changes to configuration trigger
the custom resource; a changed source value alone does not trigger it when event
synchronization is disabled. See
[Parameter Store event behavior](https://docs.aws.amazon.com/systems-manager/latest/userguide/sysman-paramstore-cwe.html).

Empty/missing sources, malformed destination responses and SDK failures fail
with a fixed error message. SDK messages and untrusted error names are never
logged. Only mapping keys and fixed error classifications cross the logging
boundary. No `Data` or plaintext outputs are returned. Runtime assets use the
AWS SDK v3 supplied by the Node.js 22 Lambda runtime. Offline tests inject those
same operations and execute the deployed entrypoint without live AWS calls.

Run `npm run test -- test/integration/starter-optional-secret-tools.integration.test.ts`.
This validates source behavior and synthesized IAM; live provisioning, key
policy verification, copying and downstream adoption require separate work.
