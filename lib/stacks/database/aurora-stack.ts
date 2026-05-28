/**
 * Aurora Stack - Serverless v2 PostgreSQL Database
 *
 * This stack creates an Aurora Serverless v2 PostgreSQL cluster with RDS Proxy
 * and IAM authentication. Aurora Serverless v2 provides automatic scaling
 * between configured minimum and maximum capacity units (ACUs).
 *
 * ## Why Aurora Serverless v2
 *
 * - **Cost optimization**: Scales to near-zero for dev environments
 * - **Auto-scaling**: Automatically adjusts capacity based on load
 * - **Fast scaling**: Sub-second scaling response time
 * - **Pay-per-use**: Charged per ACU-second actually used
 *
 * ## Why RDS Proxy with IAM Auth
 *
 * - **Connection pooling**: Reduces database connection overhead for Lambda
 * - **IAM auth**: No password rotation needed, uses temporary credentials
 * - **Failover handling**: Maintains connections during Aurora failover
 * - **SOC2 compliant**: No long-lived credentials to manage
 *
 * ## Capacity Units (ACUs)
 *
 * - 0.5 ACU = ~1 GB RAM (minimum for dev)
 * - 1 ACU = ~2 GB RAM
 * - Each ACU provides approximately 2 GB of memory with corresponding CPU
 *
 * ## Cross-Stack References
 *
 * This stack exports values for application stacks:
 * - `{stageName}-aurora-cluster-endpoint`: Direct cluster writer endpoint
 * - `{stageName}-aurora-proxy-endpoint`: RDS Proxy endpoint (preferred)
 * - `{stageName}-aurora-secret-arn`: Secrets Manager secret ARN
 * @see lib/stacks/network/security-groups-stack.ts - Aurora security group
 * @module lib/stacks/database/aurora-stack
 */
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import type * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";
import type { AuroraConfig } from "../../types";

/**
 * Configuration properties for AuroraStack.
 */
export interface AuroraStackProps extends cdk.StackProps {
  /**
   * Stage name for CloudFormation output prefixes and metric dimensions.
   * Examples: "dev", "staging", "production"
   */
  readonly stageName: string;

  /**
   * VPC where Aurora will be deployed.
   */
  readonly vpc: ec2.IVpc;

  /**
   * Security group for Aurora cluster access.
   */
  readonly securityGroup: ec2.ISecurityGroup;

  /**
   * Aurora configuration including capacity and backup settings.
   */
  readonly aurora: AuroraConfig;
}

/**
 * Aurora Stack creating Serverless v2 PostgreSQL with RDS Proxy.
 *
 * Creates an Aurora PostgreSQL Serverless v2 cluster with IAM-authenticated
 * RDS Proxy for connection pooling. The cluster is deployed in isolated
 * subnets with credentials stored in Secrets Manager.
 */
export class AuroraStack extends cdk.Stack {
  /**
   * The Aurora database cluster.
   */
  public readonly cluster: rds.DatabaseCluster;

  /**
   * The RDS Proxy for connection pooling.
   */
  public readonly proxy: rds.DatabaseProxy;

  /**
   * The Secrets Manager secret containing database credentials.
   */
  public readonly secret: secretsmanager.ISecret;

  /**
   * Creates a new AuroraStack.
   * @param scope - Parent construct
   * @param id - Stack identifier
   * @param props - Stack configuration
   */
  constructor(scope: Construct, id: string, props: AuroraStackProps) {
    super(scope, id, props);

    const { stageName, vpc, securityGroup, aurora } = props;

    this.cluster = this.createCluster(stageName, vpc, securityGroup, aurora);

    // Credentials.fromGeneratedSecret() should always create a secret, but the
    // CDK type is optional to support other credential types. Fail fast if missing.
    if (!this.cluster.secret) {
      throw new Error(
        "Aurora cluster secret was not created. Ensure credentials use fromGeneratedSecret()."
      );
    }
    this.secret = this.cluster.secret;
    this.proxy = this.createProxy(stageName, vpc, securityGroup);
    this.createOutputs(stageName);
  }

