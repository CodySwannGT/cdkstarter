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
 * 3. SsmRelayStack - SSM port-forwarding relay (if enabled)
 * 4. MigrationRunnerStack - In-VPC GitHub Actions runner (if enabled)
 *
 * The relay and migration runner live here (rather than in App/CI stages)
 * because they need the VPC and security group objects; keeping them in the
 * same stage avoids cross-stage construct references, which CDK forbids.
 *
 * ## Cross-Stage Exports
 *
 * This stage exports:
 * - VPC ID and subnet IDs
 * - Security group IDs for Aurora, Valkey, Lambda (and relay/runner if enabled)
 * @see lib/stacks/network/vpc-stack.ts
 * @see lib/stacks/network/security-groups-stack.ts
 * @see lib/stacks/network/ssm-relay-stack.ts
 * @see lib/stacks/cicd/migration-runner-stack.ts
 * @module lib/stages/network-stage
 */
import * as cdk from "aws-cdk-lib";
import type { Construct } from "constructs";
import { MigrationRunnerStack } from "../stacks/cicd/migration-runner-stack";
import { SecurityGroupsStack } from "../stacks/network/security-groups-stack";
import { SsmRelayStack } from "../stacks/network/ssm-relay-stack";
import { VpcStack } from "../stacks/network/vpc-stack";
import type { GitHubConfig, StageEnvironment } from "../types";

/**
 * Configuration properties for NetworkStage.
 */
export interface NetworkStageProps extends cdk.StageProps {
  /**
   * Stage environment configuration.
   */
  readonly environment: StageEnvironment;

  /**
   * GitHub configuration; required when features.migrationRunner is enabled.
   */
  readonly github?: GitHubConfig;
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
   * The SSM relay stack (if enabled).
   */
  public readonly ssmRelayStack?: SsmRelayStack;

  /**
   * The migration runner stack (if enabled).
   */
  public readonly migrationRunnerStack?: MigrationRunnerStack;

  /**
   * Creates a new NetworkStage.
   * @param scope - Parent construct
   * @param id - Stage identifier
   * @param props - Stage configuration
   */
  constructor(scope: Construct, id: string, props: NetworkStageProps) {
    super(scope, id, props);

    const { environment, github } = props;
    const { name: stageName, network, features } = environment;

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
        createSsmRelaySecurityGroup: features.ssmRelay,
        createMigrationRunnerSecurityGroup: features.migrationRunner,
        stackName: `${stageName}-security-groups`,
      }
    );

    this.securityGroupsStack.addDependency(this.vpcStack);

    if (features.ssmRelay && this.securityGroupsStack.ssmRelaySecurityGroup) {
      this.ssmRelayStack = new SsmRelayStack(this, "SsmRelayStack", {
        stageName,
        vpc: this.vpcStack.vpc,
        securityGroup: this.securityGroupsStack.ssmRelaySecurityGroup,
        stackName: `${stageName}-ssm-relay`,
      });
      this.ssmRelayStack.addDependency(this.securityGroupsStack);
    }

    if (
      features.migrationRunner &&
      github &&
      this.securityGroupsStack.migrationRunnerSecurityGroup
    ) {
      this.migrationRunnerStack = new MigrationRunnerStack(
        this,
        "MigrationRunnerStack",
        {
          stageName,
          github,
          vpc: this.vpcStack.vpc,
          securityGroup: this.securityGroupsStack.migrationRunnerSecurityGroup,
          stackName: `${stageName}-migration-runner`,
        }
      );
      this.migrationRunnerStack.addDependency(this.securityGroupsStack);
    }
  }
}
