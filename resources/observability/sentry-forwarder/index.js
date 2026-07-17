"use strict";

/**
 * Sentry forwarder — turns CloudWatch alarm SNS notifications, CodePipeline
 * notification events, and other SNS messages into Sentry events tagged
 * `triage:ready` so agents can pick them up from the Sentry queue.
 *
 * Dependency-free: global fetch for Sentry ingestion. The DSN arrives via the
 * SENTRY_DSN env var — it is a publishable client key (write-only), not a
 * secret.
 */

const STAGE = process.env.STAGE || "unknown";

/**
 * Splits a DSN into the pieces the store endpoint needs.
 * @param {string} dsn - The Sentry DSN.
 * @returns {{publicKey: string, host: string, projectId: string}} DSN parts.
 */
const parseDsn = dsn => {
  const url = new URL(dsn);
  return {
    publicKey: url.username,
    host: url.host,
    projectId: url.pathname.replace(/^\//, ""),
  };
};

/**
 * POSTs one event to Sentry's store endpoint.
 * @param {object} event - The Sentry event payload.
 * @returns {Promise<void>} Resolves when Sentry accepts the event.
 */
const sendToSentry = async event => {
  const { publicKey, host, projectId } = parseDsn(process.env.SENTRY_DSN);
  const res = await fetch(`https://${host}/api/${projectId}/store/`, {
    method: "POST",
    // Bound well below the Lambda timeout so a slow Sentry ingest fails this
    // event instead of consuming the whole invocation and triggering retries.
    signal: AbortSignal.timeout(10000),
    headers: {
      "Content-Type": "application/json",
      "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=infrastructure-observability/1.0`,
    },
    body: JSON.stringify(event),
  });
  if (!res.ok) {
    throw new Error(`Sentry responded ${res.status}: ${await res.text()}`);
  }
};

/**
 * Derives the alert severity from the SNS topic the message arrived on.
 * @param {string} topicArn - The source topic ARN.
 * @returns {string} critical, warning, info, or unknown.
 */
const severityFromTopic = topicArn => {
  const match = /critical|warning|info/i.exec(topicArn || "");
  return match ? match[0].toLowerCase() : "unknown";
};

/**
 * Builds the base event shape shared by every source.
 * @param {string} message - Human-readable summary line.
 * @param {string} level - Sentry level (error, warning, info).
 * @param {object} tags - Source-specific tags (triage:ready is always added).
 * @param {object} extra - Diagnosis context attached to the event.
 * @param {string[]} fingerprint - Grouping key so repeats fold into one issue.
 * @returns {object} A Sentry event payload.
 */
const baseEvent = (message, level, tags, extra, fingerprint) => ({
  message,
  level,
  platform: "other",
  environment: STAGE,
  tags: { triage: "ready", ...tags },
  extra,
  fingerprint,
});

/**
 * Maps a CloudWatch alarm state-change notification to a Sentry event.
 * @param {object} msg - The parsed SNS alarm message.
 * @param {string} severity - Severity derived from the source topic.
 * @returns {object} A Sentry event payload.
 */
const alarmEvent = (msg, severity) => {
  const region = msg.AlarmArn ? msg.AlarmArn.split(":")[3] : "us-east-1";
  const consoleUrl = `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#alarmsV2:alarm/${encodeURIComponent(msg.AlarmName)}`;
  const inAlarm = msg.NewStateValue === "ALARM";
  return baseEvent(
    `[${STAGE}] ${msg.AlarmName} is ${msg.NewStateValue}`,
    inAlarm ? "error" : "info",
    {
      source: "cloudwatch-alarm",
      alarm: msg.AlarmName,
      state: msg.NewStateValue,
      severity,
    },
    {
      reason: msg.NewStateReason,
      description: msg.AlarmDescription,
      trigger: msg.Trigger,
      account: msg.AWSAccountId,
      console_url: consoleUrl,
    },
    [msg.AlarmName]
  );
};

/**
 * Maps a CodePipeline notification (codestar-notifications) to a Sentry event.
 * @param {object} msg - The parsed SNS notification message.
 * @returns {object} A Sentry event payload.
 */
const pipelineEvent = msg => {
  const state = msg.detail && msg.detail.state;
  const pipeline = msg.detail && msg.detail.pipeline;
  return baseEvent(
    `[${STAGE}] pipeline ${pipeline} ${state}`,
    state === "FAILED" ? "error" : "info",
    { source: "codepipeline", pipeline, state },
    { detail: msg.detail, region: msg.region },
    [`pipeline-${pipeline}`]
  );
};

/**
 * Maps a failed AWS Backup job (via EventBridge) to a Sentry event.
 * @param {object} event - The EventBridge invocation payload.
 * @returns {object} A Sentry event payload.
 */
const backupEvent = event => {
  const detail = event.detail || {};
  return baseEvent(
    `[${STAGE}] AWS Backup job ${detail.state}: ${detail.resourceType || "unknown resource"}`,
    "error",
    {
      source: "aws-backup",
      state: detail.state,
      resource_type: detail.resourceType,
    },
    {
      backup_job_id: detail.backupJobId,
      status_message: detail.statusMessage,
      resource_arn: detail.resourceArn,
    },
    ["backup-job-failure", detail.resourceType || "unknown"]
  );
};

/**
 * Parses a JSON string, returning null instead of throwing.
 * @param {string} raw - The candidate JSON.
 * @returns {object|null} The parsed value, or null when unparseable.
 */
const parseJson = raw => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/**
 * Maps one SNS record to a Sentry event by sniffing the message shape.
 * @param {object} record - The SNS record from the Lambda event.
 * @returns {object} A Sentry event payload.
 */
const snsRecordEvent = record => {
  const msg = parseJson(record.Sns.Message);
  const severity = severityFromTopic(record.Sns.TopicArn);
  if (msg && msg.AlarmName) return alarmEvent(msg, severity);
  if (msg && (msg.detailType || msg["detail-type"])) return pipelineEvent(msg);
  return baseEvent(
    `[${STAGE}] ${record.Sns.Subject || "notification"}`,
    severity === "critical" ? "error" : "warning",
    { source: "sns", severity },
    { message: msg ?? record.Sns.Message },
    [record.Sns.TopicArn]
  );
};

/**
 * Lambda entry point: fans SNS records and EventBridge events out to Sentry.
 * @param {object} event - The SNS or EventBridge invocation payload.
 * @returns {Promise<{forwarded: number}>} How many events were sent.
 */
exports.handler = async event => {
  const events = event.Records
    ? event.Records.map(snsRecordEvent)
    : event.source === "aws.backup" && event.detail
      ? [backupEvent(event)]
      : [];
  await Promise.all(events.map(sendToSentry));
  return { forwarded: events.length };
};
