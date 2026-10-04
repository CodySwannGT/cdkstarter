/** Offline enrollment and actual deployed notification handler contracts. */
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { alarmThresholds } from "../../config/observability";
import { stageEnvironments } from "../../config/environments";
import { BackupStack } from "../../lib/stacks/database/backup-stack";
import { EnvironmentStage } from "../../lib/stages/environment-stage";
import { SnsStack } from "../../lib/stacks/observability/sns-stack";

const outputs: string[] = [];
const createApp = () => {
  const outdir = mkdtempSync(join(tmpdir(), "starter-backup-"));
  outputs.push(outdir);
  return new cdk.App({ outdir });
};
const requireAsset = createRequire(resolve(__dirname, "../../package.json"));
const loadHandler = () => {
  const path = requireAsset.resolve(
    resolve(
      __dirname,
      "../../resources/observability/sentry-forwarder/index.js"
    )
  );
  delete requireAsset.cache[path];
  return requireAsset(path) as {
    handler(event: Record<string, unknown>): Promise<{ forwarded: number }>;
  };
};
const production = stageEnvironments.find(
  environment => environment.name === "production"
)!;
beforeEach(() => {
  vi.stubEnv("SENTRY_DSN", "https://fixture-key@sentry.example.invalid/42");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true } as Response));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  outputs
    .splice(0)
    .forEach(output => rmSync(output, { recursive: true, force: true }));
});
const stage = (enabled: boolean) =>
  new EnvironmentStage(createApp(), "Env-test", {
    environment: {
      ...production,
      accountId: "123456789012",
      features: { ...production.features, backup: enabled },
    },
    alarmThresholds,
    env: { account: "123456789012", region: "us-east-1" },
  });
const event = (state: string) => ({
  source: "aws.backup",
  "detail-type": "Backup Job State Change",
  detail: { state, resourceType: "Aurora", backupJobId: "fixture-job" },
});
const sent = () => JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));

describe("starter AWS Backup contract", () => {
  it("enrolls the real Aurora cluster in a nonempty matching selection without changing native retention", () => {
    const environment = stage(true);
    const cluster = Template.fromStack(
      environment.node.findChild("AuroraStack") as cdk.Stack
    );
    cluster.hasResourceProperties("AWS::RDS::DBCluster", {
      BackupRetentionPeriod: production.aurora.backupRetentionDays,
      Tags: Match.arrayWith([{ Key: "backup", Value: "yes" }]),
    });
    const backup = Template.fromStack(
      environment.node.findChild("BackupStack") as cdk.Stack
    );
    backup.hasResourceProperties("AWS::Backup::BackupSelection", {
      BackupSelection: Match.objectLike({
        ListOfTags: [
          {
            ConditionType: "STRINGEQUALS",
            ConditionKey: "backup",
            ConditionValue: "yes",
          },
        ],
      }),
    });
    const roles = Object.values(backup.findResources("AWS::IAM::Role"));
    expect(JSON.stringify(roles)).toContain(
      "AWSBackupServiceRolePolicyForBackup"
    );
  });
  it("disabled mode has no plan/enrollment and retains Aurora native backups", () => {
    const environment = stage(false);
    expect(environment.node.tryFindChild("BackupStack")).toBeUndefined();
    const clusters = Object.values(
      Template.fromStack(
        environment.node.findChild("AuroraStack") as cdk.Stack
      ).findResources("AWS::RDS::DBCluster")
    );
    expect(clusters[0].Properties.BackupRetentionPeriod).toBe(
      production.aurora.backupRetentionDays
    );
    expect(clusters[0].Properties.Tags ?? []).not.toContainEqual({
      Key: "backup",
      Value: "yes",
    });
  });
  it.each(
    [
      [],
      [{ key: "", value: "yes" }],
      [{ key: "backup", value: "" }],
      [{ key: "backup", value: "   " }],
      [{ key: "aws:backup", value: "yes" }],
    ].map(selectionTags => ({ selectionTags }))
  )(
    "rejects empty/malformed structural tag selection $selectionTags",
    ({ selectionTags }) => {
      expect(
        () =>
          new BackupStack(createApp(), "Backup", {
            stageName: "test",
            selectionTags,
          })
      ).toThrow(/backup selection/i);
    }
  );
  it("keeps exactly one failure event target and excludes success states from its rule", () => {
    const stack = new SnsStack(createApp(), "Alerts", {
      stageName: "test",
      criticalEmails: [],
      warningEmails: [],
      infoEmails: [],
      sentryDsn: "https://fixture-key@sentry.example.invalid/42",
      backupFailureAlerts: true,
    });
    const rules = Object.values(
      Template.fromStack(stack).findResources("AWS::Events::Rule")
    );
    expect(rules).toHaveLength(1);
    expect(rules[0].Properties.Targets).toHaveLength(1);
    expect(rules[0].Properties.EventPattern.detail.state).toEqual([
      "FAILED",
      "ABORTED",
      "EXPIRED",
    ]);
  });
  it.each(["FAILED", "EXPIRED", "ABORTED"])(
    "direct %s produces one critical error event",
    async state => {
      expect(await loadHandler().handler(event(state))).toEqual({
        forwarded: 1,
      });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(sent()).toMatchObject({
        level: "error",
        tags: { source: "aws-backup", severity: "critical", state },
        extra: { backup_job_id: "fixture-job" },
      });
    }
  );
  it.each(["FAILED", "EXPIRED", "ABORTED"])(
    "SNS %s retains the configured warning route without duplicate forwarding",
    async state => {
      expect(
        await loadHandler().handler({
          Records: [
            {
              Sns: {
                Message: JSON.stringify(event(state)),
                TopicArn: "arn:aws:sns:us-east-1:123456789012:warning",
              },
            },
          ],
        })
      ).toEqual({ forwarded: 1 });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(sent()).toMatchObject({
        level: "warning",
        tags: { source: "aws-backup", severity: "warning", state },
      });
    }
  );
  it.each(["COMPLETED", "RUNNING"])(
    "%s does not page through either input route",
    async state => {
      const handler = loadHandler();
      expect(await handler.handler(event(state))).toEqual({ forwarded: 0 });
      expect(
        await handler.handler({
          Records: [
            {
              Sns: {
                Message: JSON.stringify(event(state)),
                TopicArn: "topic:critical",
              },
            },
          ],
        })
      ).toEqual({ forwarded: 0 });
      expect(fetch).not.toHaveBeenCalled();
    }
  );
});
