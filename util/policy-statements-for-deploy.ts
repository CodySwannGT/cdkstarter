/**
 * Deploy Role Policy Statements
 *
 * Policy statement factory for the GitHub Actions deploy role
 * (DeployServiceRole) and the CodeBuild service role. Covers CDK bootstrap
 * access (CDKToolkit stack + `cdk-*-assets` buckets), CloudFormation,
 * Lambda, ECR/ECS, API Gateway, logs, events, IAM role management, and the
 * service permissions a serverless application deploy typically needs.
 *
 * ## Scoping Notes
 *
 * Several statements are intentionally broad (marked with TODO) so the
 * template works for any application shape out of the box. Tighten them to
 * your application's ARN patterns once those are known. Statements for
 * services your applications don't use (for example Bedrock or Neptune)
 * can be deleted wholesale — each statement is independent.
 * @see lib/stacks/cicd/iam-deploy-role-stack.ts - OIDC deploy role consumer
 * @see lib/stacks/cicd/migration-runner-stack.ts - CodeBuild consumer
 * @module util/policy-statements-for-deploy
 */

/**
 * A plain-object IAM policy statement (actions + resources).
 * Converted to `iam.PolicyStatement` with ALLOW effect by consumers.
 */
export interface DeployPolicyStatement {
  /**
   * IAM actions to allow.
   */
  readonly actions: readonly string[];

  /**
   * Resource ARNs (or wildcards) the actions apply to.
   */
  readonly resources: readonly string[];
}

/**
 * Builds the deploy-role policy statements for an account/region.
 * @param account - AWS account ID the role deploys into
 * @param region - AWS region for region-scoped ARNs
 * @returns Policy statements for the deploy role
 */
