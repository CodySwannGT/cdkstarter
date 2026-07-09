/**
 * Flow Logs Stack - Central VPC Flow Log Storage
 *
 * Creates an S3 bucket in the shared account that receives VPC flow logs
 * from every stage account. Centralizing flow logs simplifies retention,
 * audit access, and security tooling integration.
 *
 * For each source account, the bucket policy grants the AWS log-delivery
 * service (`delivery.logs.amazonaws.com`) write access, conditioned on
 * `aws:SourceAccount` and `aws:SourceArn` so only that account's log
 * deliveries are accepted.
 *
 * The bucket is intentionally unversioned — flow logs are append-only and
 * versioning would only multiply storage costs.
 * @see lib/stacks/network/vpc-stack.ts - Per-VPC flow log configuration
 * @module lib/stacks/support/flow-logs-stack
 */
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";

/**
 * A flow-log source account (account ID + region for the SourceArn condition).
 */
export interface FlowLogSource {
  /**
   * AWS account ID allowed to deliver flow logs.
   */
  readonly accountId: string;

  /**
   * Region the account's log deliveries originate from.
   */
  readonly region: string;
}

/**
 * Configuration properties for FlowLogsStack.
 */
export interface FlowLogsStackProps extends cdk.StackProps {
  /**
   * Accounts allowed to deliver VPC flow logs to the bucket.
   */
  readonly sources: readonly FlowLogSource[];
}

/**
 * Stack that manages central VPC flow log storage in S3.
 */
export class FlowLogsStack extends cdk.Stack {
  /**
   * The flow logs bucket.
   */
  public readonly bucket: s3.Bucket;

  /**
   * Constructs a FlowLogsStack.
   * @param scope - Parent construct
   * @param id - Stack identifier
   * @param props - Stack configuration
   */
  constructor(scope: Construct, id: string, props: FlowLogsStackProps) {
    super(scope, id, props);

    this.bucket = new s3.Bucket(this, "FlowLogsBucket", {
      enforceSSL: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: false,
    });

    props.sources.forEach(source => {
      const logDeliveryWriteStatement = new iam.PolicyStatement({
        sid: `AWSLogDeliveryWrite${source.accountId}`,
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal("delivery.logs.amazonaws.com")],
        actions: ["s3:PutObject"],
        resources: [this.bucket.bucketArn, this.bucket.arnForObjects("*")],
        conditions: {
          StringEquals: {
            "aws:SourceAccount": source.accountId,
            "s3:x-amz-acl": "bucket-owner-full-control",
          },
          ArnLike: {
            "aws:SourceArn": `arn:aws:logs:${source.region}:${source.accountId}:*`,
          },
        },
      });

      const logDeliveryCheckStatement = new iam.PolicyStatement({
        sid: `AWSLogDeliveryCheck${source.accountId}`,
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal("delivery.logs.amazonaws.com")],
        actions: ["s3:GetBucketAcl", "s3:ListBucket"],
        resources: [this.bucket.bucketArn],
        conditions: {
          StringEquals: {
            "aws:SourceAccount": source.accountId,
          },
          ArnLike: {
            "aws:SourceArn": `arn:aws:logs:${source.region}:${source.accountId}:*`,
          },
        },
      });

      this.bucket.addToResourcePolicy(logDeliveryWriteStatement);
      this.bucket.addToResourcePolicy(logDeliveryCheckStatement);
    });

    new cdk.CfnOutput(this, "FlowLogsBucketName", {
      value: this.bucket.bucketName,
      description: "Central VPC flow logs bucket name",
      exportName: "flow-logs-bucket-name",
    });
  }
}
