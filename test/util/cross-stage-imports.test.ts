/**
 * Tests for cross-stage import utilities.
 *
 * @module test/util/cross-stage-imports.test
 */
import * as cdk from "aws-cdk-lib";
import {
  importValue,
  getVpcIdExportName,
  getVpcId,
  importVpc,
  getAvailabilityZonesExportName,
  getAvailabilityZones,
  getSecurityGroupExportNames,
  getAuroraSecurityGroupId,
  getValkeySecurityGroupId,
  getLambdaSecurityGroupId,
  getAuroraExportNames,
  getAuroraClusterEndpoint,
  getAuroraClusterPort,
  getAuroraSecretArn,
  getAuroraProxyEndpoint,
  getValkeyExportNames,
  getValkeyEndpoint,
  getCognitoExportNames,
  getCognitoUserPoolId,
  getCognitoUserPoolArn,
  getSnsExportNames,
  getCriticalTopicArn,
  getWarningTopicArn,
  getIamExportNames,
  getLambdaExecutionRoleArn,
} from "../../util/cross-stage-imports";

describe("cross-stage-imports", () => {
  const createScope = (): cdk.Stack => {
    const app = new cdk.App();
    return new cdk.Stack(app, "TestStack", {
      env: { account: "123456789012", region: "us-east-1" },
    });
  };

  describe("importValue", () => {
    it("should return a CloudFormation import value token", () => {
      const scope = createScope();
      const result = importValue(scope, "test-export");

      expect(typeof result).toBe("string");
      expect(result).toBeDefined();
    });
  });

  describe("VPC export names", () => {
    it("should generate correct VPC ID export name", () => {
      expect(getVpcIdExportName("dev")).toBe("dev-vpc-id");
    });

    it("should generate correct VPC ID export name for production", () => {
      expect(getVpcIdExportName("production")).toBe("production-vpc-id");
    });

    it("should return a token for getVpcId", () => {
      const scope = createScope();
      const result = getVpcId(scope, "dev");

      expect(typeof result).toBe("string");
    });

    it("should generate correct availability zones export name", () => {
      expect(getAvailabilityZonesExportName("dev")).toBe(
        "dev-availability-zones"
      );
    });

    it("should return a token for getAvailabilityZones", () => {
      const scope = createScope();
      const result = getAvailabilityZones(scope, "dev");

      expect(typeof result).toBe("string");
    });
  });

  describe("importVpc", () => {
    it("should return an IVpc from imported attributes", () => {
      const scope = createScope();
      const vpc = importVpc(scope, "ImportedVpc", "dev");

      expect(vpc).toBeDefined();
      expect(vpc.vpcId).toBeDefined();
    });
  });

  describe("Security group export names", () => {
    it("should generate correct security group export names", () => {
      const names = getSecurityGroupExportNames("dev");

      expect(names.aurora).toBe("dev-aurora-security-group-id");
      expect(names.valkey).toBe("dev-valkey-security-group-id");
      expect(names.lambda).toBe("dev-lambda-security-group-id");
    });

    it("should return tokens for security group ID imports", () => {
      const scope = createScope();

      expect(typeof getAuroraSecurityGroupId(scope, "dev")).toBe("string");
      expect(typeof getValkeySecurityGroupId(scope, "dev")).toBe("string");
      expect(typeof getLambdaSecurityGroupId(scope, "dev")).toBe("string");
    });
  });

  describe("Aurora export names", () => {
    it("should generate correct Aurora export names", () => {
      const names = getAuroraExportNames("staging");

      expect(names.clusterEndpoint).toBe("staging-aurora-cluster-endpoint");
      expect(names.secretArn).toBe("staging-aurora-secret-arn");
      expect(names.proxyEndpoint).toBe("staging-aurora-proxy-endpoint");
      expect(names.clusterPort).toBe("staging-aurora-cluster-port");
    });

    it("should return tokens for Aurora imports", () => {
      const scope = createScope();

      expect(typeof getAuroraClusterEndpoint(scope, "dev")).toBe("string");
      expect(typeof getAuroraClusterPort(scope, "dev")).toBe("string");
      expect(typeof getAuroraSecretArn(scope, "dev")).toBe("string");
      expect(typeof getAuroraProxyEndpoint(scope, "dev")).toBe("string");
    });
  });

  describe("Valkey export names", () => {
    it("should generate correct Valkey export names", () => {
      const names = getValkeyExportNames("production");

      expect(names.endpoint).toBe("production-valkey-endpoint");
      expect(names.port).toBe("production-valkey-port");
      expect(names.replicationGroupId).toBe(
        "production-valkey-replication-group-id"
      );
    });

    it("should return a token for getValkeyEndpoint", () => {
      const scope = createScope();

      expect(typeof getValkeyEndpoint(scope, "dev")).toBe("string");
    });
  });

  describe("Cognito export names", () => {
    it("should generate correct Cognito export names", () => {
      const names = getCognitoExportNames("dev");

      expect(names.userPoolId).toBe("dev-cognito-user-pool-id");
      expect(names.userPoolArn).toBe("dev-cognito-user-pool-arn");
      expect(names.appClientId).toBe("dev-cognito-app-client-id");
    });

    it("should return tokens for Cognito imports", () => {
      const scope = createScope();

      expect(typeof getCognitoUserPoolId(scope, "dev")).toBe("string");
      expect(typeof getCognitoUserPoolArn(scope, "dev")).toBe("string");
    });
  });

  describe("SNS export names", () => {
    it("should generate correct SNS export names", () => {
      const names = getSnsExportNames("staging");

      expect(names.criticalTopicArn).toBe("staging-sns-critical-topic-arn");
      expect(names.warningTopicArn).toBe("staging-sns-warning-topic-arn");
      expect(names.infoTopicArn).toBe("staging-sns-info-topic-arn");
    });

    it("should return tokens for SNS imports", () => {
      const scope = createScope();

      expect(typeof getCriticalTopicArn(scope, "dev")).toBe("string");
      expect(typeof getWarningTopicArn(scope, "dev")).toBe("string");
    });
  });

  describe("IAM export names", () => {
    it("should generate correct IAM export names", () => {
      const names = getIamExportNames("production");

      expect(names.lambdaExecutionRoleArn).toBe(
        "production-lambda-execution-role-arn"
      );
      expect(names.lambdaExecutionRoleName).toBe(
        "production-lambda-execution-role-name"
      );
    });

    it("should return a token for getLambdaExecutionRoleArn", () => {
      const scope = createScope();

      expect(typeof getLambdaExecutionRoleArn(scope, "dev")).toBe("string");
    });
  });
});
