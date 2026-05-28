/**
 * Valkey Stack - ElastiCache Valkey Cluster
 *
 * This stack creates an ElastiCache Valkey cluster for caching. Valkey is a
 * Redis-compatible, open-source in-memory data store that AWS recommends as
 * the successor to Redis in ElastiCache.
 *
 * ## Why Valkey over Redis
 *
 * - **Open source**: Valkey is BSD-3 licensed, avoiding Redis licensing concerns
 * - **AWS supported**: AWS actively contributes to Valkey development
 * - **Compatible**: Drop-in replacement for Redis with identical API
 * - **Performance**: Same performance characteristics as Redis
 *
 * ## Node Type Recommendations
 *
 * | Environment | Node Type        | Memory   | Use Case           |
 * |-------------|------------------|----------|--------------------|
 * | dev         | cache.t4g.micro  | 0.5 GB   | Minimal cost       |
 * | staging     | cache.t4g.small  | 1.37 GB  | Moderate testing   |
 * | production  | cache.r7g.large  | 13.07 GB | High performance   |
 *
 * ## Cross-Stack References
 *
 * This stack exports values for application stacks:
 * - `{stageName}-valkey-endpoint`: Primary endpoint for cache access
 * - `{stageName}-valkey-port`: Redis protocol port (6379)
 * @see lib/stacks/network/security-groups-stack.ts - Valkey security group
 * @module lib/stacks/database/valkey-stack
 */
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elasticache from "aws-cdk-lib/aws-elasticache";
import type { Construct } from "constructs";
import type { ValkeyConfig } from "../../types";

/**
 * Configuration properties for ValkeyStack.
 */
export interface ValkeyStackProps extends cdk.StackProps {
  /**
   * Stage name for CloudFormation output prefixes and metric dimensions.
   * Examples: "dev", "staging", "production"
   */
  readonly stageName: string;

  /**
   * VPC where Valkey will be deployed.
   */
  readonly vpc: ec2.IVpc;

  /**
   * Security group for Valkey cluster access.
   */
  readonly securityGroup: ec2.ISecurityGroup;

  /**
   * Valkey configuration including node type and count.
   */
  readonly valkey: ValkeyConfig;
}

/**
 * Valkey Stack creating ElastiCache Valkey cluster.
 *
 * Creates a Valkey replication group with encryption at rest and in transit,
 * deployed in isolated subnets with configurable node type and count.
 */
export class ValkeyStack extends cdk.Stack {
  /**
   * The Valkey replication group.
   */
  public readonly replicationGroup: elasticache.CfnReplicationGroup;

  /**
   * Creates a new ValkeyStack.
   * @param scope - Parent construct
   * @param id - Stack identifier
   * @param props - Stack configuration
   */
  constructor(scope: Construct, id: string, props: ValkeyStackProps) {
    super(scope, id, props);

    const { stageName, vpc, securityGroup, valkey } = props;

    const subnetGroup = this.createSubnetGroup(stageName, vpc);
    const parameterGroup = this.createParameterGroup(stageName);
    this.replicationGroup = this.createReplicationGroup(
      stageName,
      securityGroup,
      subnetGroup,
      parameterGroup,
      valkey
    );
    this.createOutputs(stageName);
  }

  /**
   * Creates the ElastiCache subnet group.
   * @param stageName - Stage name for resource naming
   * @param vpc - VPC with isolated subnets
   * @returns The created subnet group
   */
  private createSubnetGroup(
    stageName: string,
    vpc: ec2.IVpc
  ): elasticache.CfnSubnetGroup {
    return new elasticache.CfnSubnetGroup(this, "SubnetGroup", {
      description: `${stageName} Valkey subnet group`,
      subnetIds: vpc.isolatedSubnets.map(s => s.subnetId),
    });
  }

  /**
   * Creates the Valkey parameter group.
   * @param stageName - Stage name for resource naming
   * @returns The created parameter group
   */
  private createParameterGroup(
    stageName: string
  ): elasticache.CfnParameterGroup {
    return new elasticache.CfnParameterGroup(this, "ParameterGroup", {
      cacheParameterGroupFamily: "valkey7",
      description: `${stageName} Valkey parameter group`,
    });
  }

  /**
   * Creates the Valkey replication group.
   * @param stageName - Stage name for resource naming
   * @param securityGroup - Security group for access control
   * @param subnetGroup - Subnet group for deployment
   * @param parameterGroup - Parameter group for configuration
   * @param valkey - Valkey configuration
   * @returns The created replication group
   */
  private createReplicationGroup(
    stageName: string,
    securityGroup: ec2.ISecurityGroup,
    subnetGroup: elasticache.CfnSubnetGroup,
    parameterGroup: elasticache.CfnParameterGroup,
    valkey: ValkeyConfig
  ): elasticache.CfnReplicationGroup {
    const replicationGroup = new elasticache.CfnReplicationGroup(
      this,
      "ReplicationGroup",
      {
        replicationGroupDescription: `${stageName} Valkey cluster`,
        replicationGroupId: `${stageName}-valkey`,
        engine: "valkey",
        engineVersion: "7.2",
        cacheNodeType: valkey.nodeType,
        numNodeGroups: 1,
        replicasPerNodeGroup: Math.max(0, valkey.numCacheNodes - 1),
        cacheSubnetGroupName: subnetGroup.ref,
        securityGroupIds: [securityGroup.securityGroupId],
        cacheParameterGroupName: parameterGroup.ref,
        atRestEncryptionEnabled: true,
        transitEncryptionEnabled: true,
        automaticFailoverEnabled: valkey.numCacheNodes > 1,
      }
    );

    replicationGroup.addDependency(subnetGroup);
    replicationGroup.addDependency(parameterGroup);

    return replicationGroup;
  }

  /**
   * Creates CloudFormation outputs for cross-stack references.
   * @param stageName - Stage name for export name prefixes
   */
  private createOutputs(stageName: string): void {
    new cdk.CfnOutput(this, "CacheEndpoint", {
      value: this.replicationGroup.attrPrimaryEndPointAddress,
      description: `Valkey primary endpoint for ${stageName}`,
      exportName: `${stageName}-valkey-endpoint`,
    });

    new cdk.CfnOutput(this, "CachePort", {
      value: this.replicationGroup.attrPrimaryEndPointPort,
      description: `Valkey port for ${stageName}`,
      exportName: `${stageName}-valkey-port`,
    });
  }
}
