/** Offline evaluation of the actual synthesized OIDC trust. */
import { rmSync } from "node:fs";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { IamDeployRoleStack } from "../../lib/stacks/cicd/iam-deploy-role-stack";
import type { GitHubConfig } from "../../lib/types";

const github = {
  owner: "example",
  ownerId: "123456",
  infrastructureRepo: "infrastructure",
  branch: "main",
  codeConnectionArn: "PLACEHOLDER",
  deployRoleName: "DeployServiceRole",
  deployRepoPattern: "backend",
  migrationRunnerRepo: "backend",
  deployRepositories: [
    {
      name: "backend",
      id: "456789",
      refs: ["refs/heads/main"],
      environments: ["production"],
    },
  ],
};
const synth = (override = {}): Record<string, unknown>[] => {
  const stack = new IamDeployRoleStack(createApp(), "TestStack", {
    stageName: "dev",
    github: { ...github, ...override } as GitHubConfig,
    env: { account: "111111111111", region: "us-east-1" },
  });
  const roles = Template.fromStack(stack).findResources("AWS::IAM::Role");
  const role = Object.values(roles).find(
    resource => resource.Properties.RoleName === "DeployServiceRole"
  )!;
  return role.Properties.AssumeRolePolicyDocument.Statement;
};
const matches = (
  statements: Record<string, unknown>[],
  subject: string,
  audience = "sts.amazonaws.com"
): boolean =>
  statements.some(statement => {
    const condition = statement.Condition as Record<
      string,
      Record<string, string | string[]>
    >;
    const subjects =
      condition.StringLike?.["token.actions.githubusercontent.com:sub"] ??
      condition.StringEquals?.["token.actions.githubusercontent.com:sub"];
    return (
      condition.StringEquals["token.actions.githubusercontent.com:aud"] ===
        audience &&
      [subjects]
        .flat()
        .some(
          pattern =>
            typeof pattern === "string" &&
            new RegExp(
              `^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`
            ).test(subject)
        )
    );
  });

const outputs: string[] = [];
/** Track each assembly so fail-fast and successful synths both clean up. */
const createApp = (props?: cdk.AppProps): cdk.App => {
  const app = new cdk.App(props);
  outputs.push(app.outdir);
  return app;
};
afterEach(() => {
  for (const output of outputs.splice(0))
    rmSync(output, { recursive: true, force: true });
});

describe("starter immutable GitHub OIDC trust", () => {
  it("allows configured immutable repository and filters; denies other IDs, repos, refs, PRs and audience", () => {
    const trust = synth();
    expect(
      matches(trust, "repo:example@123456/backend@456789:ref:refs/heads/main")
    ).toBe(true);
    expect(
      matches(
        trust,
        "repo:example@123456/backend@456789:environment:production"
      )
    ).toBe(true);
    for (const sub of [
      "repo:example@123456/other@456789:ref:refs/heads/main",
      "repo:example@123456/backend@999999:ref:refs/heads/main",
      "repo:example@999999/backend@456789:ref:refs/heads/main",
      "repo:example@123456/backend@456789:ref:refs/heads/dev",
      "repo:example@123456/backend@456789:pull_request",
    ])
      expect(matches(trust, sub)).toBe(false);
    expect(
      matches(
        trust,
        "repo:example@123456/backend@456789:ref:refs/heads/main",
        "other"
      )
    ).toBe(false);
  });
  it("accepts legacy only with explicit migration opt-in and the same repository/filter ceiling", () => {
    const legacy = "repo:example/backend:ref:refs/heads/main";
    expect(matches(synth(), legacy)).toBe(false);
    const trust = synth({ allowLegacyDeploySubjects: true });
    expect(matches(trust, legacy)).toBe(true);
    expect(
      matches(trust, "repo:example@123456/backend@456789:ref:refs/heads/main")
    ).toBe(true);
    expect(matches(trust, "repo:example/other:ref:refs/heads/main")).toBe(
      false
    );
    expect(matches(trust, "repo:example/backend:ref:refs/heads/dev")).toBe(
      false
    );
  });
  it.each([
    { ownerId: undefined },
    { deployRepositories: [] },
    {
      deployRepositories: [
        { name: "*", id: "456789", refs: ["refs/heads/main"] },
      ],
    },
    { deployRepositories: [{ name: "backend", refs: ["refs/heads/main"] }] },
    { deployRepositories: [{ name: "backend", id: "456789", refs: ["*"] }] },
    { deployRepositories: [{ name: "backend", id: "456789", refs: [] }] },
  ])(
    "rejects missing IDs, repositories and broad filters before synth: %j",
    override => {
      expect(() => synth(override)).toThrow();
    }
  );
});
