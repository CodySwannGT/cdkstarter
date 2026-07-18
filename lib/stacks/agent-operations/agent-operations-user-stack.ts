/**
 * Agent Operations User Stack - Dedicated Headless Agent User
 *
 * Creates the dedicated remote-agent IAM user in the shared account. Its
 * long-lived access key and role-profile metadata are stored as one bootstrap
 * bundle. Remote coding environments receive that bundle as the single
 * `LISA_AWS_BOOTSTRAP_JSON` secret and materialize short-lived role profiles
 * with Lisa's vendor-neutral setup script.
 *
 * ## Blast Radius
 *
 * The user holds NO permissions of its own except `sts:AssumeRole` on the
 * per-account remote-agent roles — so a leaked key only grants "assume one
 * scoped role", and the agent's actual permissions always arrive as
 * short-lived STS credentials.
 * @see lib/stacks/agent-operations/agent-operations-stack.ts - The per-account roles
 * @see config/agent-operations.ts - Names and enablement
 * @module lib/stacks/agent-operations/agent-operations-user-stack
 */
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";
import type { AgentOperationsConfig } from "../../types";

/**
 * Configuration properties for AgentOperationsUserStack.
 */
export interface AgentOperationsUserStackProps extends cdk.StackProps {
  /**
   * Agent operations configuration (user/secret names).
   */
  readonly agentOperations: AgentOperationsConfig;

  /**
   * ARNs of the per-account remote-agent roles the user may assume.
   */
  readonly roleArns: readonly string[];

  /** ExternalId required by every remote-agent role trust policy. */
  readonly externalId: string;

  /** Non-secret profile metadata used to generate remote AWS CLI profiles. */
  readonly profiles: Readonly<
    Record<
      string,
      {
        readonly roleArn: string;
        readonly region: string;
      }
    >
  >;
}

/**
 * Deploys the dedicated remote-agent user, its access key (stored in
 * Secrets Manager), and an assume-role policy scoped to the remote-agent
 * role ARNs.
 */
export class AgentOperationsUserStack extends cdk.Stack {
  /**
   * The dedicated remote-agent user.
   */
  public readonly user: iam.User;

  /**
   * Creates the dedicated remote-agent user, its access key, and the
   * scoped assume-role policy.
   * @param scope - Parent construct
   * @param id - Stack identifier
   * @param props - Stack configuration including the role ARNs to allow assuming
   */
  constructor(
    scope: Construct,
    id: string,
    props: AgentOperationsUserStackProps
  ) {
    super(scope, id, props);

    const { agentOperations, roleArns, externalId, profiles } = props;

    this.user = new iam.User(this, "RemoteAgentUser", {
      userName: agentOperations.userName,
    });

    // The ONLY thing this user can do: assume the per-account remote-agent roles.
    this.user.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["sts:AssumeRole"],
        resources: [...roleArns],
      })
    );

    const accessKey = new iam.AccessKey(this, "RemoteAgentAccessKey", {
      user: this.user,
    });

    const credentialsSecret = new secretsmanager.Secret(
      this,
      "RemoteAgentCredentials",
      {
        secretName: agentOperations.secretName,
        description:
          `Vendor-neutral bootstrap bundle for the headless ${agentOperations.userName} user. ` +
          "Set the complete SecretString as LISA_AWS_BOOTSTRAP_JSON in a remote coding environment.",
        secretObjectValue: {
          accessKeyId: cdk.SecretValue.resourceAttribute(accessKey.accessKeyId),
          secretAccessKey: accessKey.secretAccessKey,
          externalId: cdk.SecretValue.unsafePlainText(externalId),
          roleName: cdk.SecretValue.unsafePlainText(agentOperations.roleName),
          profiles: cdk.SecretValue.unsafePlainText(JSON.stringify(profiles)),
        },
      }
    );

    new cdk.CfnOutput(this, "RemoteAgentAccessKeyId", {
      value: accessKey.accessKeyId,
      description: `Access Key ID for the ${agentOperations.userName} user`,
    });
    new cdk.CfnOutput(this, "RemoteAgentCredentialsArn", {
      value: credentialsSecret.secretArn,
      description: `ARN of the secret holding the ${agentOperations.userName} access key`,
    });
  }
}
