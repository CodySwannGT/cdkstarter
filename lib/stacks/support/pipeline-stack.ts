/**
 * Pipeline Stack - Self-Mutating CDK Pipeline for Multi-Account Deployment
 *
 * Creates a CodePipeline (V2) that sources this repository from GitHub via
 * AWS CodeConnections (no token rotation), synthesizes the CDK app, and
 * deploys every stage in order — self-mutating when the pipeline definition
 * itself changes.
 *
 * ## Stage Ordering and Promotion Gates
 *
 * Stages deploy in this order:
 *
 * 1. SupportStage (shared account: DNS, trust docs, flow logs, RAM share)
 * 2. AgentOperationsStage (when enabled)
 * 3. Per environment, in config order: EnvironmentStage, then CicdStage
 *
 * Promotion gates attach at the ENVIRONMENT BOUNDARY: when an environment
 * sets `deployment.requireManualApproval`, a ManualApprovalStep is added as
 * a `pre` step on that environment's first stage — the pipeline pauses
 * before touching the environment, never mid-environment. With the default
 * config only production is gated, so dev→staging flows automatically
 * (faster iteration) while production stays protected by both the approval
 * and a ConfirmPermissionsBroadening check that publishes to the security
 * SNS topic when an IAM change widens permissions.
 * @see lib/stages/environment-stage.ts - Per-environment composition
 * @see lib/stages/support-stage.ts - Shared account stage
 * @see config/github.ts - Source repository and connection configuration
 * @see https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.pipelines-readme.html
 * @module lib/stacks/support/pipeline-stack
 */
import * as cdk from "aws-cdk-lib";
import {
  BuildEnvironmentVariableType,
  BuildSpec,
  LinuxBuildImage,
} from "aws-cdk-lib/aws-codebuild";
import {
  PipelineNotificationEvents,
  PipelineType,
} from "aws-cdk-lib/aws-codepipeline";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import {
  CodePipeline,
  CodePipelineSource,
  ConfirmPermissionsBroadening,
  ManualApprovalStep,
  ShellStep,
} from "aws-cdk-lib/pipelines";
import type { Construct } from "constructs";
import { AgentOperationsStage } from "../../stages/agent-operations-stage";
import { CicdStage } from "../../stages/cicd-stage";
import { EnvironmentStage } from "../../stages/environment-stage";
import { SupportStage } from "../../stages/support-stage";
import type {
  AgentOperationsConfig,
  AlarmThresholds,
  DomainConfig,
  GitHubConfig,
  StageEnvironment,
  SupportEnvironment,
} from "../../types";

/**
 * Name of the manual approval step, exported so external tooling
 * (for example an auto-approver bot) can locate the gate by name.
 */
export const MANUAL_APPROVAL_STEP_NAME = "approval";

/**
 * Whether a manual promotion gate should pause the pipeline before this
 * environment deploys. Driven by per-environment config so the gating
 * policy lives in config/environments.ts, not in pipeline code.
 * @param environment - Stage environment configuration
 * @returns True when the pipeline must pause for approval
 */
export const shouldAddManualApproval = (
  environment: StageEnvironment
): boolean => environment.deployment.requireManualApproval;

/**
 * Configuration properties for PipelineStack.
 */
export interface PipelineStackProps extends cdk.StackProps {
  /**
   * GitHub configuration (source repo, branch, connection ARN).
   */
  readonly github: GitHubConfig;

  /**
   * Deployable stage environments, in deployment order.
   */
  readonly stageEnvironments: readonly StageEnvironment[];

  /**
   * The shared support environment hosting this pipeline.
   */
  readonly supportEnvironment: SupportEnvironment;

  /**
   * Domain configuration for the support stage.
   */
  readonly domainConfig: DomainConfig;

  /**
   * Alarm thresholds passed through to environment stages.
   */
  readonly alarmThresholds: AlarmThresholds;

  /**
   * CDK bootstrap qualifier for bootstrap role names.
   */
  readonly bootstrapQualifier: string;

  /**
   * CloudFormation execution policy ARN for bootstrap documentation.
   */
  readonly executionPolicyArn: string;

  /**
   * Agent operations configuration; the stage is added when enabled and
   * an ExternalId is provided.
   */
  readonly agentOperations?: AgentOperationsConfig;

  /**
   * ExternalId for the agent operations roles
   * (AGENT_OPERATIONS_EXTERNAL_ID).
   */
  readonly agentOperationsExternalId?: string;
}

/**
 * Pipeline Stack creating the self-mutating CDK Pipeline.
 */
export class PipelineStack extends cdk.Stack {
  /**
   * The CDK Pipeline.
   */
  public readonly pipeline: CodePipeline;

  /**
   * Creates a new PipelineStack.
   * @param scope - Parent construct
   * @param id - Stack identifier
   * @param props - Stack configuration
   */
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const { github, stageEnvironments, supportEnvironment } = props;

    if (!github.codeConnectionArn.startsWith("arn:")) {
      throw new Error(
        "A real CodeConnections connection ARN is required in config/github.ts " +
          "to create the pipeline. Create the connection in the AWS Console " +
          "(CodePipeline > Settings > Connections) and update the config."
      );
    }

