/** Tests for static frontend hosting on AWS Amplify. */
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { AmplifyHostingStack } from "../../../lib/stacks/edge/amplify-hosting-stack";

describe("AmplifyHostingStack", () => {
  const createTemplate = (): Template => {
    const app = new cdk.App();
    const stack = new AmplifyHostingStack(app, "TestStack", {
      stageName: "dev",
      hosting: {
        owner: "example",
        repository: "frontend",
        branch: "dev",
        oauthTokenSecretName: "example/amplify/github-token",
        environmentVariables: { APP_ENV: "development" },
      },
    });
    return Template.fromStack(stack);
  };

  it("creates one static Amplify app and auto-building branch", () => {
    const template = createTemplate();

    template.resourceCountIs("AWS::Amplify::App", 1);
    template.hasResourceProperties("AWS::Amplify::App", {
      Name: "dev-frontend",
      Platform: "WEB",
      Repository: "https://github.com/example/frontend",
    });
    template.hasResourceProperties("AWS::Amplify::Branch", {
      BranchName: "dev",
      EnableAutoBuild: true,
      EnvironmentVariables: [{ Name: "APP_ENV", Value: "development" }],
    });
  });

  it("uses the default Amplify domain when no custom domain is configured", () => {
    createTemplate().resourceCountIs("AWS::Amplify::Domain", 0);
  });
});
