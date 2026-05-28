/**
 * Security Groups Stack - Network Access Control
 *
 * This stack creates security groups that control network access between
 * infrastructure components. It implements a least-privilege model where
 * each security group only allows the minimum required access.
 *
 * ## Security Group Relationships
 *
 * ```
 * Lambda SG ─────────────────────────────────┐
 *    │                                       │
 *    │ Port 5432 (PostgreSQL)                │ Port 6379 (Redis)
 *    ▼                                       ▼
 * Aurora SG                              Valkey SG
 * ```
 *
 * Lambda functions can access both Aurora and Valkey, but Aurora and Valkey
 * cannot communicate with each other (database isolation).
 *
 * ## Cross-Stack References
 *
 * This stack exports security group IDs for use by application stacks:
 * - `{stageName}-aurora-security-group-id`: For Aurora cluster
 * - `{stageName}-valkey-security-group-id`: For Valkey cache
 * - `{stageName}-lambda-security-group-id`: For Lambda functions
 * @see lib/stacks/database/aurora-stack.ts - Uses Aurora security group
 * @see lib/stacks/database/valkey-stack.ts - Uses Valkey security group
 * @module lib/stacks/network/security-groups-stack
 */
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import type { Construct } from "constructs";

/**
 * Configuration properties for SecurityGroupsStack.
 */
export interface SecurityGroupsStackProps extends cdk.StackProps {
  /**
   * Stage name for CloudFormation output prefixes.
   * Examples: "dev", "staging", "production"
   */
  readonly stageName: string;

  /**
   * VPC where security groups will be created.
   */
  readonly vpc: ec2.IVpc;
}

/**
 * Security Groups Stack creating network access controls.
 *
 * Creates security groups for Aurora, Valkey, and Lambda with appropriate
 * ingress rules to allow communication between components.
 */
export class SecurityGroupsStack extends cdk.Stack {
  /**
   * Security group for Aurora PostgreSQL cluster.
   */
  public readonly auroraSecurityGroup: ec2.SecurityGroup;

  /**
   * Security group for Valkey cache cluster.
   */
  public readonly valkeySecurityGroup: ec2.SecurityGroup;

  /**
   * Security group for Lambda functions.
   */
  public readonly lambdaSecurityGroup: ec2.SecurityGroup;

  /**
   * Creates a new SecurityGroupsStack.
   * @param scope - Parent construct
   * @param id - Stack identifier
   * @param props - Stack configuration
   */
  constructor(scope: Construct, id: string, props: SecurityGroupsStackProps) {
    super(scope, id, props);

    const { stageName, vpc } = props;

    this.lambdaSecurityGroup = this.createLambdaSecurityGroup(stageName, vpc);
    this.auroraSecurityGroup = this.createAuroraSecurityGroup(stageName, vpc);
    this.valkeySecurityGroup = this.createValkeySecurityGroup(stageName, vpc);

    this.configureIngressRules();
    this.createOutputs(stageName);
  }

  /**
   * Creates the Lambda security group.
   *
   * Lambda functions use this security group to communicate with database
   * and cache resources within the VPC.
   * @param _stageName - Stage name (unused, kept for interface consistency)
   * @param vpc - VPC where security group is created
   * @returns Lambda security group
   */
  private createLambdaSecurityGroup(
    _stageName: string,
    vpc: ec2.IVpc
  ): ec2.SecurityGroup {
    return new ec2.SecurityGroup(this, "LambdaSecurityGroup", {
      vpc,
      description:
        "Security group for Lambda functions accessing Aurora and Valkey",
      allowAllOutbound: true,
    });
  }

  /**
   * Creates the Aurora PostgreSQL security group.
   *
   * Controls access to Aurora cluster. Only Lambda security group members
   * can connect on PostgreSQL port 5432.
   * @param _stageName - Stage name (unused, kept for interface consistency)
   * @param vpc - VPC where security group is created
   * @returns Aurora security group
   */
  private createAuroraSecurityGroup(
    _stageName: string,
    vpc: ec2.IVpc
  ): ec2.SecurityGroup {
    return new ec2.SecurityGroup(this, "AuroraSecurityGroup", {
      vpc,
      description: "Security group for Aurora PostgreSQL cluster",
      allowAllOutbound: false,
    });
  }

  /**
   * Creates the Valkey cache security group.
   *
   * Controls access to Valkey cluster. Only Lambda security group members
   * can connect on Redis port 6379.
   * @param _stageName - Stage name (unused, kept for interface consistency)
   * @param vpc - VPC where security group is created
   * @returns Valkey security group
   */
  private createValkeySecurityGroup(
    _stageName: string,
    vpc: ec2.IVpc
  ): ec2.SecurityGroup {
    return new ec2.SecurityGroup(this, "ValkeySecurityGroup", {
      vpc,
      description: "Security group for Valkey ElastiCache cluster",
      allowAllOutbound: false,
    });
  }

  /**
   * Configures ingress rules between security groups.
   *
   * Establishes the security group relationships:
   * - Lambda -> Aurora (port 5432)
   * - Lambda -> Valkey (port 6379)
   */
  private configureIngressRules(): void {
    // Aurora allows PostgreSQL from Lambda
    this.auroraSecurityGroup.addIngressRule(
      this.lambdaSecurityGroup,
      ec2.Port.tcp(5432),
      "Allow PostgreSQL access from Lambda functions"
    );

    // Valkey allows Redis from Lambda
    this.valkeySecurityGroup.addIngressRule(
      this.lambdaSecurityGroup,
      ec2.Port.tcp(6379),
      "Allow Redis access from Lambda functions"
    );
  }

  /**
   * Creates CloudFormation outputs for cross-stack references.
   * @param stageName - Stage name for export name prefixes
   */
  private createOutputs(stageName: string): void {
    new cdk.CfnOutput(this, "AuroraSecurityGroupId", {
      value: this.auroraSecurityGroup.securityGroupId,
      description: `Aurora security group ID for ${stageName} environment`,
      exportName: `${stageName}-aurora-security-group-id`,
    });

    new cdk.CfnOutput(this, "ValkeySecurityGroupId", {
      value: this.valkeySecurityGroup.securityGroupId,
      description: `Valkey security group ID for ${stageName} environment`,
      exportName: `${stageName}-valkey-security-group-id`,
    });

    new cdk.CfnOutput(this, "LambdaSecurityGroupId", {
      value: this.lambdaSecurityGroup.securityGroupId,
      description: `Lambda security group ID for ${stageName} environment`,
      exportName: `${stageName}-lambda-security-group-id`,
    });
  }
}
