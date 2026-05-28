/**
 * Tests for DashboardStack.
 *
 * @module test/stacks/observability/dashboard-stack.test
 */
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { DashboardStack } from "../../../lib/stacks/observability/dashboard-stack";

describe("DashboardStack", () => {
  const createStack = (
    options: {
      stageName?: string;
      auroraClusterId?: string;
      valkeyReplicationGroupId?: string;
    } = {}
  ): Template => {
    const {
      stageName = "test",
      auroraClusterId,
      valkeyReplicationGroupId,
    } = options;

    const app = new cdk.App();

    const dashboardStack = new DashboardStack(app, "DashboardStack", {
      stageName,
      auroraClusterId,
      valkeyReplicationGroupId,
      env: { account: "123456789012", region: "us-east-1" },
    });

    return Template.fromStack(dashboardStack);
  };

  describe("Dashboard Resource", () => {
    it("should create a CloudWatch dashboard", () => {
      const template = createStack();

      template.resourceCountIs("AWS::CloudWatch::Dashboard", 1);
    });

    it("should create dashboard with minimal props (no Aurora or Valkey)", () => {
      const template = createStack();

      template.resourceCountIs("AWS::CloudWatch::Dashboard", 1);
    });

    it("should create dashboard with Aurora cluster ID", () => {
      const template = createStack({
        auroraClusterId: "test-aurora-cluster",
      });

      template.resourceCountIs("AWS::CloudWatch::Dashboard", 1);
    });

    it("should create dashboard with Valkey replication group ID", () => {
      const template = createStack({
        valkeyReplicationGroupId: "test-valkey-replication-group",
      });

      template.resourceCountIs("AWS::CloudWatch::Dashboard", 1);
    });

    it("should create dashboard with both Aurora and Valkey", () => {
      const template = createStack({
        auroraClusterId: "test-aurora-cluster",
        valkeyReplicationGroupId: "test-valkey-replication-group",
      });

      template.resourceCountIs("AWS::CloudWatch::Dashboard", 1);
    });
  });

  describe("Outputs", () => {
    it("should export dashboard URL", () => {
      const template = createStack();

      template.hasOutput("DashboardUrl", {
        Export: {
          Name: "test-dashboard-url",
        },
      });
    });

    it("should use stageName in output export name", () => {
      const template = createStack({ stageName: "staging" });

      template.hasOutput("DashboardUrl", {
        Export: {
          Name: "staging-dashboard-url",
        },
      });
    });

    it("should use production stageName in output export name", () => {
      const template = createStack({ stageName: "production" });

      template.hasOutput("DashboardUrl", {
        Export: {
          Name: "production-dashboard-url",
        },
      });
    });
  });
});
