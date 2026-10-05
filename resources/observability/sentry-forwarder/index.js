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
  const url = (() => {
    try {
      return new URL(dsn);
    } catch {
      throw new Error("Invalid Sentry DSN configuration");
    }
  })();
  return {
    publicKey: url.username,
    host: url.host,
    projectId: url.pathname.replace(/^\//, ""),
  };
};

/**
 * Reject transport failures without exposing request data or raw error causes.
 * @param {string} url - Ingestion endpoint.
 * @param {object} options - Fetch request options.
 * @returns {Promise<object>} HTTP response.
 */
const postToSentry = async (url, options) => {
  try {
    return await fetch(url, options);
  } catch (error) {
    const category = ["TimeoutError", "AbortError"].includes(error?.name)
      ? "timeout"
      : "network";
    throw new Error(`Sentry transport failed (${category})`);
  }
};

/**
 * POSTs one event to Sentry's store endpoint.
 * @param {object} event - The Sentry event payload.
 * @returns {Promise<void>} Resolves when Sentry accepts the event.
 */
const sendToSentry = async event => {
  const { publicKey, host, projectId } = parseDsn(process.env.SENTRY_DSN);
  const res = await postToSentry(`https://${host}/api/${projectId}/store/`, {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    headers: {
      "Content-Type": "application/json",
      "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=infrastructure-observability/1.0`,
    },
    body: JSON.stringify(event),
  });
  if (!res.ok) {
    const status =
      Number.isInteger(res.status) && res.status >= 100 && res.status <= 599
        ? res.status
        : "unknown";
    throw new Error(`Sentry ingestion failed (HTTP ${status})`);
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
 * Read bounded versioned cause metadata, otherwise preserve legacy grouping.
 * @param {object} msg - Alarm notification.
 * @returns {string[]} Stable fingerprint without severity.
 */
const alarmFingerprint = msg => {
  if (
    process.env.CAUSE_GROUPING !== "true" ||
    typeof msg.AlarmDescription !== "string" ||
    msg.AlarmDescription.length > 1024
  )
    return [msg.AlarmName];
  const metadata = parseJson(msg.AlarmDescription);
  const validKey = value =>
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 512 &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/.test(value);
  if (
    !metadata ||
    metadata.version !== 1 ||
    metadata.environment !== STAGE ||
    !validKey(metadata.identity) ||
    !validKey(metadata.cause)
  )
    return [msg.AlarmName];
  return ["infra-cause-v1", STAGE, metadata.identity, metadata.cause];
};

/**
 * Maps a CloudWatch alarm state-change notification to a Sentry event.
 * @param {object} msg - The parsed SNS alarm message.
 * @param {string} severity - Severity derived from the source topic.
 * @returns {object} A Sentry event payload.
 */
const alarmEvent = (msg, severity) => {
  if (!["ALARM", "OK", "INSUFFICIENT_DATA"].includes(msg.NewStateValue)) {
    throw new Error("Invalid CloudWatch alarm state");
  }
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
    alarmFingerprint(msg)
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
 * @param {string} severity - Existing SNS route, or critical for direct events.
 * @returns {object} A Sentry event payload.
 */
const backupEvent = (event, severity = "critical") => {
  const detail = event.detail || {};
  return baseEvent(
    `[${STAGE}] AWS Backup job ${detail.state}: ${detail.resourceType || "unknown resource"}`,
    severity === "warning" ? "warning" : "error",
    {
      source: "aws-backup",
      severity,
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
 * Ignore successful/in-progress Backup jobs even if invoked outside the rule.
 * @param {object} event - Backup state-change event.
 * @returns {boolean} Whether this state needs an alert.
 */
const isBackupFailure = event => {
  const detail = event.detail;
  if (
    !detail ||
    typeof detail !== "object" ||
    typeof detail.state !== "string" ||
    !detail.state
  ) {
    throw new Error("Invalid Backup job detail/state");
  }
  const failure = ["FAILED", "ABORTED", "EXPIRED"].includes(detail.state);
  if (
    failure &&
    (typeof detail.backupJobId !== "string" || !detail.backupJobId)
  ) {
    throw new Error("Invalid Backup job identifier");
  }
  return failure;
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
 * @returns {object|null} A Sentry event payload, or an ignored Backup state.
 */
const snsRecordEvent = record => {
  if (!record?.Sns || typeof record.Sns.Message !== "string") {
    throw new Error("Invalid SNS record: Message must be a string");
  }
  const msg = parseJson(record.Sns.Message);
  const severity = severityFromTopic(record.Sns.TopicArn);
  if (
    msg &&
    (msg.source === "aws.backup" ||
      msg["detail-type"] === "Backup Job State Change")
  ) {
    return isBackupFailure(msg)
      ? backupEvent(msg, severity === "warning" ? "warning" : "critical")
      : null;
  }
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
  if (!event || typeof event !== "object") {
    throw new Error("Invalid notification event");
  }
  if (event.Records !== undefined && !Array.isArray(event.Records)) {
    throw new Error("Invalid SNS records: expected an array");
  }
  const events = event.Records
    ? event.Records.map(snsRecordEvent).filter(Boolean)
    : event.source === "aws.backup" && isBackupFailure(event)
      ? [backupEvent(event)]
      : [];
  await Promise.all(events.map(sendToSentry));
  return { forwarded: events.length };
};
