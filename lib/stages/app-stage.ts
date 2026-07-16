/**
 * App Stage - Application Infrastructure Orchestration
 *
 * This stage creates the application infrastructure for an environment,
 * including databases, caches, and authentication services.
 *
 * ## Feature Flags
 *
 * Stacks are conditionally created based on feature flags in the environment
 * configuration. This enables cost optimization in development environments.
 *
 * ## Deployment Order
 *
 * 1. CognitoStack (if cognito enabled)
 * 2. AuroraStack (if aurora enabled)
 * 3. ValkeyStack (if valkey enabled)
 * 4. IamStack (if both cognito and aurora enabled)
 *
 * ## Cross-Stage Dependencies
 *
 * This stage depends on NetworkStage for VPC and security groups.
 * @see lib/stacks/auth/cognito-stack.ts
 * @see lib/stacks/database/aurora-stack.ts
 * @see lib/stacks/database/valkey-stack.ts
 * @see lib/stacks/auth/iam-stack.ts
 * @module lib/stages/app-stage
 */
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import type { Construct } from "constructs";
import { resolveCdnForStage } from "../../util/cdn";
import { CognitoStack } from "../stacks/auth/cognito-stack";
import { IamStack } from "../stacks/auth/iam-stack";
import { AuroraStack } from "../stacks/database/aurora-stack";
import { BackupStack } from "../stacks/database/backup-stack";
import { ValkeyStack } from "../stacks/database/valkey-stack";
import { AmplifyHostingStack } from "../stacks/edge/amplify-hosting-stack";
import { CdnStack } from "../stacks/edge/cdn-stack";
import type { DomainConfig, StageEnvironment } from "../types";

/**
 * Configuration properties for AppStage.
 */
export interface AppStageProps extends cdk.StageProps {
  /**
   * Stage environment configuration.
   */
  readonly environment: StageEnvironment;

  /**
   * VPC for database and cache stacks.
   */
  readonly vpc?: ec2.IVpc;

  /**
   * Security group for Aurora.
   */
  readonly auroraSecurityGroup?: ec2.ISecurityGroup;

  /**
   * Security group for Valkey.
   */
  readonly valkeySecurityGroup?: ec2.ISecurityGroup;

  /**
   * Domain configuration. Drives the conditional CloudFront + WAF edge; when
   * omitted or empty, no edge is created (a no-op).
   * @see util/cdn.ts - resolveCdnForStage
   */
  readonly domainConfig?: DomainConfig;
}

/**
 * App Stage creating application infrastructure for an environment.
 */
export class AppStage extends cdk.Stage {
  /**
   * The Cognito stack (if enabled).
   */
  public readonly cognitoStack?: CognitoStack;

  /**
   * The Aurora stack (if enabled).
   */
  public readonly auroraStack?: AuroraStack;

  /**
   * The Valkey stack (if enabled).
   */
  public readonly valkeyStack?: ValkeyStack;

  /**
   * The IAM stack.
   */
  public readonly iamStack?: IamStack;

  /**
   * The backup stack (if enabled).
   */
  public readonly backupStack?: BackupStack;

  /**
   * The conditional CloudFront + WAF edge stack (if a domain triggers it).
   */
  public readonly cdnStack?: CdnStack;

  /** The Amplify Hosting stack, when enabled. */
  public readonly amplifyHostingStack?: AmplifyHostingStack;

  /**
   * Creates a new AppStage.
   * @param scope - Parent construct
   * @param id - Stage identifier
   * @param props - Stage configuration
   */
  constructor(scope: Construct, id: string, props: AppStageProps) {
    super(scope, id, props);

    const {
      environment,
      vpc,
      auroraSecurityGroup,
      valkeySecurityGroup,
      domainConfig,
    } = props;
    const { name: stageName, features, aurora, valkey } = environment;

    // Create Cognito stack if enabled
    if (features.cognito) {
      this.cognitoStack = new CognitoStack(this, "CognitoStack", {
        stageName,
        stackName: `${stageName}-cognito`,
      });
    }

    // Create Aurora stack if enabled
    if (features.aurora) {
      if (!vpc || !auroraSecurityGroup) {
        throw new Error(
          `Stage ${stageName} enables Aurora but has no VPC/Aurora security group`
        );
      }
      this.auroraStack = new AuroraStack(this, "AuroraStack", {
        stageName,
        vpc,
        securityGroup: auroraSecurityGroup,
        aurora,
        stackName: `${stageName}-aurora`,
      });
    }

    // Create Valkey stack if enabled
    if (features.valkey) {
      if (!vpc || !valkeySecurityGroup) {
        throw new Error(
          `Stage ${stageName} enables Valkey but has no VPC/Valkey security group`
        );
      }
      this.valkeyStack = new ValkeyStack(this, "ValkeyStack", {
        stageName,
        vpc,
        securityGroup: valkeySecurityGroup,
        valkey,
        stackName: `${stageName}-valkey`,
      });
    }

    // Create IAM stack only if we have the required resources
    if (this.auroraStack && this.cognitoStack) {
      this.iamStack = new IamStack(this, "IamStack", {
        stageName,
        auroraClusterArn: this.auroraStack.cluster.clusterArn,
        auroraSecretArn: this.auroraStack.secret.secretArn,
        cognitoUserPoolArn: this.cognitoStack.userPool.userPoolArn,
        stackName: `${stageName}-iam`,
      });

      this.iamStack.addDependency(this.auroraStack);
      this.iamStack.addDependency(this.cognitoStack);
    }

    // Create tag-driven AWS Backup plan if enabled. Resources tagged
    // backup=yes anywhere in this account are included.
    if (features.backup) {
      this.backupStack = new BackupStack(this, "BackupStack", {
        stageName,
        stackName: `${stageName}-backup`,
      });
    }

    // Conditional CloudFront + WAF edge (production always; non-prod via
    // features.waf). No-op when no domain is configured for the stage.
    this.cdnStack = this.createEdgeStack(environment, domainConfig);

    this.amplifyHostingStack = this.createAmplifyHostingStack(environment);
  }

  /**
   * Creates the CloudFront + WAF edge for the HTTP API when a domain triggers
   * it (production always; a non-prod stage only via `features.waf`).
   * @param environment - Stage environment configuration
   * @param domainConfig - Domain configuration (undefined ⇒ no edge)
   * @returns The created CdnStack, or undefined when no edge is created
   */
  private createEdgeStack(
    environment: StageEnvironment,
    domainConfig?: DomainConfig
  ): CdnStack | undefined {
    if (!domainConfig) {
      return undefined;
    }
    const cdn = resolveCdnForStage(environment, domainConfig);
    if (!cdn) {
      return undefined;
    }
    return new CdnStack(this, "CdnStack", {
      stageName: environment.name,
      cdn,
      wafOptions: environment.wafOptions,
      stackName: `${environment.name}-cdn`,
    });
  }

  /**
   * Creates Amplify Hosting when both its feature flag and configuration are
   * present.
   * @param environment - Stage environment configuration
   * @returns Hosting stack or undefined when disabled
   */
  private createAmplifyHostingStack(
    environment: StageEnvironment
  ): AmplifyHostingStack | undefined {
    if (!environment.features.amplifyHosting || !environment.amplifyHosting) {
      return undefined;
    }

    return new AmplifyHostingStack(this, "AmplifyHostingStack", {
      stageName: environment.name,
      hosting: environment.amplifyHosting,
      stackName: `${environment.name}-amplify-hosting`,
    });
  }
}
