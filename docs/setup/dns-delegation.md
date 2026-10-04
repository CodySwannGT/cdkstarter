# Optional cross-account DNS delegation

Leave `domainConfig.dnsDelegation` absent or set `enabled: false` to retain the existing manual DNS workflow. Enabling it adds narrowly scoped parent authorization and child zones for matching stage accounts. It never performs a hosted-zone lookup or replaces the existing managed `Zone-*` and `CertificateZone-*` resources.

```ts
const domainConfig: DomainConfig = {
  domains: [],
  dnsDelegation: {
    enabled: true,
    entries: [
      {
        parentDomain: "example.test",
        parentHostedZoneId: "ZEXAMPLEPARENT",
        parentAccountId: "111111111111",
        delegationRoleName: "delegate-dev-example-test",
        childZoneName: "dev.example.test",
        trustedChildAccountIds: ["222222222222"],
      },
    ],
  },
};
```

Replace the example IDs with real values. The parent hosted zone must already exist in the supplied parent account and be authoritative for the parent domain. Verify its ID and registrar delegation yourself. An explicit supplied parent ID references that zone for the IAM policy and NS update; it does not import it into or replace the starter's managed zone map. If migrating an existing starter deployment, use its actual deployed parent-zone ID.

Configure a DNS-enabled support environment in the parent account. Deploy its DNS stack first to create the named role. Each role trusts only its configured child accounts and permits `route53:ChangeResourceRecordSets` only on the supplied zone, for NS records, UPSERT/DELETE actions, and the exact normalized child name. No wildcard hosted-zone listing permission is granted.

Then deploy the matching child environment. Matching uses `trustedChildAccountIds`; the complete configuration must match at most one stage per entry to avoid competing zone owners. Use one role per child name. DNS names normalize to lowercase without a trailing dot. Child names must be strictly below the parent; apex, deceptive suffixes, duplicate names/roles, malformed account IDs, and invalid DNS labels fail configuration validation before deployment. The child assumes an explicit partition-aware parent role ARN; there are no cross-account CloudFormation exports. CDK chooses the Route53 signing region for the current AWS partition.

When the child name equals the environment's CDN hostname, delegation reuses `ApiZone` and preserves `EdgeCertificate`. Other child names get their own zone in the same environment stage. The feature does not create registrar records or application API mappings.

## Deletion, disabling and renaming

The delegation custom resource and delegated child zone both use `RETAIN`, including replacement. Deleting a stack or disabling this feature leaves the parent NS record and child zone in place. This prevents an automatic Delete event from removing live delegation. It also means cleanup is an operator responsibility, and retained zones continue to incur Route53 charges.

Before removing the parent role, capture the deployed child zone's name servers and the exact parent NS record. Stop traffic or migrate it to the replacement delegation. Remove the old NS record from the correct parent zone manually, then remove records from and delete the retained old child zone when safe. Keep the parent role available until cleanup is complete. Renaming an entry creates a new stable child-zone identity and may leave the old delegation behind; changing a parent zone ID can similarly leave the old parent NS record behind. Inspect and clean up both locations. Do not assume deployment automatically deletes old NS records.

Before migrating an existing CDN zone, synthesize and inspect the change: its logical ID remains `ApiZone`, its certificate remains `EdgeCertificate`, and the opt-in lifecycle changes to retention. Verify that no second child zone is being introduced for the same hostname. Existing manually delegated records can be adopted by UPSERT only after confirming the intended child zone and parent ID.

The named integration suite uses fake accounts and offline synthesis. It proves template configuration and lifecycle properties, not deployed DNS resolution or real cross-account authentication.

AWS documents [Route53 IAM record-name conditions](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/specifying-conditions-route53.html) and CDK's [cross-account delegation lifecycle and partition defaults](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_route53.CrossAccountZoneDelegationRecord.html).
