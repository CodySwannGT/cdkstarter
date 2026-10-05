/**
 * AWS Amplify Hosting for a statically generated frontend.
 *
 * The stack connects one repository branch to one Amplify app, runs the
 * configured static build, and serves the output from Amplify's default
 * domain unless an optional custom domain is supplied.
 * @module lib/stacks/edge/amplify-hosting-stack
 */
import * as amplify from "@aws-cdk/aws-amplify-alpha";
import * as cdk from "aws-cdk-lib";
import * as amplifyResources from "aws-cdk-lib/aws-amplify";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as sns from "aws-cdk-lib/aws-sns";
import {
  amplifyCustomRules,
  validateAmplifyHosting,
} from "../../../util/amplify-hosting";
import { renderBuildToolCommands } from "../../../util/amplify-build-tools";
import type { Construct } from "constructs";
import type { AmplifyHostingConfig } from "../../types";

/** Configuration properties for {@link AmplifyHostingStack}. */
export interface AmplifyHostingStackProps extends cdk.StackProps {
  /** Environment name used in resource names and outputs. */
  readonly stageName: string;

  /** Repository, build, and optional domain configuration. */
  readonly hosting: AmplifyHostingConfig;
}

/** Provisions an Amplify app and its auto-building source branch. */
export class AmplifyHostingStack extends cdk.Stack {
  /** Amplify application connected to the frontend repository. */
  public readonly app: amplify.App;

  /** Auto-building repository branch. */
  public readonly branch: amplify.Branch;

  /** Custom domain, when configured. */
  public readonly domain?: amplify.Domain;

  /**
   * Creates the hosting stack.
   * @param scope - Parent construct
   * @param id - Construct identifier
   * @param props - Stack configuration
   */
  constructor(scope: Construct, id: string, props: AmplifyHostingStackProps) {
    super(scope, id, props);

    const { stageName, hosting } = props;
    validateAmplifyHosting(hosting);

    this.app = new amplify.App(this, "FrontendApp", {
      appName: `${stageName}-frontend`,
      platform: amplify.Platform.WEB,
      sourceCodeProvider: new amplify.GitHubSourceCodeProvider({
        owner: hosting.owner,
        repository: hosting.repository,
        oauthToken: cdk.SecretValue.secretsManager(
          hosting.oauthTokenSecretName
        ),
      }),
      buildSpec: this.createBuildSpec(hosting),
      customRules: amplifyCustomRules(hosting).map(
        rule =>
          new amplify.CustomRule({
            ...rule,
            status: rule.status as amplify.RedirectStatus,
          })
      ),
    });

    this.createCustomHeaders(hosting);

    this.branch = this.app.addBranch("SourceBranch", {
      branchName: hosting.branch,
      autoBuild: true,
    });

    Object.entries(hosting.environmentVariables ?? {}).forEach(
      ([name, value]) => this.branch.addEnvironment(name, value)
    );

    this.domain = this.createDomain(hosting);
    this.createOutputs(stageName);
    this.createBuildFailureNotifications(hosting);
  }

  /**
   * Render opt-in headers with a YAML serializer rather than alpha's string interpolation.
   * @param hosting - Validated explicit header groups
   */
  private createCustomHeaders(hosting: AmplifyHostingConfig): void {
    if (!hosting.customHeaders?.length) return;
    const resource = this.app.node.defaultChild as amplifyResources.CfnApp;
    resource.customHeaders = codebuild.BuildSpec.fromObjectToYaml({
      customHeaders: hosting.customHeaders.map(group => ({
        pattern: group.pattern,
        headers: Object.entries(group.headers).map(([key, value]) => ({
          key,
          value,
        })),
      })),
    }).toBuildSpec(this);
  }

  /**
   * Create an exact failed-build rule with a scoped publish role, without replacing topic policies.
   * @param hosting - Explicit hosting options
   */
  private createBuildFailureNotifications(hosting: AmplifyHostingConfig): void {
    const notifications = hosting.buildFailureNotifications;
    if (!notifications?.enabled) return;
    const topic = sns.Topic.fromTopicArn(
      this,
      "BuildFailureTopic",
      notifications.topicArn!
    );
    new events.Rule(this, "BuildFailureRule", {
      description:
        "Routes this Amplify app's failed deployments to the configured topic",
      eventPattern: {
        source: ["aws.amplify"],
        detailType: ["Amplify Deployment Status Change"],
        detail: {
          appId: [this.app.appId],
          branchName: [...(notifications.branches ?? [hosting.branch])],
          jobStatus: ["FAILED"],
        },
      },
      targets: [new targets.SnsTopic(topic, { authorizeUsingRole: true })],
    });
  }

  /**
   * Creates the Amplify build specification.
   * @param hosting - Hosting configuration
   * @returns Amplify-compatible CodeBuild build specification
   */
  private createBuildSpec(hosting: AmplifyHostingConfig): codebuild.BuildSpec {
    return codebuild.BuildSpec.fromObjectToYaml({
      version: 1,
      frontend: {
        phases: {
          preBuild: {
            commands: [
              ...renderBuildToolCommands(hosting.buildTools),
              ...(hosting.preBuildCommands ?? ["npm ci"]),
            ],
          },
          build: {
            commands: [...(hosting.buildCommands ?? ["npm run build"])],
          },
        },
        artifacts: {
          baseDirectory: hosting.artifactBaseDirectory ?? "dist",
          files: ["**/*"],
        },
        cache: {
          paths: ["node_modules/**/*"],
        },
      },
    });
  }

  /**
   * Creates an optional custom domain mapped to the source branch.
   * @param hosting - Hosting configuration
   * @returns Domain construct or undefined when using Amplify's default domain
   */
  private createDomain(
    hosting: AmplifyHostingConfig
  ): amplify.Domain | undefined {
    if (!hosting.customDomain) {
      return undefined;
    }

    const domain = this.app.addDomain("CustomDomain", {
      domainName: hosting.customDomain,
    });
    domain.mapRoot(this.branch);
    return domain;
  }

  /**
   * Creates stable outputs for discovering the deployed app.
   * @param stageName - Environment name used in export names
   */
  private createOutputs(stageName: string): void {
    new cdk.CfnOutput(this, "AmplifyDefaultDomain", {
      value: this.app.defaultDomain,
      exportName: `${stageName}-frontend-amplify-default-domain`,
    });

    new cdk.CfnOutput(this, "AmplifyBranchUrl", {
      value: `https://${this.branch.branchName}.${this.app.defaultDomain}`,
      exportName: `${stageName}-frontend-amplify-branch-url`,
    });

    new cdk.CfnOutput(this, "AmplifyAppId", {
      value: this.app.appId,
      exportName: `${stageName}-frontend-amplify-app-id`,
    });
  }
}