  /**
   * Creates the Aurora Serverless v2 PostgreSQL cluster.
   * @param stageName - Stage name for resource naming
   * @param vpc - VPC for cluster deployment
   * @param securityGroup - Security group for cluster access
   * @param aurora - Aurora configuration
   * @returns The created database cluster
   */
  private createCluster(
    stageName: string,
    vpc: ec2.IVpc,
    securityGroup: ec2.ISecurityGroup,
    aurora: AuroraConfig
  ): rds.DatabaseCluster {
    const clusterIdentifier = `${stageName}-aurora-cluster`;

    return new rds.DatabaseCluster(this, "AuroraCluster", {
      clusterIdentifier,
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_4,
      }),
      credentials: rds.Credentials.fromGeneratedSecret("clusteradmin"),
      writer: rds.ClusterInstance.serverlessV2("writer"),
      readers: Array.from(
        { length: Math.max(0, aurora.instanceCount - 1) },
        () =>
          rds.ClusterInstance.serverlessV2("reader", {
            scaleWithWriter: true,
          })
      ),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [securityGroup],
      deletionProtection: aurora.deletionProtection,
      backup: { retention: cdk.Duration.days(aurora.backupRetentionDays) },
      storageEncrypted: true,
      cloudwatchLogsExports: ["postgresql"],
      cloudwatchLogsRetention: this.getLogRetention(aurora.logRetentionDays),
      serverlessV2MinCapacity: aurora.minCapacity,
      serverlessV2MaxCapacity: aurora.maxCapacity,
    });
  }

  /**
   * Creates the RDS Proxy with IAM authentication.
   * @param stageName - Stage name for resource naming
   * @param vpc - VPC for proxy deployment
   * @param securityGroup - Security group for proxy access
   * @returns The created database proxy
   */
  private createProxy(
    stageName: string,
    vpc: ec2.IVpc,
    securityGroup: ec2.ISecurityGroup
  ): rds.DatabaseProxy {
    return this.cluster.addProxy(`${stageName}-proxy`, {
      vpc,
      secrets: [this.cluster.secret!],
      securityGroups: [securityGroup],
      iamAuth: true,
      requireTLS: true,
    });
  }

  /**
   * Converts log retention days to CDK RetentionDays enum.
   * @param days - Number of days to retain logs
   * @returns The corresponding RetentionDays enum value
   */
  private getLogRetention(days: number): logs.RetentionDays {
    if (days <= 1) return logs.RetentionDays.ONE_DAY;
    if (days <= 3) return logs.RetentionDays.THREE_DAYS;
    if (days <= 7) return logs.RetentionDays.ONE_WEEK;
    if (days <= 14) return logs.RetentionDays.TWO_WEEKS;
    if (days <= 30) return logs.RetentionDays.ONE_MONTH;
    if (days <= 90) return logs.RetentionDays.THREE_MONTHS;
    if (days <= 180) return logs.RetentionDays.SIX_MONTHS;
    return logs.RetentionDays.ONE_YEAR;
  }

  /**
   * Creates CloudFormation outputs for cross-stack references.
   * @param stageName - Stage name for export name prefixes
   */
  private createOutputs(stageName: string): void {
    new cdk.CfnOutput(this, "ClusterEndpoint", {
      value: this.cluster.clusterEndpoint.hostname,
      description: `Aurora cluster endpoint for ${stageName}`,
      exportName: `${stageName}-aurora-cluster-endpoint`,
    });

    new cdk.CfnOutput(this, "ProxyEndpoint", {
      value: this.proxy.endpoint,
      description: `RDS Proxy endpoint for ${stageName}`,
      exportName: `${stageName}-aurora-proxy-endpoint`,
    });

    new cdk.CfnOutput(this, "SecretArn", {
      value: this.cluster.secret?.secretArn ?? "",
      description: `Aurora secret ARN for ${stageName}`,
      exportName: `${stageName}-aurora-secret-arn`,
    });

    new cdk.CfnOutput(this, "ClusterPort", {
      value: this.cluster.clusterEndpoint.port.toString(),
      description: `Aurora cluster port for ${stageName}`,
      exportName: `${stageName}-aurora-cluster-port`,
    });
  }
}
