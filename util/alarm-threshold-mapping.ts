/**
 * Alarm Threshold Mapping
 *
 * Maps the config-file alarm threshold shape (config/observability.ts) to
 * the stack prop shapes expected by the alarm stacks. Shared by the direct
 * deploy entry point (bin/app.ts) and the CDK Pipeline's per-environment
 * stage so the mapping can never drift between deploy modes.
 * @see config/observability.ts - Source thresholds
 * @see lib/stacks/observability/aurora-alarms-stack.ts - Target shape
 * @see lib/stacks/observability/valkey-alarms-stack.ts - Target shape
 * @module util/alarm-threshold-mapping
 */
import type { AuroraAlarmsThresholds } from "../lib/stacks/observability/aurora-alarms-stack";
import type { ValkeyAlarmsThresholds } from "../lib/stacks/observability/valkey-alarms-stack";
import type { AlarmThresholds } from "../lib/types";

/**
 * Maps config alarm thresholds to the Aurora alarms stack prop shape.
 * @param thresholds - Combined alarm thresholds from config
 * @returns Aurora alarm thresholds in stack prop shape
 */
export const toAuroraAlarmsThresholds = (
  thresholds: AlarmThresholds
): AuroraAlarmsThresholds => ({
  cpuCriticalPercent: thresholds.aurora.cpuCritical,
  cpuWarningPercent: thresholds.aurora.cpuWarning,
  storageCriticalGB: thresholds.aurora.freeStorageCriticalGB,
  storageWarningGB: thresholds.aurora.freeStorageCriticalGB * 2,
  connectionsCritical: thresholds.aurora.connectionsCritical,
  connectionsWarning: thresholds.aurora.connectionsWarning,
  replicationLagMs: thresholds.aurora.replicationLagCriticalMs,
});

/**
 * Maps config alarm thresholds to the Valkey alarms stack prop shape.
 * @param thresholds - Combined alarm thresholds from config
 * @returns Valkey alarm thresholds in stack prop shape
 */
export const toValkeyAlarmsThresholds = (
  thresholds: AlarmThresholds
): ValkeyAlarmsThresholds => ({
  cpuWarningPercent: thresholds.valkey.cpuWarning,
  cpuCriticalPercent: thresholds.valkey.cpuCritical,
  cacheHitRateWarningPercent: thresholds.valkey.cacheHitRateWarning,
  cacheHitRateCriticalPercent: thresholds.valkey.cacheHitRateCritical,
  evictionsWarning: thresholds.valkey.evictionsWarning,
  evictionsCritical: thresholds.valkey.evictionsCritical,
});
