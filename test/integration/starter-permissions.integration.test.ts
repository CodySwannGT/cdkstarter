/** Offline effective-policy evaluation of the synthesized attached ceilings. */
import { rmSync } from "node:fs";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { IamDeployRoleStack } from "../../lib/stacks/cicd/iam-deploy-role-stack";
import type { GitHubConfig } from "../../lib/types";

interface Statement {
  Effect: string;
  Action: string | string[];
  Resource?: string | string[];
  NotResource?: string | string[];
  Condition?: Record<string, Record<string, string | string[]>>;
}
const account = "111111111111";
const execution = `arn:aws:iam::${account}:role/example-dev-CloudFormationExecution`;
const boundary = `arn:aws:iam::${account}:policy/example-dev-ApplicationBoundary`;
const application = `arn:aws:iam::${account}:role/example-dev-runtime`;
const stackArn = `arn:aws:cloudformation:us-east-1:${account}:stack/example-dev-api/id`;
const github = {
  owner: "example",
  ownerId: "123456",
  infrastructureRepo: "infrastructure",
  branch: "main",
  codeConnectionArn: "PLACEHOLDER",
  deployRoleName: "DeployServiceRole",
  migrationRunnerRepo: "backend",
  deployRepositories: [
    { name: "backend", id: "456789", refs: ["refs/heads/main"] },
  ],
  applicationDeploy: {
    stackPrefix: "example-dev-",
    resourcePrefix: "example-dev-",
    applicationRoleNames: ["example-dev-runtime"],
  },
} as GitHubConfig;
const list = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : [value].flat();
const matches = (pattern: string, value: string): boolean =>
  new RegExp(
    `^${pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".")}$`,
    "i"
  ).test(value);
