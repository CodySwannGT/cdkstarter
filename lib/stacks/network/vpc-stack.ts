/**
 * VPC Stack - Network Foundation for Stage Environments
 *
 * This stack creates the foundational VPC infrastructure for each stage
 * environment. It implements a three-tier subnet architecture optimized for
 * serverless workloads with Aurora and ElastiCache.
 *
 * ## Subnet Architecture
 *
 * - **Public subnets**: NAT gateways and any public-facing resources
 * - **Private subnets with egress**: Lambda functions, API Gateway VPC links
 * - **Isolated subnets**: Aurora database, Valkey cache (no internet access)
 *
 * ## CIDR Allocation
 *
 * Each environment MUST have a unique VPC CIDR to enable future VPC peering
 * if needed. Suggested pattern (10.{env}.0.0/16):
 * - dev: 10.0.0.0/16
 * - staging: 10.1.0.0/16
 * - production: 10.2.0.0/16
 *
 * ## NAT Gateway Strategy
 *
 * - Dev: 1 NAT gateway (cost optimization)
 * - Staging/Production: 2 NAT gateways (high availability)
 *
 * ## Cross-Stack References
 *
 * This stack exports values for use by other stacks:
 * - `{stageName}-vpc-id`: VPC identifier
 * - `{stageName}-public-subnet-ids`: Comma-separated public subnet IDs
 * - `{stageName}-private-subnet-ids`: Comma-separated private subnet IDs
 * - `{stageName}-isolated-subnet-ids`: Comma-separated isolated subnet IDs
 * - `{stageName}-availability-zones`: Comma-separated AZ names
 * @see lib/stacks/network/security-groups-stack.ts - Security groups for resources
 * @see util/cross-stage-imports.ts - Import utilities
 * @module lib/stacks/network/vpc-stack
 */
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import type { Construct } from "constructs";
import type { VpcEndpointType } from "../../types";

/**
 * Configuration properties for VpcStack.
 */
export interface VpcStackProps extends cdk.StackProps {
  /**
   * Stage name for resource naming and output prefixes.
   * Examples: "dev", "staging", "production"
   */
  readonly stageName: string;

  /**
   * VPC CIDR block in notation like "10.0.0.0/16".
   * Must be unique across all stage environments.
   */
  readonly vpcCidr: string;

  /**
   * Number of NAT gateways to provision.
   * Use 1 for cost optimization (dev), 2 for high availability (production).
   */
  readonly natGatewayCount: number;

  /**
   * Enable VPC flow logs for network traffic monitoring.
   * Recommended for staging and production environments.
   */
  readonly enableFlowLogs: boolean;

  /** Explicit services; gateway endpoints are free, interfaces are paid opt-in. */
  readonly vpcEndpoints?: readonly VpcEndpointType[];
}

/**
 * VPC Stack creating network infrastructure for a stage environment.
 *
 * Creates a VPC with three subnet tiers (public, private with egress, isolated),
 * configurable NAT gateways, and optional VPC flow logs. Exports all values
 * needed for cross-stack references.
 */
export class VpcStack extends cdk.Stack {
  /**
   * The VPC created by this stack.
   */
  public readonly vpc: ec2.Vpc;

  /**
   * Creates a new VpcStack.
   * @param scope - Parent construct
   * @param id - Stack identifier
   * @param props - Stack configuration
   */
  constructor(scope: Construct, id: string, props: VpcStackProps) {
    super(scope, id, props);

    const { stageName, vpcCidr, natGatewayCount, enableFlowLogs } = props;

    this.vpc = new ec2.Vpc(this, "Vpc", {
      ipAddresses: ec2.IpAddresses.cidr(vpcCidr),
      maxAzs: 2,
      natGateways: natGatewayCount,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: "private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
        {
          name: "isolated",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    if (enableFlowLogs) {
      this.vpc.addFlowLog("VpcFlowLog", {
        trafficType: ec2.FlowLogTrafficType.ALL,
      });
    }

    this.createEndpoints(props.vpcEndpoints ?? []);
    this.createOutputs(stageName);
  }

  /**
   * Create explicit private gateway/interface endpoints without public ingress.
   * @param requested - Configured services, deduplicated before creation
   */
  private createEndpoints(requested: readonly VpcEndpointType[]): void {
    const gateways = {
      s3: ec2.GatewayVpcEndpointAwsService.S3,
      dynamodb: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
    };
    const interfaces = {
      secretsmanager: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      ssm: ec2.InterfaceVpcEndpointAwsService.SSM,
      ssmmessages: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
      logs: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
    };
    const allowed = new Set([
      ...Object.keys(gateways),
      ...Object.keys(interfaces),
    ]);
    const services = [...new Set(requested)];
    services.forEach(service => {
      if (!allowed.has(service))
        throw new Error(`Unsupported VPC endpoint: ${service}`);
    });
    const privateSubnets = [
      ...this.vpc.privateSubnets,
      ...this.vpc.isolatedSubnets,
    ];
    const securityGroup = services.some(service =>
      Object.prototype.hasOwnProperty.call(interfaces, service)
    )
      ? new ec2.SecurityGroup(this, "EndpointSecurityGroup", {
          vpc: this.vpc,
          description: "Private subnet HTTPS access to opted-in endpoints",
          allowAllOutbound: false,
        })
      : undefined;
    if (securityGroup) {
      privateSubnets.forEach(subnet =>
        securityGroup.addIngressRule(
          ec2.Peer.ipv4(subnet.ipv4CidrBlock),
          ec2.Port.tcp(443),
          "Private subnet HTTPS"
        )
      );
    }
    services.forEach(service => {
      if (Object.prototype.hasOwnProperty.call(gateways, service)) {
        this.vpc.addGatewayEndpoint(`${service}Endpoint`, {
          service: gateways[service as keyof typeof gateways],
          subnets: [{ subnets: privateSubnets }],
        });
      } else if (securityGroup) {
        this.vpc.addInterfaceEndpoint(`${service}Endpoint`, {
          service: interfaces[service as keyof typeof interfaces],
          subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
          privateDnsEnabled: true,
          open: false,
          securityGroups: [securityGroup],
        });
      }
    });
  }

  /**
   * Creates CloudFormation outputs for cross-stack references.
   * @param stageName - Stage name for export name prefixes
   */
  private createOutputs(stageName: string): void {
    new cdk.CfnOutput(this, "VpcId", {
      value: this.vpc.vpcId,
      description: `VPC ID for ${stageName} environment`,
      exportName: `${stageName}-vpc-id`,
    });

    new cdk.CfnOutput(this, "PublicSubnetIds", {
      value: this.vpc.publicSubnets.map(s => s.subnetId).join(","),
      description: `Public subnet IDs for ${stageName} environment`,
      exportName: `${stageName}-public-subnet-ids`,
    });

    new cdk.CfnOutput(this, "PrivateSubnetIds", {
      value: this.vpc.privateSubnets.map(s => s.subnetId).join(","),
      description: `Private subnet IDs for ${stageName} environment`,
      exportName: `${stageName}-private-subnet-ids`,
    });

    new cdk.CfnOutput(this, "IsolatedSubnetIds", {
      value: this.vpc.isolatedSubnets.map(s => s.subnetId).join(","),
      description: `Isolated subnet IDs for ${stageName} environment`,
      exportName: `${stageName}-isolated-subnet-ids`,
    });

    new cdk.CfnOutput(this, "AvailabilityZones", {
      value: this.vpc.availabilityZones.join(","),
      description: `Availability zones for ${stageName} environment`,
      exportName: `${stageName}-availability-zones`,
    });
  }
}
