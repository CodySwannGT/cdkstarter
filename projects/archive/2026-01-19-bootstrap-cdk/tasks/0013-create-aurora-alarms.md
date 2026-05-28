# Task: Create Aurora Alarms

**Type:** Task
**Parent:** None

## Description

Create CloudWatch alarms for Aurora database monitoring. These alarms detect performance issues, capacity problems, and replication lag using configurable thresholds.

## Acceptance Criteria

- [ ] Aurora alarms added to AlarmsStack (or separate file)
- [ ] CPU utilization alarms: warning (80%) and critical (95%)
- [ ] Freeable memory alarms: warning (1GB) and critical (500MB)
- [ ] Database connections alarm: warning at 80% of max
- [ ] Replication lag alarms: warning (100ms) and critical (1000ms)
- [ ] Free local storage alarm: critical at 10GB
- [ ] All thresholds configurable from observability config
- [ ] Alarms connected to appropriate SNS topics (critical/warning)
- [ ] Unit tests verify alarm creation and thresholds
- [ ] File passes TypeScript compilation and linting

## Relevant Research

From `research.md`:
- **Aurora Stack alarms** (`lib/aurora-stack.ts:1-246`): CloudWatch alarms for CPU, memory, IOPS, storage
- **CloudWatch Observability** (lines 183-185): `cloudwatch.Alarm` for metric-based alarms, `cloudwatch.CompositeAlarm` with `AlarmRule.anyOf()`

From `brief.md`:
- Enterprise Observability Architecture (lines 312-319): Aurora alarm thresholds
- observability.json Schema (lines 356-366): Aurora threshold configuration

## Applicable Skills

Invoke these skills before writing implementation code:

- `/coding-philosophy` - Always required for all code
- `/jsdoc-best-practices` - For documenting alarm thresholds and severity

## Implementation Details

**File to create:** `lib/stacks/observability/aurora-alarms.ts` (or add to alarms-stack.ts)

**Props interface:**
```typescript
interface AuroraAlarmsProps {
  readonly stageName: string;
  readonly clusterIdentifier: string;
  readonly thresholds: AlarmThresholds["aurora"];
  readonly criticalTopic: sns.ITopic;
  readonly warningTopic: sns.ITopic;
}
```

**Implementation:**
```typescript
export const createAuroraAlarms = (
  scope: Construct,
  props: AuroraAlarmsProps
): cloudwatch.Alarm[] => {
  const alarms: cloudwatch.Alarm[] = [];

  // CPU Utilization - Warning
  alarms.push(new cloudwatch.Alarm(scope, "AuroraCpuWarning", {
    alarmName: `${props.stageName}-aurora-cpu-warning`,
    metric: new cloudwatch.Metric({
      namespace: "AWS/RDS",
      metricName: "CPUUtilization",
      dimensionsMap: { DBClusterIdentifier: props.clusterIdentifier },
      statistic: "Average",
      period: cdk.Duration.minutes(5),
    }),
    threshold: props.thresholds.cpuWarning,
    evaluationPeriods: 3,
    comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    alarmDescription: `Aurora CPU utilization above ${props.thresholds.cpuWarning}%`,
  }));
  alarms[alarms.length - 1].addAlarmAction(new actions.SnsAction(props.warningTopic));

  // CPU Utilization - Critical
  alarms.push(new cloudwatch.Alarm(scope, "AuroraCpuCritical", {
    alarmName: `${props.stageName}-aurora-cpu-critical`,
    metric: new cloudwatch.Metric({
      namespace: "AWS/RDS",
      metricName: "CPUUtilization",
      dimensionsMap: { DBClusterIdentifier: props.clusterIdentifier },
      statistic: "Average",
      period: cdk.Duration.minutes(1),
    }),
    threshold: props.thresholds.cpuCritical,
    evaluationPeriods: 3,
    comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    alarmDescription: `Aurora CPU utilization above ${props.thresholds.cpuCritical}% - CRITICAL`,
  }));
  alarms[alarms.length - 1].addAlarmAction(new actions.SnsAction(props.criticalTopic));

  // Similar patterns for memory, connections, replication lag, storage...
  return alarms;
};
```

**Alarms to create:**
| Metric | Warning Threshold | Critical Threshold | Period |
|--------|-------------------|-------------------|--------|
| CPUUtilization | 80% | 95% | 5min/1min |
| FreeableMemory | 1000MB | 500MB | 5min/1min |
| DatabaseConnections | 80% of max | N/A | 5min |
| AuroraReplicaLag | 100ms | 1000ms | 1min |
| FreeLocalStorage | N/A | 10GB | 5min |

## Testing Requirements

### Unit Tests
- [ ] `describe('AuroraAlarms')/it('should create CPU warning alarm')`: Verify threshold
- [ ] `describe('AuroraAlarms')/it('should create CPU critical alarm')`: Verify threshold
- [ ] `describe('AuroraAlarms')/it('should create memory alarms')`: Verify thresholds
- [ ] `describe('AuroraAlarms')/it('should create replication lag alarms')`: Verify thresholds
- [ ] `describe('AuroraAlarms')/it('should connect alarms to correct SNS topics')`: Verify actions

### Integration Tests
N/A - stack creation tested via unit tests with CDK assertions

### E2E Tests
N/A - infrastructure stack, no user-facing changes

## Documentation Requirements

### Code Documentation (JSDoc)
- [ ] File preamble - explain Aurora monitoring strategy
- [ ] `AuroraAlarmsProps` - document each prop
- [ ] `createAuroraAlarms` - explain alarm purposes
- [ ] Each alarm - explain what it detects and recommended response

### Database Comments
N/A - no database changes

### GraphQL Descriptions
N/A - no GraphQL changes

## Verification

### Type
`test-coverage`

### Proof Command
```bash
npm run build && npm run test -- --testPathPattern="aurora-alarms" --coverage --collectCoverageFrom='lib/stacks/observability/aurora-alarms.ts'
```

### Expected Output
All tests pass. Aurora alarms created with correct thresholds and SNS actions.

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

1. Create `test/stacks/observability/aurora-alarms.test.ts`
2. Write tests using CDK assertions library
3. Run tests to confirm they fail (file doesn't exist yet)

Mark "Write failing tests" as completed.

### Step 3: Write Implementation
Mark "Write implementation" as in_progress.

Create `lib/stacks/observability/aurora-alarms.ts` until tests pass.

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
