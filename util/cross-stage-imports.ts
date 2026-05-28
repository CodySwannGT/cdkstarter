/**
 * Cross-Stage Import Utilities
 *
 * This module provides helper functions for importing CloudFormation outputs
 * across stacks and stages. It ensures consistent naming conventions and
 * provides type-safe access to exported values.
 *
 * ## Naming Convention
 *
 * All exports follow the pattern: `{stageName}-{resource}-{attribute}`
 * Examples:
 * - `dev-vpc-id`
 * - `production-aurora-cluster-arn`
 * - `staging-cognito-user-pool-id`
 *
 * ## Usage
 *
 * ```typescript
 * import { getVpcId, getAuroraClusterEndpoint } from "../util/cross-stage-imports";
 *
 * // In a stack that depends on network stage outputs
 * const vpcId = getVpcId(this, "dev");
 * const clusterEndpoint = getAuroraClusterEndpoint(this, "dev");
 * ```
 * @see lib/stacks/network/vpc-stack.ts - VPC exports
 * @see lib/stacks/database/aurora-stack.ts - Aurora exports
 * @module util/cross-stage-imports
 */
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import type { Construct } from "constructs";

/**
 * Imports a CloudFormation export value by name.
 * @param scope - CDK construct scope
 * @param exportName - Name of the CloudFormation export
 * @returns The imported value as a string token
 */
export const importValue = (scope: Construct, exportName: string): string =>
  cdk.Fn.importValue(exportName);

/**
 * Gets the VPC ID export name for a stage.
 * @param stageName - Stage name
 * @returns Export name string
 */
export const getVpcIdExportName = (stageName: string): string =>
  `${stageName}-vpc-id`;

/**
 * Gets the VPC ID for a stage.
 * @param scope - CDK construct scope
 * @param stageName - Stage name
 * @returns Imported VPC ID
 */
export const getVpcId = (scope: Construct, stageName: string): string =>
  importValue(scope, getVpcIdExportName(stageName));

/**
 * Imports a VPC from cross-stack reference using CloudFormation exports.
 *
 * Note: This uses fromVpcAttributes with imported values which resolve at
 * deploy time. For VPC lookups that resolve at synth time, pass the VPC
 * object directly between stacks in the same stage.
 * @param scope - CDK construct scope
 * @param id - Construct ID
 * @param stageName - Stage name for export name lookup
 * @returns Imported VPC with limited attributes
 */
export const importVpc = (
  scope: Construct,
  id: string,
  stageName: string
): ec2.IVpc =>
  ec2.Vpc.fromVpcAttributes(scope, id, {
    vpcId: getVpcId(scope, stageName),
    availabilityZones: cdk.Fn.split(
      ",",
      getAvailabilityZones(scope, stageName)
    ),
  });

/**
 * Gets availability zones export name for a stage.
 * @param stageName - Stage name
 * @returns Export name string
 */
export const getAvailabilityZonesExportName = (stageName: string): string =>
  `${stageName}-availability-zones`;

/**
 * Gets availability zones for a stage.
 * @param scope - CDK construct scope
 * @param stageName - Stage name
 * @returns Imported availability zones as comma-separated string
 */
export const getAvailabilityZones = (
  scope: Construct,
  stageName: string
): string => importValue(scope, getAvailabilityZonesExportName(stageName));

/**
 * Gets security group export names.
 * @param stageName - Stage name for export name prefixes
 * @returns Object with security group export names for aurora, valkey, and lambda
 */
export const getSecurityGroupExportNames = (stageName: string) => ({
  aurora: `${stageName}-aurora-security-group-id`,
  valkey: `${stageName}-valkey-security-group-id`,
  lambda: `${stageName}-lambda-security-group-id`,
});

/**
 * Gets Aurora security group ID for a stage.
 * @param scope - CDK construct scope
 * @param stageName - Stage name for export name lookup
 * @returns Imported Aurora security group ID
 */
export const getAuroraSecurityGroupId = (
  scope: Construct,
  stageName: string
): string => importValue(scope, getSecurityGroupExportNames(stageName).aurora);

/**
 * Gets Valkey security group ID for a stage.
 * @param scope - CDK construct scope
 * @param stageName - Stage name for export name lookup
 * @returns Imported Valkey security group ID
 */
export const getValkeySecurityGroupId = (
  scope: Construct,
  stageName: string
): string => importValue(scope, getSecurityGroupExportNames(stageName).valkey);

/**
 * Gets Lambda security group ID for a stage.
 * @param scope - CDK construct scope
 * @param stageName - Stage name for export name lookup
 * @returns Imported Lambda security group ID
 */
export const getLambdaSecurityGroupId = (
  scope: Construct,
  stageName: string
): string => importValue(scope, getSecurityGroupExportNames(stageName).lambda);

/**
 * Gets Aurora export names matching aurora-stack.ts outputs.
 * @param stageName - Stage name for export name prefixes
 * @returns Object with Aurora export names for cluster endpoint, secret, proxy, and port
 */
export const getAuroraExportNames = (stageName: string) => ({
  clusterEndpoint: `${stageName}-aurora-cluster-endpoint`,
  secretArn: `${stageName}-aurora-secret-arn`,
  proxyEndpoint: `${stageName}-aurora-proxy-endpoint`,
  clusterPort: `${stageName}-aurora-cluster-port`,
});

