# Task: Create Observability Configuration

**Type:** Task
**Parent:** None

## Description

Create the typed observability configuration file that defines alarm thresholds and dashboard widget settings. This centralizes all monitoring configuration for easy tuning without code changes.

## Acceptance Criteria

- [ ] `config/observability.ts` exports typed alarm thresholds and dashboard widgets
- [ ] Aurora alarm thresholds defined (CPU warning/critical, memory warning/critical, connections, replication lag, storage)
- [ ] Valkey alarm thresholds defined (CPU, cache hit rate, evictions)
- [ ] Dashboard widgets configured for aurora, valkey, cognito, vpc
- [ ] All thresholds have sensible defaults matching brief.md
- [ ] Configuration is readonly/immutable
- [ ] File passes TypeScript compilation

## Relevant Research

From `research.md`:
- **CloudWatch Observability**: `cloudwatch.Alarm` for metric-based alarms, `cloudwatch.CompositeAlarm` with `AlarmRule.anyOf()`, `cloudwatch.Dashboard` with `GraphWidget`, `AlarmWidget`
- **SNS Stack** (`lib/sns-stack.ts:1-34`): Creates SNS topics for error notifications
- Per Q3 answer: Ignore Slack/PagerDuty integration

From `brief.md`:
- Enterprise Observability Architecture (lines 299-348): Detailed alarm thresholds and dashboard structure
- observability.json Schema (lines 350-386): Full threshold configuration structure

## Applicable Skills

Invoke these skills before writing implementation code:

- `/coding-philosophy` - Always required for all code
- `/jsdoc-best-practices` - For documenting threshold meanings

## Implementation Details

**File to create:** `config/observability.ts`

**Structure:**
```typescript
import { AlarmThresholds, DashboardWidgets } from "../lib/types";

export const alarmThresholds: AlarmThresholds = {
  aurora: {
    cpuWarning: 80,
    cpuCritical: 95,
    memoryWarningMB: 1000,
    memoryCriticalMB: 500,
    connectionWarningPercent: 80,
    replicationLagWarningMs: 100,
    replicationLagCriticalMs: 1000,
    freeStorageCriticalGB: 10,
  },
  valkey: {
    cpuWarning: 80,
    cacheHitRateWarning: 80,
    evictionsWarning: 0,
  },
} as const;

export const dashboardWidgets: DashboardWidgets = {
  aurora: ["connections", "cpu", "memory", "iops", "latency"],
  valkey: ["hitRate", "connections", "memory", "cpu"],
  cognito: ["signIns", "signUps", "tokenRefreshes"],
  vpc: ["natGateway", "dataTransfer"],
} as const;
```

**Threshold explanations (for JSDoc):**
- CPU 80% warning: Performance may degrade, scale consideration
- CPU 95% critical: Immediate action required
- Memory < 1GB warning: May cause swapping
- Memory < 500MB critical: Likely OOM risk
- Replication lag > 100ms warning: Read replicas may serve stale data
- Replication lag > 1000ms critical: Significant data inconsistency risk

## Testing Requirements

### Unit Tests
- [ ] `describe('observability')/it('should export alarmThresholds')`: Verify export
- [ ] `describe('observability')/it('should have aurora thresholds with warning < critical')`: Verify threshold ordering
- [ ] `describe('observability')/it('should export dashboardWidgets')`: Verify export
- [ ] `describe('observability')/it('should have aurora dashboard widgets')`: Verify widget config

### Integration Tests
N/A - configuration file, no integration points

### E2E Tests
N/A - no user-facing changes

## Documentation Requirements

### Code Documentation (JSDoc)
- [ ] File preamble - explain centralized monitoring configuration
- [ ] `alarmThresholds` - explain these drive CloudWatch alarm creation
- [ ] `alarmThresholds.aurora` - explain each threshold's meaning and why that value
- [ ] `alarmThresholds.valkey` - explain each threshold's meaning
- [ ] `dashboardWidgets` - explain these configure CloudWatch dashboard layout

### Database Comments
N/A - no database changes

### GraphQL Descriptions
N/A - no GraphQL changes

## Verification

### Type
`test-coverage`

### Proof Command
```bash
npm run build && npm run test -- --testPathPattern="observability" --coverage --collectCoverageFrom='config/observability.ts'
```

### Expected Output
All tests pass. TypeScript compiles without errors.

## Implementation Steps

### Step 0: Setup Tracking
Use TodoWrite to create task tracking todos:
- Invoke skills
- Write failing tests
- Write implementation
- Verify implementation
- Update documentation
- Commit changes

### Step 1: Invoke Skills
Mark "Invoke skills" as in_progress.

1. Mark this task as "in progress" in `progress.md`
2. Invoke each skill listed in "Applicable Skills" using the Skill tool

Mark "Invoke skills" as completed.

### Step 2: Write Failing Tests
Mark "Write failing tests" as in_progress.

1. Create `test/config/observability.test.ts`
2. Write tests that verify threshold structure and ordering
3. Run tests to confirm they fail (file doesn't exist yet)

Mark "Write failing tests" as completed.

### Step 3: Write Implementation
Mark "Write implementation" as in_progress.

Create `config/observability.ts` with all configurations until tests pass.

Mark "Write implementation" as completed.

### Step 4: Verify Implementation
Mark "Verify implementation" as in_progress.

1. Run the Proof Command from Verification section
2. Confirm output matches Expected Output
3. If verification fails, fix and re-verify

Mark "Verify implementation" as completed.

### Step 5: Update Documentation
Mark "Update documentation" as in_progress.

Complete all items in Documentation Requirements section.

Mark "Update documentation" as completed.

### Step 6: Commit Changes
Mark "Commit changes" as in_progress.

1. Run `/git:commit`
2. Mark this task as "completed" in `progress.md`
3. Record any learnings in `findings.md`

Mark "Commit changes" as completed.
