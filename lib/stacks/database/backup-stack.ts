/**
 * Backup Stack - Tag-Driven AWS Backup Plan
 *
 * Creates a backup plan with daily, weekly, and monthly retention policies
 * (5-year monthly retention), continuous backups for point-in-time recovery,
 * and cold storage archival. Resources are selected by tag: anything tagged
 * `backup=yes` in this account is included — tag Aurora clusters, DynamoDB
 * tables, EFS filesystems, or S3 buckets to opt them in.
 * @see config/environments.ts - features.backup flag per environment
 * @module lib/stacks/database/backup-stack
 */
import * as cdk from "aws-cdk-lib";
import { Duration } from "aws-cdk-lib";
import * as backup from "aws-cdk-lib/aws-backup";
import { Schedule } from "aws-cdk-lib/aws-events";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";

/**
 * Configuration properties for BackupStack.
 */
export interface BackupStackProps extends cdk.StackProps {
  /**
   * Stage name for resource naming.
   */
  readonly stageName: string;
}

/**
 * AWS Backup stack for automated resource backup management.
 */
export class BackupStack extends cdk.Stack {
  /**
   * The backup plan.
   */
  public readonly plan: backup.BackupPlan;

  /**
   * Creates the backup plan with scheduled rules and tag-based selection.
   * @param scope - Parent construct
   * @param id - Stack identifier
   * @param props - Stack configuration
   */
  constructor(scope: Construct, id: string, props: BackupStackProps) {
    super(scope, id, props);

    const role = new iam.Role(this, "BackupRole", {
      assumedBy: new iam.ServicePrincipal("backup.amazonaws.com"),
    });

    this.plan = backup.BackupPlan.dailyWeeklyMonthly5YearRetention(
      this,
      "BackupPlan"
    );

    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "AWSBackupServiceRolePolicyForS3Backup"
      )
    );

    this.plan.addSelection("BackupPlanSelection", {
      resources: [
        backup.BackupResource.fromTag("backup", "yes"), // All resources tagged backup=yes
      ],
      role,
    });

    // Monthly rule archiving to cold storage after 30 days
    this.plan.addRule(
      new backup.BackupPlanRule({
        completionWindow: Duration.hours(2),
        startWindow: Duration.hours(1),
        scheduleExpression: Schedule.cron({
          day: "15",
          hour: "3",
          minute: "30",
        }),
        moveToColdStorageAfter: Duration.days(30),
      })
    );

    // Continuous backup for point-in-time recovery
    this.plan.addRule(
      new backup.BackupPlanRule({
        enableContinuousBackup: true,
        deleteAfter: Duration.days(7),
      })
    );

    new cdk.CfnOutput(this, "BackupPlanId", {
      value: this.plan.backupPlanId,
      description: `Backup plan ID for ${props.stageName} environment`,
      exportName: `${props.stageName}-backup-plan-id`,
    });
  }
}
