/** Validate an explicitly owned account/region SMS monitor before synth. */
import type { SmsMonitoringConfig } from "../lib/types";

/** Complete enabled configuration after validation. */
export type EnabledSmsMonitoringConfig = Required<SmsMonitoringConfig>;

/**
 * Reject incomplete settings and unsupported account/destination identities.
 * @param config - Optional default-off module
 * @param account - Owning support account
 * @param region - Owning SMS region
 */
export const validateSmsMonitoring = (
  config: SmsMonitoringConfig | undefined,
  account: string,
  region: string
): void => {
  if (config === undefined) return;
  if (typeof config.enabled !== "boolean")
    throw new Error("smsMonitoring.enabled must be a boolean.");
  if (!config.enabled) return;
  const amounts = [
    config.monthlyPreferenceUsd,
    config.dailyCapUsd,
    config.fiveMinuteSurgeUsd,
  ];
  const topic =
    /^arn:(aws|aws-cn|aws-us-gov):sns:([a-z0-9-]+):(\d{12}):[A-Za-z0-9_-]{1,256}$/.exec(
      config.notificationTopicArn ?? ""
    );
  const partition = region.startsWith("cn-")
    ? "aws-cn"
    : region.startsWith("us-gov-")
      ? "aws-us-gov"
      : "aws";
  if (
    !amounts.every(
      value => typeof value === "number" && Number.isFinite(value) && value > 0
    ) ||
    (config.dailyCapUsd ?? Infinity) > (config.monthlyPreferenceUsd ?? 0)
  )
    throw new Error(
      "smsMonitoring requires finite positive monthlyPreferenceUsd, dailyCapUsd <= monthlyPreferenceUsd, and fiveMinuteSurgeUsd."
    );
  if (
    typeof config.warningPercent !== "number" ||
    !Number.isFinite(config.warningPercent) ||
    config.warningPercent <= 0 ||
    config.warningPercent >= 100
  )
    throw new Error(
      "smsMonitoring.warningPercent must be strictly between 0 and 100."
    );
  if (
    !topic ||
    topic[1] !== partition ||
    topic[2] !== region ||
    topic[3] !== account ||
    !/^\d{12}$/.test(account)
  )
    throw new Error(
      "smsMonitoring requires a concrete owning account/region and standard notificationTopicArn in that account/region/partition."
    );
  if (
    config.mode !== undefined &&
    !["observe", "enforce"].includes(config.mode)
  )
    throw new Error("smsMonitoring.mode must be observe or enforce.");
};