const permits = (
  statements: Statement[],
  action: string,
  resource: string,
  context: Record<string, string>
): boolean => {
  const selected = statements.filter(
    statement =>
      list(statement.Action).some(pattern => matches(pattern, action)) &&
      (statement.NotResource
        ? !list(statement.NotResource).some(pattern =>
            matches(pattern, resource)
          )
        : list(statement.Resource).some(pattern =>
            matches(pattern, resource)
          )) &&
      Object.entries(statement.Condition ?? {}).every(
        ([operator, conditions]) =>
          Object.entries(conditions).every(([key, values]) => {
            const equal = list(values).includes(context[key]);
            if (operator === "StringEquals" || operator === "ArnEquals")
              return equal;
            if (operator === "StringNotEquals" || operator === "ArnNotEquals")
              return !equal;
            throw new Error(`Unsupported condition: ${operator}`);
          })
      )
  );
  return (
    selected.some(statement => statement.Effect === "Allow") &&
    !selected.some(statement => statement.Effect === "Deny")
  );
};
/** Resolve the fixture's known CloudFormation partition before policy evaluation. */
const resolveFixture = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(resolveFixture);
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (object.Ref === "AWS::Partition") return "aws";
    if (object["Fn::Join"]) {
      const [separator, parts] = object["Fn::Join"] as [string, unknown[]];
      return parts.map(resolveFixture).join(separator);
    }
    return Object.fromEntries(
      Object.entries(object).map(([key, entry]) => [key, resolveFixture(entry)])
    );
  }
  return value;
};
let template: Template;
beforeEach(() => {
  const app = new cdk.App();
  try {
    template = Template.fromStack(
      new IamDeployRoleStack(app, "TestStack", {
        github,
        stageName: "dev",
        env: { account, region: "us-east-1" },
      })
    );
  } finally {
    rmSync(app.outdir, { recursive: true, force: true });
  }
});
const effective = (
  roleName: string,
  action: string,
  resource: string,
  context: Record<string, string> = {}
): boolean => {
  const role = Object.values(template.findResources("AWS::IAM::Role")).find(
    value => value.Properties.RoleName === roleName
  )!;
  if (!role) return false;
  const identity = (
    resolveFixture(role.Properties.Policies) as {
      PolicyDocument: { Statement: Statement[] };
    }[]
  ).flatMap(
    (policy: { PolicyDocument: { Statement: Statement[] } }) =>
      policy.PolicyDocument.Statement
  );
  const policies = Object.values(
    template.findResources("AWS::IAM::ManagedPolicy")
  );
  const ceiling = policies.find(
    value =>
      value.Properties.ManagedPolicyName === "example-dev-ApplicationBoundary"
  );
  if (!role.Properties.PermissionsBoundary || !ceiling)
    return permits(identity, action, resource, context);
  return (
    permits(identity, action, resource, context) &&
    permits(
      resolveFixture(
        ceiling.Properties.PolicyDocument.Statement
      ) as Statement[],
      action,
      resource,
      context
    )
  );
};
describe("starter application deployment ceiling", () => {
  it("attaches the same actual boundary to caller and protected CloudFormation execution role", () => {
    const policies = template.findResources("AWS::IAM::ManagedPolicy");
    const id = Object.keys(policies).find(
      key =>
        policies[key].Properties.ManagedPolicyName ===
        "example-dev-ApplicationBoundary"
    );
    expect(id).toBeDefined();
    for (const name of [
      "DeployServiceRole",
      "example-dev-CloudFormationExecution",
    ]) {
      const role = Object.values(template.findResources("AWS::IAM::Role")).find(
        value => value.Properties.RoleName === name
      )!;
      expect(role.Properties.PermissionsBoundary).toEqual({ Ref: id });
    }
  });
  it("allows an approved bounded deployment and rejects unrelated IAM, stack, pass-role and STS targets", () => {
    expect(
      effective("DeployServiceRole", "cloudformation:CreateStack", stackArn, {
        "cloudformation:RoleArn": execution,
      })
    ).toBe(true);
    expect(
      effective("DeployServiceRole", "iam:PassRole", execution, {
        "iam:PassedToService": "cloudformation.amazonaws.com",
      })
    ).toBe(true);
    expect(
      effective(
        "example-dev-CloudFormationExecution",
        "lambda:CreateFunction",
        `arn:aws:lambda:us-east-1:${account}:function:example-dev-api`
      )
    ).toBe(true);
    expect(
      effective(
        "DeployServiceRole",
        "sts:AssumeRole",
        `arn:aws:iam::${account}:role/Admin`
      )
    ).toBe(false);
    expect(
      effective(
        "DeployServiceRole",
        "iam:PutRolePolicy",
        `arn:aws:iam::${account}:role/unrelated`
      )
    ).toBe(false);
    expect(
      effective(
        "DeployServiceRole",
        "iam:PassRole",
        `arn:aws:iam::${account}:role/Admin`,
        { "iam:PassedToService": "cloudformation.amazonaws.com" }
      )
    ).toBe(false);
    expect(
      effective(
        "DeployServiceRole",
        "cloudformation:CreateStack",
        stackArn.replace("example-dev-api", "other-api"),
        { "cloudformation:RoleArn": execution }
      )
    ).toBe(false);
  });
  it("rejects administrator executor, omitted executor, unbounded creation, boundary replacement/removal and self-escalation", () => {
    for (const executor of [`arn:aws:iam::${account}:role/Admin`, ""])
      expect(
        effective(
          "DeployServiceRole",
          "cloudformation:CreateStack",
          stackArn,
          executor ? { "cloudformation:RoleArn": executor } : {}
        )
      ).toBe(false);
    const role = "example-dev-CloudFormationExecution";
    expect(
      effective(role, "iam:CreateRole", application, {
        "iam:PermissionsBoundary": boundary,
      })
    ).toBe(true);
    expect(effective(role, "iam:CreateRole", application)).toBe(false);
    expect(
      effective(role, "iam:CreateRole", application, {
        "iam:PermissionsBoundary": `${boundary}Other`,
      })
    ).toBe(false);
    for (const action of [
      "iam:DeleteRolePermissionsBoundary",
      "iam:PutRolePermissionsBoundary",
      "iam:UpdateAssumeRolePolicy",
    ])
      expect(effective(role, action, application)).toBe(false);
    expect(effective(role, "iam:CreatePolicyVersion", boundary)).toBe(false);
    expect(effective(role, "iam:PutRolePolicy", execution)).toBe(false);
    expect(
      effective(role, "iam:PassRole", application, {
        "iam:PassedToService": "lambda.amazonaws.com",
      })
    ).toBe(true);
    expect(
      effective(role, "iam:PassRole", application, {
        "iam:PassedToService": "cloudformation.amazonaws.com",
      })
    ).toBe(false);
  });
});