const policyStatementsForDeploy = (
  account: string,
  region: string
): readonly DeployPolicyStatement[] => [
  {
    // CDK Bootstrap permissions
    actions: [
      "cloudformation:GetTemplate",
      "cloudformation:CreateChangeSet",
      "cloudformation:DescribeChangeSet",
      "cloudformation:ExecuteChangeSet",
      "cloudformation:DescribeStackEvents",
      "cloudformation:DescribeStackResources",
      "cloudformation:DescribeStackResource",
      "cloudformation:GetStackPolicy",
      "cloudformation:DescribeStacks",
    ],
    resources: [
      `arn:aws:cloudformation:${region}:${account}:stack/CDKToolkit/*`,
    ],
  },
  {
    // CDK Bootstrap bucket permissions
    actions: ["s3:*"],
    resources: [
      `arn:aws:s3:::cdk-*-assets-${account}-${region}`,
      `arn:aws:s3:::cdk-*-assets-${account}-${region}/*`,
    ],
  },
  {
    // Bedrock permissions for AI workloads. Delete if unused.
    actions: [
      "bedrock:*",
      "bedrock-agent:*",
      "bedrock-agent-runtime:*",
      "bedrock-runtime:*",
    ],
    resources: ["*"],
  },
  {
    // Neptune Analytics permissions for graph workloads. Delete if unused.
    actions: ["neptune-graph:*"],
    resources: ["*"],
  },
  {
    // DynamoDB permissions (for example framework checkpoint tables)
    actions: ["dynamodb:*"],
    resources: [`arn:aws:dynamodb:${region}:${account}:table/*`],
  },
  {
    // SSM parameter writes performed by application deploys
    actions: [
      "ssm:PutParameter",
      "ssm:DeleteParameter",
      "ssm:AddTagsToResource",
      "ssm:RemoveTagsFromResource",
    ],
    resources: [`arn:aws:ssm:${region}:${account}:parameter/*`],
  },
  {
    actions: ["xray:PutTraceSegments", "xray:PutTelemetryRecords", "xray:*"],
    resources: ["*"],
  },
  {
    actions: [
      "appconfigdata:StartConfigurationSession",
      "appconfigdata:GetLatestConfiguration",
    ],
    resources: ["*"],
  },
  {
    actions: [
      "ec2:DescribeSecurityGroups",
      "ec2:DescribeSecurityGroupRules",
      "ec2:DescribeTags",
      "ec2:DescribeSubnets",
      "ec2:Describe*",
    ],
    resources: ["*"],
  },
  {
    actions: ["sts:AssumeRole"],
    resources: ["*"],
  },
  {
    actions: [
      "cloudformation:List*",
      "cloudformation:Get*",
      "cloudformation:ValidateTemplate",
      "cloudformation:DescribeStacks",
    ],
    resources: ["*"],
  },
  {
    actions: [
      "cloudformation:CreateStack",
      "cloudformation:CreateUploadBucket",
      "cloudformation:DeleteStack",
      "cloudformation:Describe*",
      "cloudformation:UpdateStack",
      "cloudformation:DeleteChangeSet",
      "cloudformation:CreateChangeSet",
      "cloudformation:ExecuteChangeSet",
      "cloudformation:DescribeStacks",
    ],
    resources: ["*"],
  },
  {
    actions: [
      "lambda:Get*",
      "lambda:List*",
      "lambda:CreateFunction",
      "lambda:CreateFunctionUrlConfig",
      "lambda:*",
    ],
    resources: ["*"],
  },
  {
    actions: ["rds-db:connect"],
    resources: ["*"],
  },
  {
    actions: [
      "s3:GetBucketLocation",
      "s3:CreateBucket",
      "s3:DeleteBucket",
      "s3:ListBucket",
      "s3:GetBucketPolicy",
      "s3:PutBucketPolicy",
      "s3:ListBucketVersions",
      "s3:PutAccelerateConfiguration",
      "s3:GetEncryptionConfiguration",
      "s3:PutEncryptionConfiguration",
      "s3:DeleteBucketPolicy",
      "s3:PutBucketTagging",
      "s3:PutBucketVersioning",
    ],
    resources: ["arn:aws:s3:::*"],
  },
  {
    actions: ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
    resources: ["arn:aws:s3:::*"],
  },
  {
    actions: [
      "lambda:AddPermission",
      "lambda:CreateAlias",
      "lambda:DeleteFunction",
      "lambda:InvokeFunction",
      "lambda:PublishVersion",
      "lambda:RemovePermission",
      "lambda:Update*",
      "lambda:TagResource",
    ],
    resources: [`arn:aws:lambda:${region}:${account}:function:*`],
  },
  {
    actions: ["sns:publish", "sns:subscribe", "sns:unsubscribe"],
    resources: ["*"],
  },
  {
    // SMS/voice messaging permissions. Delete if unused.
    actions: ["sms-voice:*"],
    resources: ["*"],
  },
  {
    actions: ["iam:GetPolicy", "iam:GetPolicyVersion", "iam:GetUser"],
    resources: ["*"],
  },
  {
    actions: [
      "cloudwatch:GetMetricStatistics",
      "cloudwatch:PutMetricAlarm", // TODO: Scope down to specific alarms
      "cloudwatch:DeleteAlarms", // TODO: Scope down to specific alarms
    ],
    resources: ["*"],
  },
  {
    actions: [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:DeleteLogGroup",
      "logs:PutRetentionPolicy",
      "logs:PutLogEvents",
      "logs:DescribeLogStreams",
      "logs:DescribeLogGroups",
      "logs:FilterLogEvents",
      "logs:*",
    ],
    resources: [`arn:aws:logs:${region}:${account}:*`],
  },
  {
    actions: [
      "ec2:CreateSecurityGroup",
      "ec2:DeleteSecurityGroup",
      "ec2:AuthorizeSecurityGroupIngress",
      "ec2:createTags",
    ],
    resources: [`arn:aws:ec2:${region}:${account}:*`],
  },
  {
    actions: ["events:Put*", "events:Remove*", "events:Delete*"],
    resources: [`arn:aws:events:${region}:${account}:rule/*`],
  },
  {
    actions: ["events:DescribeRule"],
    resources: [`arn:aws:events:${region}:${account}:rule/*`],
  },
  {
    actions: ["iam:PassRole"],
    resources: [`arn:aws:iam::${account}:role/*`],
  },
  {
    actions: [
      "iam:GetRole",
      "iam:CreateRole",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:DeleteRole",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:TagRole",
    ],
    resources: [`arn:aws:iam::${account}:role/*`],
  },
  {
    actions: [
      "apigateway:GET",
      "apigateway:POST",
      "apigateway:PUT",
      "apigateway:DELETE",
      "apigateway:TagResource",
      "apigateway:PATCH",
    ],
    resources: [
      "arn:aws:apigateway:*::/apis*",
      "arn:aws:apigateway:*::/restapis*",
      "arn:aws:apigateway:*::/apikeys*",
      "arn:aws:apigateway:*::/tags*",
      "arn:aws:apigateway:*::/usageplans*",
    ],
  },
  {
    actions: [
      "ssm:DescribeParameters",
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:GetParametersByPath",
      "kms:Decrypt",
    ],
    resources: ["*"],
  },
  {
    actions: [
      "ecr:TagResource",
      "ecr:GetAuthorizationToken",
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:GetRepositoryPolicy",
      "ecr:DescribeRepositories",
      "ecr:ListImages",
      "ecr:DescribeImages",
      "ecr:BatchGetImage",
      "ecr:GetLifecyclePolicy",
      "ecr:GetLifecyclePolicyPreview",
      "ecr:ListTagsForResource",
      "ecr:DescribeImageScanFindings",
      "ecr:CreateRepository",
      "ecr:PutImage",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
      "ecr:StartLifecyclePolicyPreview",
      "ecr:SetRepositoryPolicy",
    ],
    resources: ["*"],
  },
  {
    actions: [
      "ecs:UpdateService",
      "ecs:CreateService",
      "ecs:DeleteService",
      "ecs:Describe*",
      "ecs:RegisterTaskDefinition", // TODO: restrict to arn pattern
      "ecs:DeregisterTaskDefinition", // TODO: restrict to arn pattern
    ],
    resources: ["*"],
  },
  {
    actions: [
      "elasticloadbalancing:*", // TODO: restrict to arn pattern
    ],
    resources: [`arn:aws:elasticloadbalancing:${region}:${account}:*`],
  },
  {
    actions: ["cognito-idp:ListUsers"],
    resources: ["*"],
  },
];

export default policyStatementsForDeploy;
