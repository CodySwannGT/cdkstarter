/**
 * Observability Configuration - Centralized Monitoring Settings
 *
 * This file centralizes all CloudWatch alarm thresholds and dashboard widget
 * configuration. Modifying thresholds here automatically updates all alarm
 * resources across all environments without code changes.
 *
 * ## Alarm Threshold Philosophy
 *
 * Thresholds are organized into warning and critical levels:
 * - **Warning**: Indicates potential issues that should be investigated
 *   but may not require immediate action (e.g., scaling considerations)
 * - **Critical**: Indicates issues requiring immediate attention to
 *   prevent service degradation or outages
 *
 * ## Dashboard Widget Configuration
 *
 * DashboardStack provides built-in metrics. Custom widget selection is not
 * implemented and must remain empty.
 * @see lib/stacks/observability/alarms-stack.ts - Alarm creation
 * @see lib/stacks/observability/dashboard-stack.ts - Dashboard creation
 * @module config/observability
 */
import type { AlarmThresholds, DashboardWidgets } from "../lib/types";

/**
 * CloudWatch alarm threshold configuration for all monitored resources.
 *
 * These thresholds drive alarm creation in the ObservabilityStage. Modify
 * values here to tune alerting sensitivity across all environments.
 *
 * ## Aurora Thresholds
 *
 * - **CPU**: 80% warning indicates potential scaling need; 95% critical
 *   indicates severe resource contention requiring immediate action
 * - **Memory**: Less than 1GB warning may cause query plan cache eviction;
 *   less than 500MB critical indicates high OOM risk
 * - **Connections**: 80% of max connections warning indicates possible
 *   connection leak or need for RDS Proxy tuning
 * - **Replication Lag**: 100ms warning acceptable for most reads; 1000ms
 *   critical indicates significant data inconsistency risk
 * - **Capacity**: 80/90% of configured maximum ACUs, by writer/reader role.
 *   Legacy free-storage GB settings are separate and do not drive capacity alarms
 *
 * ## Valkey Thresholds
 *
 * - **CPU**: 80% warning indicates cache under pressure; 95% critical
 *   indicates severe resource contention
 * - **Cache Hit Rate**: Below 80% warning indicates ineffective caching;
 *   below 50% critical indicates cache is not functioning properly
 * - **Evictions**: Any evictions (>0) warning indicate memory pressure;
 *   >1000 critical indicates severe memory issues
 */
export const alarmThresholds: AlarmThresholds = {
  aurora: {
    capacityWarningPercent: 80,
    capacityCriticalPercent: 90,
    cpuWarning: 80,
    cpuCritical: 95,
    memoryWarningMB: 1000,
    memoryCriticalMB: 500,
    connectionsWarning: 150,
    connectionsCritical: 200,
    replicationLagWarningMs: 100,
    replicationLagCriticalMs: 1000,
    freeStorageCriticalGB: 10,
  },
  valkey: {
    cpuWarning: 80,
    cpuCritical: 95,
    cacheHitRateWarning: 80,
    cacheHitRateCritical: 50,
    evictionsWarning: 0,
    evictionsCritical: 1000,
  },
} as const;

/**
 * Custom widget selection is currently unsupported. Keep these lists empty.
 * DashboardStack renders its built-in metrics when dashboardEnabled is true.
 */
export const dashboardWidgets: DashboardWidgets = {
  aurora: [],
  valkey: [],
  cognito: [],
  vpc: [],
} as const;
