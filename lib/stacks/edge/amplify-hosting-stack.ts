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
import * as codebuild from "aws-cdk-lib/aws-codebuild";
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
    });

    this.branch = this.app.addBranch("SourceBranch", {
      branchName: hosting.branch,
      autoBuild: true,
    });

    Object.entries(hosting.environmentVariables ?? {}).forEach(
      ([name, value]) => this.branch.addEnvironment(name, value)
    );

    this.domain = this.createDomain(hosting);
    this.createOutputs(stageName);
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
              ...(hosting.preBuildCommands ?? [
                "npm install -g bun",
                "bun install --frozen-lockfile",
              ]),
            ],
          },
          build: {
            commands: [...(hosting.buildCommands ?? ["bun run export:web"])],
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
