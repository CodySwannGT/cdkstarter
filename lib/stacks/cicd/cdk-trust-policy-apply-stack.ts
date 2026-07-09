/**
 * CDK Trust Policy Apply Stack - Bootstrap Role Trust Management
 *
 * REWRITES the trust policies on the CDK bootstrap roles in this account so
 * that deployments can come from the pipeline (shared account), the GitHub
 * Actions OIDC deploy role, and optionally a legacy GitHub IAM user.
 *
 * ## Why a Custom Resource
 *
 * CDK cannot modify trust policies on imported roles (and the bootstrap
 * roles are, by definition, created outside this app — chicken and egg).
 * This stack works around that with `AwsCustomResource` calls to
 * `iam:UpdateAssumeRolePolicy`.
 *
 * ## Replacement Semantics — Read Before Editing
 *
 * `UpdateAssumeRolePolicy` REPLACES the whole trust document. The statements
 * generated here must therefore include everything the roles need — including
 * the account-root trust that `cdk bootstrap --trust` would have written.
 * Removing a statement here removes that access on next deploy.
 *
 * This is the applying counterpart to the documentation-only
 * `TrustPolicyStack` in `lib/stacks/support/trust-policy-stack.ts` (which
 * emits the manual `cdk bootstrap --trust` command). Use one or the other:
 * manual bootstrap for a minimal setup, this stack when GitHub Actions also
 * needs to deploy.
 * @see lib/stacks/support/trust-policy-stack.ts - Documentation-only counterpart
 * @see lib/stacks/cicd/iam-deploy-role-stack.ts - The deploy role trusted here
 * @module lib/stacks/cicd/cdk-trust-policy-apply-stack
 */
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cr from "aws-cdk-lib/custom-resources";
import type { Construct } from "constructs";

/**
 * CDK bootstrap role types whose trust policies are managed.
 * cfn-exec-role additionally trusts the CloudFormation service.
 */
const CDK_BOOTSTRAP_ROLE_TYPES = [
  "deploy-role",
  "file-publishing-role",
  "image-publishing-role",
  "lookup-role",
  "cfn-exec-role",
] as const;

/**
 * A plain-object IAM trust statement, as accepted by
 * `iam:UpdateAssumeRolePolicy`.
 */
interface TrustStatement {
  readonly Effect: "Allow";
  readonly Principal: Readonly<Record<string, string | readonly string[]>>;
  readonly Action: "sts:AssumeRole";
  readonly Condition?: Readonly<
    Record<string, Readonly<Record<string, string>>>
  >;
}

/**
 * Configuration properties for CdkTrustPolicyApplyStack.
 */
export interface CdkTrustPolicyApplyStackProps extends cdk.StackProps {
  /**
   * Stage name for resource naming.
   */
  readonly stageName: string;

  /**
   * AWS account ID this stack manages bootstrap role trust in.
   */
  readonly accountId: string;

  /**
   * AWS account ID of the shared/pipeline account whose root is trusted.
   */
  readonly sharedAccountId: string;

  /**
   * Name of the GitHub Actions OIDC deploy role in this account.
   */
  readonly deployServiceRoleName: string;

  /**
   * CDK bootstrap qualifier used in bootstrap role names.
   */
  readonly bootstrapQualifier: string;

  /**
   * Optional legacy GitHub IAM user (in this account) to also trust.
   */
  readonly githubUserName?: string;
}

/**
 * Stack to manage trust policies for CDK bootstrap roles.
 */
export class CdkTrustPolicyApplyStack extends cdk.Stack {
  /**
   * Creates custom resources to update CDK bootstrap role trust policies.
   * @param scope - Parent construct
   * @param id - Stack identifier
   * @param props - Stack configuration with account IDs and role names
   */
  constructor(
    scope: Construct,
    id: string,
    props: CdkTrustPolicyApplyStackProps
  ) {
    super(scope, id, props);

    const region = props.env?.region || this.region;

    // Look up the deploy role's unique Role ID so OIDC sessions of the role
    // can be trusted via an aws:userid condition (role sessions present as
    // "<role-id>:<session-name>", which an ARN principal cannot match).
    const roleIdLookup = this.createRoleIdLookupResource(
      props.deployServiceRoleName
    );

    CDK_BOOTSTRAP_ROLE_TYPES.forEach(roleType => {
      const roleName = `cdk-${props.bootstrapQualifier}-${roleType}-${props.accountId}-${region}`;

      const trustStatements = this.generateTrustStatements(
        props,
        roleType,
        roleIdLookup.getResponseField("Role.RoleId")
      );

      new cr.AwsCustomResource(this, `${roleType}-trust-update`, {
        onCreate: {
          service: "IAM",
          action: "updateAssumeRolePolicy",
          parameters: {
            RoleName: roleName,
            PolicyDocument: JSON.stringify({
              Version: "2012-10-17",
              Statement: trustStatements,
            }),
          },
          physicalResourceId: cr.PhysicalResourceId.of(
            `${roleName}-trust-policy`
          ),
        },
        onUpdate: {
          service: "IAM",
          action: "updateAssumeRolePolicy",
          parameters: {
            RoleName: roleName,
            PolicyDocument: JSON.stringify({
              Version: "2012-10-17",
              Statement: trustStatements,
            }),
          },
        },
        policy: cr.AwsCustomResourcePolicy.fromStatements([
          new iam.PolicyStatement({
            actions: ["iam:UpdateAssumeRolePolicy"],
            resources: [`arn:aws:iam::${props.accountId}:role/${roleName}`],
          }),
        ]),
        logRetention: logs.RetentionDays.ONE_WEEK,
      });

      new cdk.CfnOutput(this, `${roleType}-updated`, {
        value: `Updated trust policy for ${roleName}`,
        description: `Trust policy update status for ${roleType}`,
      });
    });

    new cdk.CfnOutput(this, "DeployServiceRoleId", {
      value: roleIdLookup.getResponseField("Role.RoleId"),
      description: `The Role ID of ${props.deployServiceRoleName}`,
    });
  }

