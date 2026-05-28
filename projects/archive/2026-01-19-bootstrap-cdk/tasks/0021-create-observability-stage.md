# Task: Create Observability Stage

**Type:** Task
**Parent:** None

## Description

Create the ObservabilityStage that orchestrates monitoring infrastructure (SNS, Alarms, Dashboard) for a stage environment. This stage depends on AppStage completing first to reference resource identifiers.

## Acceptance Criteria

- [ ] `lib/stages/observability-stage.ts` creates ObservabilityStage class extending cdk.Stage
- [ ] Imports resource identifiers from AppStage via Fn.importValue
- [ ] Instantiates SnsStack with email endpoints from config
- [ ] Instantiates alarm stacks (Aurora, Valkey) with thresholds from config
- [ ] Instantiates DashboardStack if observability.dashboardEnabled is true
- [ ] Unit tests verify stage structure
- [ ] File passes TypeScript compilation and linting

## Relevant Research

From `research.md`:
- **CloudWatch Observability** (lines 183-186): Dashboard, Alarm, CompositeAlarm patterns

From `brief.md`:
- Pipeline Flow (lines 422-425): ObservabilityStage contains SNS, Alarms, Dashboard
- Stage Orchestration (line 495): Create ObservabilityStage for monitoring resources
- Key Design Decision #5: Observability as Separate Stage (lines 525-529)

## Applicable Skills

Invoke these skills before writing implementation code:

- `/coding-philosophy` - Always required for all code
- `/jsdoc-best-practices` - For documenting stage purpose and monitoring strategy

## Implementation Details

**File to create:** `lib/stages/observability-stage.ts`

**Props interface:**
```typescript
interface ObservabilityStageProps extends cdk.StageProps {
  readonly stageName: string;
  readonly stageEnvironment: StageEnvironment;
  readonly alarmThresholds: AlarmThresholds;
  readonly dashboardWidgets: DashboardWidgets;
}
```

**Implementation:**
```typescript
export class ObservabilityStage extends cdk.Stage {
  public readonly snsStack: SnsStack;
  public readonly dashboardStack?: DashboardStack;

  constructor(scope: Construct, id: string, props: ObservabilityStageProps) {
    super(scope, id, props);

    const { stageName, stageEnvironment, alarmThresholds, dashboardWidgets } = props;
    const { observability, features } = stageEnvironment;

    // Create SNS topics
    this.snsStack = new SnsStack(this, "SnsStack", {
      stageName,
      alarmEmailEndpoints: observability.alarmEmailEndpoints,
    });

    // Import resource identifiers for alarms
    const auroraClusterIdentifier = features.aurora
      ? cdk.Fn.importValue(`${stageName}-aurora-cluster-identifier`)
      : undefined;

    const valkeyReplicationGroupId = features.valkey
      ? cdk.Fn.importValue(`${stageName}-valkey-replication-group-id`)
      : undefined;

    // Create alarms in a single stack
    const alarmsStack = new Stack(this, "AlarmsStack");

    if (auroraClusterIdentifier) {
      createAuroraAlarms(alarmsStack, {
        stageName,
        clusterIdentifier: auroraClusterIdentifier,
        thresholds: alarmThresholds.aurora,
        criticalTopic: this.snsStack.criticalTopic,
        warningTopic: this.snsStack.warningTopic,
      });
    }

    if (valkeyReplicationGroupId) {
      createValkeyAlarms(alarmsStack, {
        stageName,
        replicationGroupId: valkeyReplicationGroupId,
        thresholds: alarmThresholds.valkey,
        criticalTopic: this.snsStack.criticalTopic,
        warningTopic: this.snsStack.warningTopic,
      });
    }

    // Create dashboard if enabled
    if (observability.dashboardEnabled) {
      this.dashboardStack = new DashboardStack(this, "DashboardStack", {
        stageName,
        widgets: dashboardWidgets,
        auroraClusterIdentifier,
        valkeyReplicationGroupId,
        cognitoUserPoolId: features.cognito
          ? cdk.Fn.importValue(`${stageName}-cognito-user-pool-id`)
          : undefined,
      });
    }
  }
}
```

**Why separate stage (from brief):**
- Allows dashboard to reference all resource outputs
- Alarm configuration can be updated without redeploying app resources
- Clear separation of concerns

## Testing Requirements

### Unit Tests
- [ ] `describe('ObservabilityStage')/it('should create SnsStack')`: Verify stack exists
- [ ] `describe('ObservabilityStage')/it('should create Aurora alarms when feature enabled')`: Verify conditional
- [ ] `describe('ObservabilityStage')/it('should create DashboardStack when enabled')`: Verify conditional
- [ ] `describe('ObservabilityStage')/it('should skip DashboardStack when disabled')`: Verify conditional

### Integration Tests
N/A - stage creation tested via unit tests

### E2E Tests
N/A - infrastructure stage, no user-facing changes

## Documentation Requirements

### Code Documentation (JSDoc)
- [ ] File preamble - explain ObservabilityStage purpose and why separate from AppStage
- [ ] `ObservabilityStageProps` - document props
- [ ] `ObservabilityStage` - explain stack creation and dependencies
- [ ] Why separate stage - explain benefits per brief

### Database Comments
N/A - no database changes

### GraphQL Descriptions
N/A - no GraphQL changes

## Verification

### Type
`test-coverage`

### Proof Command
```bash
npm run build && npm run test -- --testPathPattern="observability-stage" --coverage --collectCoverageFrom='lib/stages/observability-stage.ts'
```

### Expected Output
All tests pass. ObservabilityStage creates monitoring stacks conditionally.

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

1. Create `test/stages/observability-stage.test.ts`
2. Write tests verifying conditional stack creation
3. Run tests to confirm they fail (stage doesn't exist yet)

Mark "Write failing tests" as completed.

### Step 3: Write Implementation
Mark "Write implementation" as in_progress.

Create `lib/stages/observability-stage.ts` until tests pass.

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
