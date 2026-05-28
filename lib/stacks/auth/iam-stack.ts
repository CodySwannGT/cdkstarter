/**
 * IAM Stack - SOC2-Compliant Lambda Execution Roles
 *
 * This stack creates IAM roles for Lambda functions following SOC2 compliance
 * requirements and least-privilege security principles.
 *
 * ## SOC2 Compliance Approach
 *
 * This stack implements several SOC2 security controls:
 *
 * - **Least-privilege access**: Only required actions, specific resources
 * - **Auditability**: Named resources with descriptive role names
 * - **Minimized wildcards**: Only where AWS requires (X-Ray)
 * - **Separation of duties**: Distinct policies per service
 *
 * ## Resource ARN Strategy
 *
 * Where possible, policies reference specific resource ARNs passed via props
 * rather than using wildcards. This provides:
 *
 * - **Blast radius reduction**: Compromised credentials limited to specific resources
 * - **Audit clarity**: CloudTrail shows exact resources accessed
 * - **Compliance alignment**: SOC2 auditors prefer explicit resource grants
 *
 * ## Cross-Stack References
 *
 * This stack exports values for application deployment:
 * - `{stageName}-lambda-execution-role-arn`: Role ARN for Lambda functions
 * - `{stageName}-lambda-execution-role-name`: Role name for IAM policies
 * @see https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html
 * @module lib/stacks/auth/iam-stack
 */
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";

/**
 * Configuration properties for IamStack.
 */
export interface IamStackProps extends cdk.StackProps {
  /**
   * Stage name for CloudFormation output prefixes.
   * Examples: "dev", "staging", "production"
   */
  readonly stageName: string;

  /**
   * Aurora cluster ARN for RDS IAM authentication policy.
   * Used to grant rds-db:connect permission.
   */
  readonly auroraClusterArn: string;

  /**
   * Aurora Secrets Manager secret ARN.
   * Used for non-IAM auth scenarios (fallback, admin operations).
   */
  readonly auroraSecretArn: string;

  /**
   * Cognito user pool ARN for admin operations.
   * Used by Lambda triggers that need to modify user attributes.
   */
  readonly cognitoUserPoolArn: string;
}

/**
 * IAM Stack creating SOC2-compliant Lambda execution roles.
 *
 * Creates a Lambda execution role with least-privilege access to:
 * - Aurora via IAM authentication
 * - Cognito for admin operations
 * - CloudWatch for logging
 * - X-Ray for tracing
 */
export class IamStack extends cdk.Stack {
  /**
   * The Lambda execution role.
   */
  public readonly lambdaExecutionRole: iam.Role;

  /**
   * Creates a new IamStack.
   * @param scope - Parent construct
   * @param id - Stack identifier
   * @param props - Stack configuration
   */
  constructor(scope: Construct, id: string, props: IamStackProps) {
    super(scope, id, props);

    const { stageName, auroraClusterArn, auroraSecretArn, cognitoUserPoolArn } =
      props;

    this.lambdaExecutionRole = this.createLambdaExecutionRole(stageName);
    this.addManagedPolicies();
    this.addAuroraPolicy(auroraClusterArn, auroraSecretArn);
    this.addCognitoPolicy(cognitoUserPoolArn);
    this.addXRayPolicy();
    this.createOutputs(stageName);
  }

  /**
   * Creates the Lambda execution role.
   * @param _stageName - Stage name (unused, kept for interface consistency)
   * @returns The created role
   */
  private createLambdaExecutionRole(_stageName: string): iam.Role {
    return new iam.Role(this, "LambdaExecutionRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      description:
        "SOC2-compliant Lambda execution role with least-privilege access",
    });
  }

  /**
   * Adds AWS managed policies for Lambda execution.
   *
   * - AWSLambdaBasicExecutionRole: CloudWatch Logs access
   * - AWSLambdaVPCAccessExecutionRole: VPC network interface management
   */
  private addManagedPolicies(): void {
    this.lambdaExecutionRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AWSLambdaBasicExecutionRole"
      )
    );

    this.lambdaExecutionRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AWSLambdaVPCAccessExecutionRole"
      )
    );
  }

  /**
   * Adds policy for Aurora access.
   *
   * - rds-db:connect: Connect via RDS Proxy with IAM auth
   * - secretsmanager:GetSecretValue: Fallback for non-IAM scenarios
   * @param auroraClusterArn - Aurora cluster ARN
   * @param auroraSecretArn - Aurora secret ARN
   */
  private addAuroraPolicy(
    auroraClusterArn: string,
    auroraSecretArn: string
  ): void {
    // RDS IAM auth requires connect permission on cluster resources
    this.lambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["rds-db:connect"],
        resources: [`${auroraClusterArn}/*`],
        effect: iam.Effect.ALLOW,
      })
    );

    // Secrets Manager access for non-IAM scenarios
    this.lambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [auroraSecretArn],
        effect: iam.Effect.ALLOW,
      })
    );
  }

  /**
   * Adds policy for Cognito admin operations.
   *
   * Lambda triggers may need to:
   * - Get user attributes (validation)
   * - Update user attributes (post-confirmation)
   * - Create users (admin flows)
   * @param cognitoUserPoolArn - Cognito user pool ARN
   */
  private addCognitoPolicy(cognitoUserPoolArn: string): void {
    this.lambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminUpdateUserAttributes",
          "cognito-idp:AdminCreateUser",
        ],
        resources: [cognitoUserPoolArn],
        effect: iam.Effect.ALLOW,
      })
    );
  }

  /**
   * Adds policy for X-Ray tracing.
   *
   * Note: X-Ray requires wildcard resources - AWS does not support
   * resource-level permissions for these actions.
   */
  private addXRayPolicy(): void {
    this.lambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["xray:PutTraceSegments", "xray:PutTelemetryRecords"],
        resources: ["*"],
        effect: iam.Effect.ALLOW,
      })
    );
  }

  /**
   * Creates CloudFormation outputs for cross-stack references.
   * @param stageName - Stage name for export name prefixes
   */
  private createOutputs(stageName: string): void {
    new cdk.CfnOutput(this, "LambdaExecutionRoleArn", {
      value: this.lambdaExecutionRole.roleArn,
      description: `Lambda execution role ARN for ${stageName}`,
      exportName: `${stageName}-lambda-execution-role-arn`,
    });

    new cdk.CfnOutput(this, "LambdaExecutionRoleName", {
      value: this.lambdaExecutionRole.roleName,
      description: `Lambda execution role name for ${stageName}`,
      exportName: `${stageName}-lambda-execution-role-name`,
    });
  }
}