  /**
   * Creates a custom resource to look up the deploy role's unique Role ID.
   * @param roleName - The IAM role name to look up
   * @returns AWS custom resource that retrieves the Role ID via IAM GetRole
   */
  private createRoleIdLookupResource(roleName: string): cr.AwsCustomResource {
    return new cr.AwsCustomResource(this, "RoleIdLookup", {
      onCreate: {
        service: "IAM",
        action: "getRole",
        parameters: {
          RoleName: roleName,
        },
        physicalResourceId: cr.PhysicalResourceId.of(`${roleName}-role-id`),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ["iam:GetRole"],
          resources: [`arn:aws:iam::${this.account}:role/${roleName}`],
        }),
      ]),
      logRetention: logs.RetentionDays.ONE_WEEK,
    });
  }

  /**
   * Generates trust policy statements for a CDK bootstrap role.
   * @param props - Stack properties containing account IDs and role names
   * @param roleType - The CDK bootstrap role type (deploy-role, lookup-role, etc.)
   * @param deployServiceRoleId - The deploy role's unique Role ID for the OIDC session condition
   * @returns Trust policy statements for the role
   */
  private generateTrustStatements(
    props: CdkTrustPolicyApplyStackProps,
    roleType: string,
    deployServiceRoleId: string
  ): readonly TrustStatement[] {
    // 1. Trust the root of this account (preserves what `cdk bootstrap`
    //    writes) and the shared account root (covers the pipeline role and
    //    anything else the shared account authorizes via IAM).
    const rootTrust: TrustStatement = {
      Effect: "Allow",
      Principal: {
        AWS: [
          `arn:aws:iam::${props.accountId}:root`,
          `arn:aws:iam::${props.sharedAccountId}:root`,
        ],
      },
      Action: "sts:AssumeRole",
    };

    // 2. Trust the GitHub Actions deploy role directly.
    const deployRoleTrust: TrustStatement = {
      Effect: "Allow",
      Principal: {
        AWS: `arn:aws:iam::${props.accountId}:role/${props.deployServiceRoleName}`,
      },
      Action: "sts:AssumeRole",
    };

    // 3. Trust OIDC sessions of the deploy role via Role ID condition.
    //    Assumed-role sessions carry "<role-id>:<session>" in aws:userid;
    //    this matches them even though the session ARN is unpredictable.
    const oidcSessionTrust: TrustStatement = {
      Effect: "Allow",
      Principal: {
        AWS: `arn:aws:iam::${props.accountId}:root`,
      },
      Action: "sts:AssumeRole",
      Condition: {
        StringLike: {
          "aws:userid": `${deployServiceRoleId}:*`,
        },
      },
    };

    // 4. Optionally trust a legacy environment-specific GitHub IAM user.
    const githubUserTrust: readonly TrustStatement[] = props.githubUserName
      ? [
          {
            Effect: "Allow",
            Principal: {
              AWS: `arn:aws:iam::${props.accountId}:user/${props.githubUserName}`,
            },
            Action: "sts:AssumeRole",
          },
        ]
      : [];

    // 5. Special case for cfn-exec-role: CloudFormation itself assumes it.
    const cfnServiceTrust: readonly TrustStatement[] =
      roleType === "cfn-exec-role"
        ? [
            {
              Effect: "Allow",
              Principal: {
                Service: "cloudformation.amazonaws.com",
              },
              Action: "sts:AssumeRole",
            },
          ]
        : [];

    return [
      rootTrust,
      deployRoleTrust,
      oidcSessionTrust,
      ...githubUserTrust,
      ...cfnServiceTrust,
    ];
  }
}
