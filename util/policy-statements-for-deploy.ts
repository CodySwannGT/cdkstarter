/** Scoped application deployment ceiling, shared by caller and executor. */
import * as iam from "aws-cdk-lib/aws-iam";
import type { GitHubConfig } from "../lib/types";

/**
 * Construct a least-privilege application deployment policy.
 * @param account - Deployment account
 * @param region - Deployment region
 * @param partition - AWS partition of the owning stack
 * @param config - Exact stack/resource namespace and role allowlist
 * @param boundaryArn - Protected application permissions ceiling
 * @param executionRoleArn - Protected CloudFormation execution role
 * @param deployRoleArn - Protected GitHub caller role
 * @returns Allow grants and explicit escalation denials
 */
const policyStatementsForDeploy = (
  account: string,
  region: string,
  partition: string,
  config: NonNullable<GitHubConfig["applicationDeploy"]>,
  boundaryArn: string,
  executionRoleArn: string,
  deployRoleArn: string
): iam.PolicyStatement[] => {
  const stack = `arn:${partition}:cloudformation:${region}:${account}:stack/${config.stackPrefix}*/*`;
  const roles = config.applicationRoleNames.map(
    name => `arn:${partition}:iam::${account}:role/${name}`
  );
  const allow = (
    actions: string[],
    resources: string[],
    conditions?: Record<string, Record<string, string | string[]>>
  ): iam.PolicyStatement =>
    new iam.PolicyStatement({ actions, resources, conditions });
  const deny = (
    actions: string[],
    resources: string[],
    conditions?: Record<string, Record<string, string | string[]>>
  ): iam.PolicyStatement =>
    new iam.PolicyStatement({
      effect: iam.Effect.DENY,
      actions,
      resources,
      conditions,
    });
  return [
    allow(
      [
        "cloudformation:CreateStack",
        "cloudformation:UpdateStack",
        "cloudformation:DeleteStack",
      ],
      [stack],
      { StringEquals: { "cloudformation:RoleArn": executionRoleArn } }
    ),
    allow(
      [
        "cloudformation:DescribeStacks",
        "cloudformation:DescribeStackEvents",
        "cloudformation:DescribeStackResources",
        "cloudformation:GetTemplate",
      ],
      [stack]
    ),
    allow(
      [
        "cloudformation:ValidateTemplate",
        "ec2:DescribeSubnets",
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeVpcs",
      ],
      ["*"]
    ),
    allow(["iam:PassRole"], [executionRoleArn], {
      StringEquals: { "iam:PassedToService": "cloudformation.amazonaws.com" },
    }),
    allow(["iam:PassRole"], roles, {
      StringEquals: {
        "iam:PassedToService": [
          "lambda.amazonaws.com",
          "ecs-tasks.amazonaws.com",
          "events.amazonaws.com",
        ],
      },
    }),
    allow(["iam:CreateRole"], roles, {
      StringEquals: { "iam:PermissionsBoundary": boundaryArn },
    }),
    allow(
      [
        "iam:GetRole",
        "iam:GetRolePolicy",
        "iam:ListRolePolicies",
        "iam:ListAttachedRolePolicies",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:DeleteRole",
        "iam:TagRole",
        "iam:UntagRole",
      ],
      roles
    ),
    allow(
      ["lambda:*"],
      [
        `arn:${partition}:lambda:${region}:${account}:function:${config.resourcePrefix}*`,
      ]
    ),
    allow(
      ["dynamodb:*"],
      [
        `arn:${partition}:dynamodb:${region}:${account}:table/${config.resourcePrefix}*`,
      ]
    ),
    allow(
      ["s3:*"],
      [
        `arn:${partition}:s3:::${config.resourcePrefix}*`,
        `arn:${partition}:s3:::${config.resourcePrefix}*/*`,
      ]
    ),
    allow(
      ["logs:*"],
      [
        `arn:${partition}:logs:${region}:${account}:log-group:/aws/lambda/${config.resourcePrefix}*`,
        `arn:${partition}:logs:${region}:${account}:log-group:${config.resourcePrefix}*`,
      ]
    ),
    allow(
      ["events:*"],
      [
        `arn:${partition}:events:${region}:${account}:rule/${config.resourcePrefix}*`,
      ]
    ),
    allow(
      [
        "ssm:GetParameter",
        "ssm:PutParameter",
        "ssm:DeleteParameter",
        "ssm:AddTagsToResource",
      ],
      [
        `arn:${partition}:ssm:${region}:${account}:parameter/${config.resourcePrefix}*`,
      ]
    ),
    deny(
      [
        "sts:AssumeRole",
        "cloudformation:CreateChangeSet",
        "cloudformation:ExecuteChangeSet",
        "iam:DeleteRolePermissionsBoundary",
        "iam:PutRolePermissionsBoundary",
        "iam:UpdateAssumeRolePolicy",
        "iam:CreatePolicy",
        "iam:CreatePolicyVersion",
        "iam:SetDefaultPolicyVersion",
        "iam:DeletePolicyVersion",
        "iam:DeletePolicy",
      ],
      ["*"]
    ),
    deny(["iam:CreateRole"], ["*"], {
      StringNotEquals: { "iam:PermissionsBoundary": boundaryArn },
    }),
    deny(
      [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:TagRole",
        "iam:UntagRole",
      ],
      [executionRoleArn, deployRoleArn]
    ),
    new iam.PolicyStatement({
      effect: iam.Effect.DENY,
      actions: [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:PutRolePolicy",
        "iam:AttachRolePolicy",
        "iam:PassRole",
      ],
      notResources: [...roles, executionRoleArn],
    }),
    deny(
      [
        "cloudformation:CreateStack",
        "cloudformation:UpdateStack",
        "cloudformation:DeleteStack",
      ],
      ["*"],
      { StringNotEquals: { "cloudformation:RoleArn": executionRoleArn } }
    ),
    new iam.PolicyStatement({
      effect: iam.Effect.DENY,
      actions: [
        "cloudformation:CreateStack",
        "cloudformation:UpdateStack",
        "cloudformation:DeleteStack",
      ],
      notResources: [stack],
    }),
  ];
};

export default policyStatementsForDeploy;
