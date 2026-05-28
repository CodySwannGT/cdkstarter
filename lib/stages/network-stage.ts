/**
 * Network Stage - VPC and Security Groups Orchestration
 *
 * This stage creates the foundational network infrastructure for an environment.
 * It must deploy before the App stage as database and cache stacks depend on
 * VPC and security groups.
 *
 * ## Deployment Order
 *
 * 1. VpcStack - Creates VPC with subnets
 * 2. SecurityGroupsStack - Creates security groups using VPC
 *
 * ## Cross-Stage Exports
 *
 * This stage exports:
 * - VPC ID and subnet IDs
 * - Security group IDs for Aurora, Valkey, Lambda
 * @see lib/stacks/network/vpc-stack.ts
 * @see lib/stacks/network/security-groups-stack.ts
 * @module lib/stages/network-stage
 */
import * as cdk from "aws-cdk-lib";
import type { Construct } from "constructs";
import { SecurityGroupsStack } from "../stacks/network/security-groups-stack";
import { VpcStack } from "../stacks/network/vpc-stack";
import type { StageEnvironment } from "../types";

/**
 * Configuration properties for NetworkStage.
 */
export interface NetworkStageProps extends cdk.StageProps {
  /**
   * Stage environment configuration.
   */
  readonly environment: StageEnvironment;
}

/**
 * Network Stage creating VPC and security groups for an environment.
 */
export class NetworkStage extends cdk.Stage {
  /**
   * The VPC stack.
   */
  public readonly vpcStack: VpcStack;

  /**
   * The security groups stack.
   */
  public readonly securityGroupsStack: SecurityGroupsStack;

  /**
   * Creates a new NetworkStage.
   * @param scope - Parent construct
   * @param id - Stage identifier
   * @param props - Stage configuration
   */
  constructor(scope: Construct, id: string, props: NetworkStageProps) {
    super(scope, id, props);

    const { environment } = props;
    const { name: stageName, network } = environment;

    // Production gets 2 NAT gateways for HA, others get 1 for cost savings
    const natGatewayCount = stageName === "production" ? 2 : 1;
    // Flow logs enabled for staging and production
    const enableFlowLogs = stageName !== "dev";

    this.vpcStack = new VpcStack(this, "VpcStack", {
      stageName,
      vpcCidr: network.vpcCidr,
      natGatewayCount,
      enableFlowLogs,
      stackName: `${stageName}-vpc`,
    });

    this.securityGroupsStack = new SecurityGroupsStack(
      this,
      "SecurityGroupsStack",
      {
        stageName,
        vpc: this.vpcStack.vpc,
        stackName: `${stageName}-security-groups`,
      }
    );

    this.securityGroupsStack.addDependency(this.vpcStack);
  }
}
