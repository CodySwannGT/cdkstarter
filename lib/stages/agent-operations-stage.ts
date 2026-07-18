/**
 * Agent Operations Stage - Multi-Account Remote Agent Provisioning
 *
 * Deploys the remote-agent role + agent operations policy into every
 * deployable account (each stage account plus the shared account), and the
 * dedicated assume-only agent user into the shared account. Each stack
 * targets its own account via an explicit `env`.
 *
 * ## Why the Shared Account Also Gets a Role
 *
 * Agents often need to inspect shared-account resources (pipeline state,
 * DNS, CodeConnections), so an observer-only role is deployed there too. Role
 * names remain stable across accounts while attached permissions vary by the
 * environment's configured repair eligibility.
 * @see lib/stacks/agent-operations/agent-operations-stack.ts - Per-account role
 * @see lib/stacks/agent-operations/agent-operations-user-stack.ts - Shared user
 * @see config/agent-operations.ts - Names and enablement
 * @module lib/stages/agent-operations-stage
 */
import * as cdk from "aws-cdk-lib";
import type { Construct } from "constructs";
import { AgentOperationsStack } from "../stacks/agent-operations/agent-operations-stack";
import { AgentOperationsUserStack } from "../stacks/agent-operations/agent-operations-user-stack";
import type {
  AgentOperationsConfig,
  StageEnvironment,
  SupportEnvironment,
} from "../types";

/**
 * Configuration properties for AgentOperationsStage.
 */
export interface AgentOperationsStageProps extends cdk.StageProps {
  /**
   * Agent operations configuration (names).
   */
  readonly agentOperations: AgentOperationsConfig;

  /**
   * ExternalId required on `sts:AssumeRole` (confused-deputy protection).
   * Sourced from the AGENT_OPERATIONS_EXTERNAL_ID environment variable.
   */
  readonly externalId: string;

  /**
   * Deployable stage environments receiving a remote-agent role.
   */
  readonly stageEnvironments: readonly StageEnvironment[];

  /**
   * The shared support environment hosting the dedicated user
   * (and its own remote-agent role).
   */
  readonly sharedEnvironment: SupportEnvironment;
}

/**
 * Stage that provisions the headless agent role in each member account and
 * the dedicated assume-role user in the shared account.
 */
export class AgentOperationsStage extends cdk.Stage {
  /**
   * Per-account role stacks, keyed by environment name.
   */
  public readonly roleStacks: readonly AgentOperationsStack[];

  /**
   * The dedicated user stack in the shared account.
   */
  public readonly userStack: AgentOperationsUserStack;

  /**
   * Deploys the remote-agent role into each member account and the
   * dedicated user into the shared account.
   * @param scope - Parent construct
   * @param id - Stage identifier
   * @param props - Stage configuration
   */
  constructor(scope: Construct, id: string, props: AgentOperationsStageProps) {
    super(scope, id, props);

    const {
      agentOperations,
      externalId,
      stageEnvironments,
      sharedEnvironment,
    } = props;

    if (!externalId) {
      throw new Error(
        "AGENT_OPERATIONS_EXTERNAL_ID is required when agent operations are enabled. " +
          "Generate one with `openssl rand -hex 16` and export it."
      );
    }

    const trustedUserArn = `arn:aws:iam::${sharedEnvironment.accountId}:user/${agentOperations.userName}`;

    // Member accounts receiving a remote-agent role: every deployable stage
    // account plus the shared account itself.
    const memberEnvironments: readonly {
      readonly name: string;
      readonly accountId: string;
      readonly region: string;
    }[] = [...stageEnvironments, sharedEnvironment];

    this.roleStacks = memberEnvironments.map(environment => {
      const repairEnabled = agentOperations.repairEnvironmentNames.includes(
        environment.name
      );

      return new AgentOperationsStack(
        this,
        `AgentOperations-${environment.name}`,
        {
          agentOperations,
          trustedUserArn,
          externalId,
          repairEnabled,
          env: { account: environment.accountId, region: environment.region },
          stackName: `${environment.name}-agent-operations`,
          description: `${agentOperations.roleName} ${repairEnabled ? "observer + repair" : "observer-only"} role in ${environment.name}`,
        }
      );
    });

    const roleArns = memberEnvironments.map(
      environment =>
        `arn:aws:iam::${environment.accountId}:role/${agentOperations.roleName}`
    );

    const profiles = Object.fromEntries(
      memberEnvironments.map(environment => [
        environment.name,
        {
          roleArn: `arn:aws:iam::${environment.accountId}:role/${agentOperations.roleName}`,
          region: environment.region,
        },
      ])
    );

    // The dedicated user lives in the shared account and may assume every role above.
    this.userStack = new AgentOperationsUserStack(this, "AgentOperationsUser", {
      agentOperations,
      roleArns,
      externalId,
      profiles,
      env: {
        account: sharedEnvironment.accountId,
        region: sharedEnvironment.region,
      },
      stackName: `${sharedEnvironment.name}-agent-operations-user`,
      description:
        `Dedicated ${agentOperations.userName} user (shared account) with ` +
        `sts:AssumeRole on the ${agentOperations.roleName} roles`,
    });
  }
}