    // The pipeline needs to create and mutate arbitrary infrastructure
    // across stages; the deployment itself happens via the CDK bootstrap
    // roles in the target accounts.
    const pipelineRole = new iam.Role(this, "CustomPipelineRole", {
      assumedBy: new iam.ServicePrincipal("codepipeline.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess"),
      ],
    });

    this.pipeline = new CodePipeline(this, "Pipeline", {
      pipelineName: "InfrastructurePipeline",
      pipelineType: PipelineType.V2,
      crossAccountKeys: true,
      role: pipelineRole,
      synth: new ShellStep("Synth", {
        input: CodePipelineSource.connection(
          `${github.owner}/${github.infrastructureRepo}`,
          github.branch,
          { connectionArn: github.codeConnectionArn }
        ),
        commands: ["npm ci", "npm run build", "npx cdk synth"],
        primaryOutputDirectory: "cdk.out",
      }),
      synthCodeBuildDefaults: {
        buildEnvironment: {
          buildImage: LinuxBuildImage.STANDARD_7_0,
          // The ExternalId has to exist at SYNTH time, and synthesis happens
          // here — inside CodeBuild — not on the workstation that deployed
          // this stack. Exporting AGENT_OPERATIONS_EXTERNAL_ID locally sets it
          // for the local `cdk deploy` of this pipeline and for nothing the
          // pipeline subsequently synthesizes, so without this the guard in
          // bin/app.ts is false on every self-mutation and the agent-operations
          // stage is dropped. Silently: a missing optional value is not an
          // error, which is why the stage can appear to deploy and never do so.
          //
          // Keyed off `enabled` alone, deliberately NOT off the local presence
          // of the value. Requiring it locally would reintroduce the same
          // bootstrap problem one level up.
          ...(props.agentOperations?.enabled
            ? {
                environmentVariables: {
                  AGENT_OPERATIONS_EXTERNAL_ID: {
                    // SECRETS_MANAGER resolves in the build container at build
                    // time. A plain value, or a SecretValue rendered into the
                    // template, would place the ExternalId in the CodeBuild
                    // project definition, readable by anyone with
                    // codebuild:BatchGetProjects.
                    type: BuildEnvironmentVariableType.SECRETS_MANAGER,
                    value: props.agentOperations.externalIdSecretName,
                  },
                },
              }
            : {}),
        },
        partialBuildSpec: BuildSpec.fromObject({
          phases: {
            install: {
              "runtime-versions": {
                nodejs: "22",
              },
            },
          },
        }),
      },
    });

    // Topic for security change notifications (permissions broadening)
    const securityTopic = new sns.Topic(this, "SecurityChangesTopic");
    if (github.notificationEmail) {
      securityTopic.addSubscription(
        new subscriptions.EmailSubscription(github.notificationEmail)
      );
    }

    // Shared account infrastructure deploys first — DNS zones and trust
    // documentation are prerequisites for the stage environments.
    this.pipeline.addStage(
      new SupportStage(this, "Support", {
        supportEnvironment,
        domainConfig: props.domainConfig,
        deployableEnvironments: stageEnvironments,
        bootstrapQualifier: props.bootstrapQualifier,
        executionPolicyArn: props.executionPolicyArn,
        github,
        codeConnectionConfigured: true,
        env: {
          account: supportEnvironment.accountId,
          region: supportEnvironment.region,
        },
      })
    );

    // Headless agent role (per member account) + dedicated user (shared
    // account). Each child stack targets its own account via explicit env.
    if (props.agentOperations?.enabled && props.agentOperationsExternalId) {
      this.pipeline.addStage(
        new AgentOperationsStage(this, "AgentOperations", {
          agentOperations: props.agentOperations,
          externalId: props.agentOperationsExternalId,
          stageEnvironments,
          sharedEnvironment: supportEnvironment,
        })
      );
    }

    stageEnvironments.forEach(environment => {
      const environmentStage = new EnvironmentStage(
        this,
        `Env-${environment.name}`,
        {
          environment,
          alarmThresholds: props.alarmThresholds,
          github,
          domainConfig: props.domainConfig,
          env: { account: environment.accountId, region: environment.region },
        }
      );

      const addedEnvironmentStage = this.pipeline.addStage(environmentStage);

      // Attach the promotion gate at the ENVIRONMENT BOUNDARY — as a pre
      // step on the environment's first (and only) stage — so the pipeline
      // pauses before touching the environment, never mid-environment.
      if (shouldAddManualApproval(environment)) {
        addedEnvironmentStage.addPre(
          new ManualApprovalStep(MANUAL_APPROVAL_STEP_NAME)
        );
      }

      // Security review gate: block production deploys that broaden IAM
      // permissions until a human confirms, notifying the security topic.
      if (environment.name === "production") {
        addedEnvironmentStage.addPre(
          new ConfirmPermissionsBroadening("PermissionCheck", {
            stage: environmentStage,
            notificationTopic: securityTopic,
          })
        );
      }

      if (environment.features.githubOidcDeploy) {
        this.pipeline.addStage(
          new CicdStage(this, `Cicd-${environment.name}`, {
            environment,
            github,
            sharedAccountId: supportEnvironment.accountId,
            bootstrapQualifier: props.bootstrapQualifier,
            env: {
              account: environment.accountId,
              region: environment.region,
            },
          })
        );
      }
    });

    // A failed deploy is an incident: notify the security topic's
    // subscribers. buildPipeline() finalizes the pipeline so the underlying
    // CodePipeline resource exists to attach the notification rule to.
    this.pipeline.buildPipeline();
    this.pipeline.pipeline.notifyOn(
      "PipelineFailureNotifications",
      securityTopic,
      {
        events: [PipelineNotificationEvents.PIPELINE_EXECUTION_FAILED],
      }
    );
  }
}
