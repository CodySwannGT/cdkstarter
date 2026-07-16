/**
 * Support Stage - Shared Account Infrastructure Orchestration
 *
 * This stage creates centralized infrastructure in the shared account that
 * all stage environments depend on. It runs first in the pipeline before
 * any environment-specific stages.
 *
 * ## Why Support Stage Runs First
 *
 * The shared account provides foundational resources that other stages need:
 * - **DNS**: Route53 hosted zones must exist before ACM certificates can be
 *   created in stage accounts
 * - **Trust Policies**: CDK bootstrap roles must be configured to trust the
 *   pipeline account before cross-account deployments can succeed
 *
 * ## Conditional Stack Creation
 *
 * - **DnsStack**: Only created if domains are configured (domains are optional)
 * - **TrustPolicyStack**: One created per deployable environment
 *
 * ## Stack Order
 *
 * 1. DnsStack (if domains configured)
 * 2. TrustPolicyStack (per deployable environment)
 * @see lib/stacks/support/dns-stack.ts - Route53 hosted zones
 * @see lib/stacks/support/trust-policy-stack.ts - CDK bootstrap trust
 * @module lib/stages/support-stage
 */
import * as cdk from "aws-cdk-lib";
import type { Construct } from "constructs";
import { CodeConnectionsShareStack } from "../stacks/support/codeconnections-share-stack";
import { DnsStack } from "../stacks/support/dns-stack";
import { FlowLogsStack } from "../stacks/support/flow-logs-stack";
import { TrustPolicyStack } from "../stacks/support/trust-policy-stack";
import type {
  DomainConfig,
  GitHubConfig,
  StageEnvironment,
  SupportEnvironment,
} from "../types";

/**
 * Configuration properties for SupportStage.
 */
export interface SupportStageProps extends cdk.StageProps {
  /**
   * Support environment configuration (shared account details).
   */
  readonly supportEnvironment: SupportEnvironment;

  /**
   * Domain configuration for DNS setup.
   * If domains array is empty, DnsStack is skipped.
   */
  readonly domainConfig: DomainConfig;

  /**
   * Environments that will be deployed to.
   * TrustPolicyStack is created for each environment.
   */
  readonly deployableEnvironments: readonly StageEnvironment[];

  /**
   * CDK bootstrap qualifier for role naming.
   * Defaults to "hnb659fds".
   */
  readonly bootstrapQualifier?: string;

  /**
   * CloudFormation execution policy ARN for bootstrap.
   * Defaults to AdministratorAccess.
   */
  readonly executionPolicyArn?: string;

  /**
   * GitHub configuration. When the CodeConnections connection ARN is real
   * (not a placeholder) and deployable environments exist, the connection
   * is RAM-shared to the stage accounts.
   */
  readonly github?: GitHubConfig;

  /**
   * Whether the GitHub CodeConnections connection ARN is configured.
   */
  readonly codeConnectionConfigured?: boolean;
}

/**
 * Support Stage creating shared account infrastructure.
 *
 * This stage orchestrates DNS and trust policy setup in the shared account.
 * It provides the foundation for cross-account deployments to stage environments.
 */
export class SupportStage extends cdk.Stage {
  /**
   * The DNS stack (only if domains configured).
   */
  public readonly dnsStack?: DnsStack;

  /**
   * Trust policy stacks for each deployable environment.
   */
  public readonly trustPolicyStacks: readonly TrustPolicyStack[];

  /**
   * The central flow logs stack (only if the purpose flag is enabled).
   */
  public readonly flowLogsStack?: FlowLogsStack;

  /**
   * The CodeConnections RAM share stack (only when the connection is
   * configured and deployable environments exist).
   */
  public readonly codeConnectionsShareStack?: CodeConnectionsShareStack;

  /**
   * The support environment configuration.
   */
  public readonly supportEnvironment: SupportEnvironment;

  /**
   * Creates a new SupportStage.
   * @param scope - Parent construct
   * @param id - Stage identifier
   * @param props - Stage configuration
   */
  constructor(scope: Construct, id: string, props: SupportStageProps) {
    super(scope, id, props);

    const {
      supportEnvironment,
      domainConfig,
      deployableEnvironments,
      bootstrapQualifier,
      executionPolicyArn,
    } = props;

    this.supportEnvironment = supportEnvironment;

    // Create DNS only when the support account opts in and domains exist.
    if (supportEnvironment.purpose.dns && domainConfig.domains.length > 0) {
      this.dnsStack = new DnsStack(this, "DnsStack", {
        domainConfig,
        stackName: `${supportEnvironment.name}-dns`,
      });
    }

    // Create trust policy stack for each deployable environment
    this.trustPolicyStacks = deployableEnvironments.map(
      env =>
        new TrustPolicyStack(this, `TrustPolicy-${env.name}`, {
          stageName: env.name,
          targetAccountId: env.accountId,
          pipelineAccountId: supportEnvironment.accountId,
          targetRegion: env.region,
          bootstrapQualifier,
          executionPolicyArn,
          stackName: `${supportEnvironment.name}-trust-${env.name}`,
        })
    );

    // Central flow-log sink receiving VPC flow logs from all stage accounts
    if (supportEnvironment.purpose.flowLogs) {
      this.flowLogsStack = new FlowLogsStack(this, "FlowLogsStack", {
        sources: deployableEnvironments.map(env => ({
          accountId: env.accountId,
          region: env.region,
        })),
        stackName: `${supportEnvironment.name}-flow-logs`,
      });
    }

    // Share the GitHub CodeConnections connection with stage accounts so
    // their CodeBuild projects (e.g. the migration runner) can use it
    if (
      props.github &&
      props.codeConnectionConfigured &&
      supportEnvironment.purpose.codeConnections &&
      deployableEnvironments.length > 0
    ) {
      this.codeConnectionsShareStack = new CodeConnectionsShareStack(
        this,
        "CodeConnectionsShareStack",
        {
          codeConnectionArn: props.github.codeConnectionArn,
          principalAccountIds: deployableEnvironments.map(env => env.accountId),
          stackName: `${supportEnvironment.name}-codeconnections-share`,
        }
      );
    }
  }
}
