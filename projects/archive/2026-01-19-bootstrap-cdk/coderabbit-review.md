# CodeRabbit Review

## File: lib/stages/observability-stage.ts
**Line:** 88 to 91
**Type:** potential_issue

**Comment:**
dashboardStack should be optional to match conditional creation.

The property is declared as DashboardStack (non-optional) but is only created when observability.dashboardEnabled is true (lines 158-173). This type mismatch could cause runtime errors if consumers access dashboardStack when dashboards are disabled.

**Suggested fix:**
```typescript
- public readonly dashboardStack: DashboardStack;
+ public readonly dashboardStack?: DashboardStack;
```

---

## File: lib/stages/app-stage.ts
**Line:** 14 to 18
**Type:** potential_issue

**Comment:**
Documentation states IamStack is "always" created, but implementation is conditional.

Line 17 states "4. IamStack (always)" but the implementation at lines 130-141 only creates IamStack when both cognitoStack and auroraStack exist. Update the documentation to reflect this.

**Suggested documentation fix:**
```diff
-* 4. IamStack (always)
+* 4. IamStack (if both cognito and aurora enabled)
```

**Status:** FIXED in Claude Review

---

## File: lib/types.ts
**Line:** 363 to 411
**Type:** potential_issue

**Comment:**
Threshold field mismatch with AuroraAlarmsStack implementation.

Several inconsistencies exist between this interface and AuroraAlarmsThresholds in aurora-alarms-stack.ts:

| This file (AuroraAlarmThresholds) | Alarm stack (AuroraAlarmsThresholds) |
|-------------------------------------|----------------------------------------|
| cpuWarning, cpuCritical | cpuWarningPercent, cpuCriticalPercent |
| memoryWarningMB, memoryCriticalMB | (not present) |
| freeStorageCriticalGB (no warning) | storageCriticalGB, storageWarningGB |
| connectionWarningPercent (percent) | connectionsCritical, connectionsWarning (absolute) |

This will require a transformation layer. Consider aligning these interfaces to reduce mapping complexity.

---

## File: lib/stacks/observability/aurora-alarms-stack.ts
**Line:** 340 to 370
**Type:** potential_issue

**Comment:**
Missing critical replication lag alarm.

The AuroraAlarmThresholds in lib/types.ts defines both replicationLagWarningMs and replicationLagCriticalMs, but this stack only creates a warning alarm. Consider adding a critical alarm for severe replication lag to match the type definitions.

---

## File: bin/infrastructure.ts
**Line:** 73 to 82
**Type:** potential_issue

**Comment:**
Potential unit mismatch in connectionsWarning calculation.

Line 80 calculates connectionsWarning by multiplying connectionWarningPercent (a percentage value) by 2, but connectionsWarning appears to expect an absolute connection count based on the interface name and the hardcoded connectionsCritical: 200. This mixing of percentage and absolute values seems incorrect.

Additionally, connectionsCritical: 200 is hardcoded while other thresholds come from config, reducing configurability.

---

## File: lib/stacks/observability/aurora-alarms-stack.ts
**Line:** 216 to 224
**Type:** potential_issue

**Comment:**
Use TempStorageIOPS or TempStorageThroughput instead of FreeLocalStorage if targeting Aurora Serverless v2.

FreeLocalStorage is not available for Aurora Serverless v2 clusters. If this stack supports Serverless v2, switch to Serverless-specific metrics such as TempStorageIOPS, TempStorageThroughput, ServerlessDatabaseCapacity, or ACUUtilization. If the stack is for provisioned Aurora instances only, document this constraint.

---

## File: projects/2026-01-19-bootstrap-cdk/tasks/0009-create-valkey-stack.md
**Line:** 71 to 86
**Type:** potential_issue

**Comment:**
Verify subnet group reference in implementation snippet.

The implementation snippet references subnetGroup.cacheSubnetGroupName (line 79), but for CfnSubnetGroup, you should use subnetGroup.ref to get the actual resource reference for the subnet group name. The cacheSubnetGroupName property is an input property used when creating the subnet group; the .ref attribute returns the subnet group name as the CloudFormation Ref output.
