# Task: Create Valkey Alarms

**Type:** Task
**Parent:** None

## Description

Create CloudWatch alarms for Valkey (ElastiCache) monitoring. These alarms detect cache performance issues, memory pressure, and eviction problems.

## Acceptance Criteria

- [ ] Valkey alarms added to AlarmsStack (or separate file)
- [ ] CPU utilization alarm: warning at 80%
- [ ] Cache hit rate alarm: warning when below 80%
- [ ] Evictions alarm: warning when > 0
- [ ] Current connections alarm: warning at high threshold
- [ ] Replication lag alarm: warning at 100ms (if multi-node)
- [ ] All thresholds configurable from observability config
- [ ] Alarms connected to appropriate SNS topics
- [ ] Unit tests verify alarm creation and thresholds
- [ ] File passes TypeScript compilation and linting

## Relevant Research

From `research.md`:
- **ElastiCache Stack** (`lib/elasticache-stack.ts:1-52`): Basic ElastiCache configuration
- **CloudWatch Observability** (lines 183-185): `cloudwatch.Alarm` for metric-based alarms

From `brief.md`:
- Enterprise Observability Architecture (lines 319-325): Valkey alarm thresholds
- observability.json Schema (lines 367-371): Valkey threshold configuration

## Applicable Skills

Invoke these skills before writing implementation code:

- `/coding-philosophy` - Always required for all code
- `/jsdoc-best-practices` - For documenting alarm thresholds and cache health

## Implementation Details

**File to create:** `lib/stacks/observability/valkey-alarms.ts`

**Props interface:**
```typescript
interface ValkeyAlarmsProps {
  readonly stageName: string;
  readonly replicationGroupId: string;
  readonly thresholds: AlarmThresholds["valkey"];
  readonly criticalTopic: sns.ITopic;
  readonly warningTopic: sns.ITopic;
}
```

**Implementation:**
```typescript
export const createValkeyAlarms = (
  scope: Construct,
  props: ValkeyAlarmsProps
): cloudwatch.Alarm[] => {
  const alarms: cloudwatch.Alarm[] = [];

  // CPU Utilization
  alarms.push(new cloudwatch.Alarm(scope, "ValkeyCpuWarning", {
    alarmName: `${props.stageName}-valkey-cpu-warning`,
    metric: new cloudwatch.Metric({
      namespace: "AWS/ElastiCache",
      metricName: "CPUUtilization",
      dimensionsMap: { ReplicationGroupId: props.replicationGroupId },
      statistic: "Average",
      period: cdk.Duration.minutes(5),
    }),
    threshold: props.thresholds.cpuWarning,
    evaluationPeriods: 3,
    comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    alarmDescription: `Valkey CPU utilization above ${props.thresholds.cpuWarning}%`,
  }));
  alarms[alarms.length - 1].addAlarmAction(new actions.SnsAction(props.warningTopic));

  // Cache Hit Rate (low is bad)
  alarms.push(new cloudwatch.Alarm(scope, "ValkeyCacheHitRateWarning", {
    alarmName: `${props.stageName}-valkey-cache-hit-rate-warning`,
    metric: new cloudwatch.Metric({
      namespace: "AWS/ElastiCache",
      metricName: "CacheHitRate",
      dimensionsMap: { ReplicationGroupId: props.replicationGroupId },
      statistic: "Average",
      period: cdk.Duration.minutes(5),
    }),
    threshold: props.thresholds.cacheHitRateWarning,
    evaluationPeriods: 3,
    comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
    alarmDescription: `Valkey cache hit rate below ${props.thresholds.cacheHitRateWarning}%`,
  }));
  alarms[alarms.length - 1].addAlarmAction(new actions.SnsAction(props.warningTopic));

  // Evictions (any evictions indicate memory pressure)
  alarms.push(new cloudwatch.Alarm(scope, "ValkeyEvictionsWarning", {
    alarmName: `${props.stageName}-valkey-evictions-warning`,
    metric: new cloudwatch.Metric({
      namespace: "AWS/ElastiCache",
      metricName: "Evictions",
      dimensionsMap: { ReplicationGroupId: props.replicationGroupId },
      statistic: "Sum",
      period: cdk.Duration.minutes(5),
    }),
    threshold: props.thresholds.evictionsWarning,
    evaluationPeriods: 1,
    comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    alarmDescription: "Valkey evictions detected - consider scaling cache",
  }));
  alarms[alarms.length - 1].addAlarmAction(new actions.SnsAction(props.warningTopic));

  return alarms;
};
```

**Alarms to create:**
| Metric | Threshold | Comparison | Period | Severity |
|--------|-----------|------------|--------|----------|
| CPUUtilization | 80% | > | 5min | Warning |
| CacheHitRate | 80% | < | 5min | Warning |
| Evictions | 0 | > | 5min | Warning |
| CurrConnections | configurable | > | 5min | Warning |
| ReplicationLag | 100ms | > | 1min | Warning |

## Testing Requirements

### Unit Tests
- [ ] `describe('ValkeyAlarms')/it('should create CPU warning alarm')`: Verify threshold
- [ ] `describe('ValkeyAlarms')/it('should create cache hit rate alarm')`: Verify threshold
- [ ] `describe('ValkeyAlarms')/it('should create evictions alarm')`: Verify threshold
- [ ] `describe('ValkeyAlarms')/it('should connect alarms to warning topic')`: Verify actions

### Integration Tests
N/A - stack creation tested via unit tests with CDK assertions

### E2E Tests
N/A - infrastructure stack, no user-facing changes

## Documentation Requirements

### Code Documentation (JSDoc)
- [ ] File preamble - explain Valkey monitoring strategy
- [ ] `ValkeyAlarmsProps` - document each prop
- [ ] `createValkeyAlarms` - explain alarm purposes
- [ ] Cache hit rate - explain why low hit rate is concerning
- [ ] Evictions - explain memory pressure implications

### Database Comments
N/A - no database changes

### GraphQL Descriptions
N/A - no GraphQL changes

## Verification

### Type
`test-coverage`

### Proof Command
```bash
npm run build && npm run test -- --testPathPattern="valkey-alarms" --coverage --collectCoverageFrom='lib/stacks/observability/valkey-alarms.ts'
```

### Expected Output
All tests pass. Valkey alarms created with correct thresholds and SNS actions.

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

1. Create `test/stacks/observability/valkey-alarms.test.ts`
2. Write tests using CDK assertions library
3. Run tests to confirm they fail (file doesn't exist yet)

Mark "Write failing tests" as completed.

### Step 3: Write Implementation
Mark "Write implementation" as in_progress.

Create `lib/stacks/observability/valkey-alarms.ts` until tests pass.

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
