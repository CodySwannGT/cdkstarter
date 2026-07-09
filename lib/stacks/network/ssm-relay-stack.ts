/**
 * SSM Relay Stack - Session Manager Port-Forwarding Relay
 *
 * Provisions a single t4g.nano EC2 instance in a private subnet with the SSM
 * agent enabled. Developers use `aws ssm start-session` against this instance
 * to port-forward to Aurora (5432) and Valkey (6379) WITHOUT needing a Client
 * VPN — the developer-side counterpart to the in-VPC CI migration runner.
 *
 * The instance is managed by an Auto Scaling Group (min=max=desired=1) so
 * the relay self-heals if the instance terminates. Helper scripts discover
 * the live instance via the SSM Parameter published here (falling back to
 * the `Role=ssm-relay` + `Environment=<stage>` tags).
 * @see scripts/connect-db.sh - Raw tunnel helper
 * @see scripts/psql-iam.sh - psql via RDS Proxy IAM auth
 * @see scripts/psql-secret.sh - psql via Secrets Manager password
 * @module lib/stacks/network/ssm-relay-stack
 */
import * as cdk from "aws-cdk-lib";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ssm from "aws-cdk-lib/aws-ssm";
import type { Construct } from "constructs";

/**
 * SSM Parameter path where the relay Auto Scaling Group name is published
 * per stage. Developer convenience scripts read this to resolve the live
 * relay instance without paying for an `ec2:DescribeInstances` roundtrip.
 *
 * The `/platform/` prefix avoids the AWS-reserved `ssm` parameter-name
 * prefix. Keep in sync with scripts/connect-db.sh and friends.
 * @param stageName - Target deployment environment
 * @returns The fully qualified SSM Parameter name for the stage
 */
export const ssmRelayAsgParameterName = (stageName: string): string =>
  `/platform/ssm-relay/${stageName}/asg-name`;

/**
 * Configuration properties for SsmRelayStack.
 */
export interface SsmRelayStackProps extends cdk.StackProps {
  /**
   * Stage name for resource naming and tagging.
   */
  readonly stageName: string;

  /**
   * VPC where the relay instance runs.
   */
  readonly vpc: ec2.IVpc;

  /**
   * Security group attached to the relay; must be allowed ingress on the
   * Aurora/Valkey security groups for the ports being forwarded.
   */
  readonly securityGroup: ec2.ISecurityGroup;
}

/**
 * SSM relay stack.
 *
 * Creates an ASG-managed EC2 instance used as a Session Manager target for
 * port forwarding into the VPC.
 */
export class SsmRelayStack extends cdk.Stack {
  /**
   * The Auto Scaling Group managing the single relay instance.
   */
  public readonly autoScalingGroup: autoscaling.AutoScalingGroup;

  /**
   * Creates the SSM relay ASG.
   * @param scope - Parent construct
   * @param id - Stack identifier
   * @param props - Stack configuration including stage, VPC, and relay SG
   */
  constructor(scope: Construct, id: string, props: SsmRelayStackProps) {
    super(scope, id, props);

    const { stageName, vpc, securityGroup } = props;

    const role = new iam.Role(this, "SsmRelayRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      description: "Role for the SSM relay EC2 instance",
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore"
        ),
      ],
    });

    const machineImage = ec2.MachineImage.latestAmazonLinux2023({
      cpuType: ec2.AmazonLinuxCpuType.ARM_64,
    });

    const launchTemplate = new ec2.LaunchTemplate(
      this,
      "SsmRelayLaunchTemplate",
      {
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.T4G,
          ec2.InstanceSize.NANO
        ),
        machineImage,
        role,
        securityGroup,
        requireImdsv2: true,
      }
    );

    this.autoScalingGroup = new autoscaling.AutoScalingGroup(
      this,
      "SsmRelayAsg",
      {
        vpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        launchTemplate,
        minCapacity: 1,
        maxCapacity: 1,
        desiredCapacity: 1,
        autoScalingGroupName: `ssm-relay-${stageName}`,
      }
    );

    cdk.Tags.of(this.autoScalingGroup).add("Role", "ssm-relay");
    cdk.Tags.of(this.autoScalingGroup).add("Environment", stageName);
    cdk.Tags.of(this.autoScalingGroup).add("Name", `ssm-relay-${stageName}`);

    new ssm.StringParameter(this, "SsmRelayAsgNameParameter", {
      parameterName: ssmRelayAsgParameterName(stageName),
      stringValue: this.autoScalingGroup.autoScalingGroupName,
      description: `Auto Scaling Group name for the ${stageName} SSM port-forwarding relay`,
    });

    new cdk.CfnOutput(this, "SsmRelayAutoScalingGroupName", {
      value: this.autoScalingGroup.autoScalingGroupName,
      description: "Name of the SSM relay Auto Scaling Group",
      exportName: `${stageName}-ssm-relay-asg-name`,
    });
  }
}
