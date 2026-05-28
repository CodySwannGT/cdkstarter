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
 * Dashboard widgets are grouped by resource type. Each widget type corresponds
 * to a specific CloudWatch metric visualization in the environment dashboard.
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
 * - **Free Storage**: 10GB critical allows time for intervention before
 *   writes fail
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
 * CloudWatch dashboard widget configuration by resource type.
 *
 * Each array specifies which metric widgets to display on the environment
 * dashboard. Widget identifiers map to specific CloudWatch metric visualizations
 * created by the DashboardStack.
 *
 * ## Widget Types
 *
 * - **Aurora**: Database performance metrics (connections, CPU, memory, IOPS, latency)
 * - **Valkey**: Cache performance metrics (hit rate, connections, memory, CPU)
 * - **Cognito**: Authentication flow metrics (sign-ins, sign-ups, token refreshes)
 * - **VPC**: Network metrics (NAT gateway throughput, data transfer)
 */
export const dashboardWidgets: DashboardWidgets = {
  aurora: ["connections", "cpu", "memory", "iops", "latency"],
  valkey: ["hitRate", "connections", "memory", "cpu"],
  cognito: ["signIns", "signUps", "tokenRefreshes"],
  vpc: ["natGateway", "dataTransfer"],
} as const;
