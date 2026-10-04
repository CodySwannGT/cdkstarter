/** Child-side DNS delegation without cross-account CloudFormation references. */
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as route53 from "aws-cdk-lib/aws-route53";
import type { Construct } from "constructs";
import { dnsDelegationId } from "../../../util/dns-delegation";
import type { DnsDelegationEntry } from "../../types";

/**
 * Retain the child zone and delegation together, including on stack deletion.
 * @param stack - Owning child stack
 * @param zone - Child zone, including an existing CDN ApiZone
 * @param entry - Validated normalized delegation configuration
 */
export const delegateChildZone = (
  stack: cdk.Stack,
  zone: route53.PublicHostedZone,
  entry: DnsDelegationEntry
): void => {
  const id = dnsDelegationId(entry);
  const role = iam.Role.fromRoleArn(
    stack,
    `DelegationRole-${id}`,
    stack.formatArn({
      service: "iam",
      region: "",
      account: entry.parentAccountId,
      resource: "role",
      resourceName: entry.delegationRoleName,
      arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
    }),
    { mutable: false }
  );
  zone.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
  new route53.CrossAccountZoneDelegationRecord(stack, `Delegation-${id}`, {
    delegatedZone: zone,
    parentHostedZoneId: entry.parentHostedZoneId,
    delegationRole: role,
    removalPolicy: cdk.RemovalPolicy.RETAIN,
    // CDK defaults to the Route53 signing region in the current partition.
  });
};

/** Child zones that are not already provided by the CDN stack. */
export class DnsDelegationStack extends cdk.Stack {
  /**
   * Create the configured child zones and their retained parent NS records.
   * @param scope - Owning environment stage
   * @param id - Stable stack identity
   * @param entries - Validated entries for this account
   * @param props - Stack deployment settings
   */
  constructor(
    scope: Construct,
    id: string,
    entries: readonly DnsDelegationEntry[],
    props: cdk.StackProps
  ) {
    super(scope, id, props);
    for (const entry of entries) {
      const zone = new route53.PublicHostedZone(
        this,
        `ChildZone-${dnsDelegationId(entry)}`,
        { zoneName: entry.childZoneName }
      );
      delegateChildZone(this, zone, entry);
    }
  }
}
