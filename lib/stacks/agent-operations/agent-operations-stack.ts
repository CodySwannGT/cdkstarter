/**
 * Agent Operations Stack - Per-Account Remote Agent Role
 *
 * Provides the headless remote-agent assume-role used by vendor-hosted or
 * self-hosted remote coding agents. The role carries the permissions
 * defined in separate observer and repair JSON documents. Every account gets
 * observer access. Repair access is attached only when the stage explicitly
 * marks the account as repair-enabled.
 *
 * ## Trust Model
 *
 * The role trusts exactly one principal: the dedicated assume-only agent user
 * in the shared account, gated by an ExternalId condition on `sts:AssumeRole`
 * (confused-deputy protection). The role name is identical in every member
 * account, while attached policies vary by repair eligibility.
 * @see lib/stacks/agent-operations/agent-operations-user-stack.ts - The trusted user
 * @see lib/stacks/agent-operations/agent-operations-policy.json - Permission document
 * @see config/agent-operations.ts - Names and enablement
 * @module lib/stacks/agent-operations/agent-operations-stack
 */
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";
import type { AgentOperationsConfig } from "../../types";
import agentOperationsPolicy from "./agent-operations-policy.json";
import agentOperationsRepairPolicy from "./agent-operations-repair-policy.json";

/**
 * Configuration properties for AgentOperationsStack.
 */
export interface AgentOperationsStackProps extends cdk.StackProps {
  /**
   * Agent operations configuration (role/policy names).
   */
  readonly agentOperations: AgentOperationsConfig;

  /**
   * ARN of the dedicated user (in the shared account) permitted to
   * assume the role.
   */
  readonly trustedUserArn: string;

  /**
   * ExternalId required on `sts:AssumeRole` (confused-deputy protection).
   */
  readonly externalId: string;

  /** Whether the standing role receives direct repair permissions. */
  readonly repairEnabled: boolean;
}

/**
 * Deploys the agent operations managed policy and the remote-agent role
 * into a single member account.
 */
export class AgentOperationsStack extends cdk.Stack {
  /**
   * The remote-agent role created in this account.
   */
  public readonly role: iam.Role;

  /**
   * Creates the agent operations managed policy and remote-agent role.
   * @param scope - Parent construct
   * @param id - Stack identifier
   * @param props - Stack configuration including the trusted user ARN and ExternalId
   */
  constructor(scope: Construct, id: string, props: AgentOperationsStackProps) {
    super(scope, id, props);

    const { agentOperations, trustedUserArn, externalId, repairEnabled } =
      props;

    const policy = new iam.ManagedPolicy(this, "AgentOperationsPolicy", {
      managedPolicyName: agentOperations.policyName,
      description:
        "Standing observer permissions for headless agent operations.",
      document: iam.PolicyDocument.fromJson(agentOperationsPolicy),
    });

    const repairPolicy = repairEnabled
      ? new iam.ManagedPolicy(this, "AgentOperationsRepairPolicy", {
          managedPolicyName: agentOperations.repairPolicyName,
          description:
            "Direct repair permissions for non-production headless agent operations.",
          document: iam.PolicyDocument.fromJson(agentOperationsRepairPolicy),
        })
      : undefined;

    this.role = new iam.Role(this, "RemoteAgentRole", {
      roleName: agentOperations.roleName,
      description:
        `Assumed by the ${agentOperations.userName} user (shared account) ` +
        "for headless agent operations in this account.",
      assumedBy: new iam.PrincipalWithConditions(
        new iam.ArnPrincipal(trustedUserArn),
        { StringEquals: { "sts:ExternalId": externalId } }
      ),
    });
    this.role.addManagedPolicy(policy);
    if (repairPolicy) {
      this.role.addManagedPolicy(repairPolicy);
    }

    new cdk.CfnOutput(this, "RemoteAgentRoleArn", {
      value: this.role.roleArn,
      description: "ARN of the remote-agent role in this account",
    });
  }
}
