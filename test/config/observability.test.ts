/**
 * Unit tests for observability configuration.
 *
 * These tests verify the alarm threshold structure, ensure warning thresholds
 * are less severe than critical thresholds, and validate dashboard widget
 * configuration.
 *
 * @module test/config/observability.test
 */
import { alarmThresholds, dashboardWidgets } from "../../config/observability";
import { validateConfiguration } from "../../util/config-loader";

describe("observability", () => {
  describe("alarmThresholds", () => {
    it("should export alarmThresholds", () => {
      expect(alarmThresholds).toBeDefined();
      expect(alarmThresholds.aurora).toBeDefined();
      expect(alarmThresholds.valkey).toBeDefined();
    });

    it("should have aurora CPU warning less than critical", () => {
      expect(alarmThresholds.aurora.cpuWarning).toBeLessThan(
        alarmThresholds.aurora.cpuCritical
      );
    });

    it("should have aurora memory warning greater than critical (higher is better)", () => {
      // For memory, higher values are better, so warning should be > critical
      expect(alarmThresholds.aurora.memoryWarningMB).toBeGreaterThan(
        alarmThresholds.aurora.memoryCriticalMB
      );
    });

    it("should have aurora replication lag warning less than critical", () => {
      expect(alarmThresholds.aurora.replicationLagWarningMs).toBeLessThan(
        alarmThresholds.aurora.replicationLagCriticalMs
      );
    });

    it("should have reasonable aurora threshold values", () => {
      expect(alarmThresholds.aurora.cpuWarning).toBe(80);
      expect(alarmThresholds.aurora.cpuCritical).toBe(95);
      expect(alarmThresholds.aurora.memoryWarningMB).toBe(1000);
      expect(alarmThresholds.aurora.memoryCriticalMB).toBe(500);
      expect(alarmThresholds.aurora.connectionsWarning).toBe(150);
      expect(alarmThresholds.aurora.connectionsCritical).toBe(200);
      expect(alarmThresholds.aurora.freeStorageCriticalGB).toBe(10);
    });

    it("should have aurora connections warning less than critical", () => {
      expect(alarmThresholds.aurora.connectionsWarning).toBeLessThan(
        alarmThresholds.aurora.connectionsCritical
      );
    });

    it("should have valkey threshold values", () => {
      expect(alarmThresholds.valkey.cpuWarning).toBe(80);
      expect(alarmThresholds.valkey.cacheHitRateWarning).toBe(80);
      expect(alarmThresholds.valkey.evictionsWarning).toBe(0);
    });
  });

  describe("dashboardWidgets", () => {
    it("should export dashboardWidgets", () => {
      expect(dashboardWidgets).toBeDefined();
    });

    it.each(["aurora", "valkey", "cognito", "vpc"] as const)(
      "keeps unsupported %s custom widgets empty and rejects selections",
      resource => {
        expect(dashboardWidgets[resource]).toEqual([]);
        expect(() =>
          validateConfiguration({
            stages: [],
            supports: [],
            dashboardWidgets: { ...dashboardWidgets, [resource]: ["custom"] },
          })
        ).toThrow(/dashboardWidgets.*unsupported/);
      }
    );
  });
});
