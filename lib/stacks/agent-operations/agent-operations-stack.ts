/**
 * Agent Operations Stack - Per-Account Remote Agent Role
 *
 * Provides the headless remote-agent assume-role used by autonomous agents
 * (for example Claude Code remote routines). The role carries the permissions
 * defined verbatim in `agent-operations-policy.json`, kept as a JSON document
 * so it can be mirrored from (or into) an IAM Identity Center permission set
 * without translation drift.
 *
 * ## Trust Model
 *
 * The role trusts exactly one principal: the dedicated assume-only agent user
 * in the shared account, gated by an ExternalId condition on `sts:AssumeRole`
 * (confused-deputy protection). The role is deployed identically into every
 * member account so agent AWS profiles vary only by account ID.
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

    const { agentOperations, trustedUserArn, externalId } = props;

    const policy = new iam.ManagedPolicy(this, "AgentOperationsPolicy", {
      managedPolicyName: agentOperations.policyName,
      description:
        "Permissions for headless agent operations; keep in sync with the " +
        "matching IAM Identity Center permission set if one exists.",
      document: iam.PolicyDocument.fromJson(agentOperationsPolicy),
    });

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

    new cdk.CfnOutput(this, "RemoteAgentRoleArn", {
      value: this.role.roleArn,
      description: "ARN of the remote-agent role in this account",
    });
  }
}