/**
 * Gets Aurora cluster endpoint for a stage.
 * @param scope - CDK construct scope
 * @param stageName - Stage name for export name lookup
 * @returns Imported Aurora cluster endpoint hostname
 */
export const getAuroraClusterEndpoint = (
  scope: Construct,
  stageName: string
): string =>
  importValue(scope, getAuroraExportNames(stageName).clusterEndpoint);

/**
 * Gets Aurora cluster port for a stage.
 * @param scope - CDK construct scope
 * @param stageName - Stage name for export name lookup
 * @returns Imported Aurora cluster port
 */
export const getAuroraClusterPort = (
  scope: Construct,
  stageName: string
): string => importValue(scope, getAuroraExportNames(stageName).clusterPort);

/**
 * Gets Aurora secret ARN for a stage.
 * @param scope - CDK construct scope
 * @param stageName - Stage name for export name lookup
 * @returns Imported Aurora secret ARN
 */
export const getAuroraSecretArn = (
  scope: Construct,
  stageName: string
): string => importValue(scope, getAuroraExportNames(stageName).secretArn);

/**
 * Gets Aurora proxy endpoint for a stage.
 * @param scope - CDK construct scope
 * @param stageName - Stage name for export name lookup
 * @returns Imported Aurora proxy endpoint
 */
export const getAuroraProxyEndpoint = (
  scope: Construct,
  stageName: string
): string => importValue(scope, getAuroraExportNames(stageName).proxyEndpoint);

/**
 * Gets Valkey export names.
 * @param stageName - Stage name for export name prefixes
 * @returns Object with Valkey export names for endpoint, port, and replication group ID
 */
export const getValkeyExportNames = (stageName: string) => ({
  endpoint: `${stageName}-valkey-endpoint`,
  port: `${stageName}-valkey-port`,
  replicationGroupId: `${stageName}-valkey-replication-group-id`,
});

/**
 * Gets Valkey endpoint for a stage.
 * @param scope - CDK construct scope
 * @param stageName - Stage name for export name lookup
 * @returns Imported Valkey endpoint
 */
export const getValkeyEndpoint = (
  scope: Construct,
  stageName: string
): string => importValue(scope, getValkeyExportNames(stageName).endpoint);

/**
 * Gets Cognito export names.
 * @param stageName - Stage name for export name prefixes
 * @returns Object with Cognito export names for user pool ID, ARN, and app client ID
 */
export const getCognitoExportNames = (stageName: string) => ({
  userPoolId: `${stageName}-cognito-user-pool-id`,
  userPoolArn: `${stageName}-cognito-user-pool-arn`,
  appClientId: `${stageName}-cognito-app-client-id`,
});

/**
 * Gets Cognito user pool ID for a stage.
 * @param scope - CDK construct scope
 * @param stageName - Stage name for export name lookup
 * @returns Imported Cognito user pool ID
 */
export const getCognitoUserPoolId = (
  scope: Construct,
  stageName: string
): string => importValue(scope, getCognitoExportNames(stageName).userPoolId);

/**
 * Gets Cognito user pool ARN for a stage.
 * @param scope - CDK construct scope
 * @param stageName - Stage name for export name lookup
 * @returns Imported Cognito user pool ARN
 */
export const getCognitoUserPoolArn = (
  scope: Construct,
  stageName: string
): string => importValue(scope, getCognitoExportNames(stageName).userPoolArn);

/**
 * Gets SNS topic export names.
 * @param stageName - Stage name for export name prefixes
 * @returns Object with SNS export names for critical, warning, and info topic ARNs
 */
export const getSnsExportNames = (stageName: string) => ({
  criticalTopicArn: `${stageName}-sns-critical-topic-arn`,
  warningTopicArn: `${stageName}-sns-warning-topic-arn`,
  infoTopicArn: `${stageName}-sns-info-topic-arn`,
});

/**
 * Gets critical SNS topic ARN for a stage.
 * @param scope - CDK construct scope
 * @param stageName - Stage name for export name lookup
 * @returns Imported critical SNS topic ARN
 */
export const getCriticalTopicArn = (
  scope: Construct,
  stageName: string
): string => importValue(scope, getSnsExportNames(stageName).criticalTopicArn);

/**
 * Gets warning SNS topic ARN for a stage.
 * @param scope - CDK construct scope
 * @param stageName - Stage name for export name lookup
 * @returns Imported warning SNS topic ARN
 */
export const getWarningTopicArn = (
  scope: Construct,
  stageName: string
): string => importValue(scope, getSnsExportNames(stageName).warningTopicArn);

/**
 * Gets Lambda execution role export names.
 * @param stageName - Stage name for export name prefixes
 * @returns Object with IAM export names for Lambda execution role ARN and name
 */
export const getIamExportNames = (stageName: string) => ({
  lambdaExecutionRoleArn: `${stageName}-lambda-execution-role-arn`,
  lambdaExecutionRoleName: `${stageName}-lambda-execution-role-name`,
});

/**
 * Gets Lambda execution role ARN for a stage.
 * @param scope - CDK construct scope
 * @param stageName - Stage name for export name lookup
 * @returns Imported Lambda execution role ARN
 */
export const getLambdaExecutionRoleArn = (
  scope: Construct,
  stageName: string
): string =>
  importValue(scope, getIamExportNames(stageName).lambdaExecutionRoleArn);
