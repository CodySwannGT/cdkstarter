/**
 * Tests for BackupStack.
 *
 * @module test/stacks/database/backup-stack.test
 */
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { BackupStack } from "../../../lib/stacks/database/backup-stack";

describe("BackupStack", () => {
  const createTemplate = (): Template => {
    const app = new cdk.App();
    const stack = new BackupStack(app, "TestStack", {
      stageName: "dev",
      env: { account: "111111111111", region: "us-east-1" },
    });
    return Template.fromStack(stack);
  };

  describe("Backup Plan", () => {
    it("should create a backup plan", () => {
      const template = createTemplate();

      template.resourceCountIs("AWS::Backup::BackupPlan", 1);
    });

    it("should include daily, weekly, monthly, cold-storage, and continuous rules", () => {
      const template = createTemplate();

      template.hasResourceProperties("AWS::Backup::BackupPlan", {
        BackupPlan: Match.objectLike({
          BackupPlanRule: Match.arrayWith([
            Match.objectLike({ RuleName: "Daily" }),
            Match.objectLike({ RuleName: "Weekly" }),
            Match.objectLike({ RuleName: "Monthly5Year" }),
            Match.objectLike({ EnableContinuousBackup: true }),
          ]),
        }),
      });
    });
  });

  describe("Selection", () => {
    it("should select resources by the backup=yes tag", () => {
      const template = createTemplate();

      template.hasResourceProperties("AWS::Backup::BackupSelection", {
        BackupSelection: Match.objectLike({
          ListOfTags: [
            Match.objectLike({
              ConditionKey: "backup",
              ConditionValue: "yes",
              ConditionType: "STRINGEQUALS",
            }),
          ],
        }),
      });
    });
  });

  describe("Outputs", () => {
    it("should export the backup plan ID", () => {
      const template = createTemplate();

      template.hasOutput("BackupPlanId", {
        Export: { Name: "dev-backup-plan-id" },
      });
    });
  });
});
