# Task: Create Dashboard Stack

**Type:** Task
**Parent:** None

## Description

Create the DashboardStack that provisions a CloudWatch dashboard for infrastructure monitoring. The dashboard provides at-a-glance visibility into Aurora, Valkey, Cognito, and VPC health.

## Acceptance Criteria

- [ ] `lib/stacks/observability/dashboard-stack.ts` creates DashboardStack class
- [ ] Dashboard created only when `observability.dashboardEnabled` is true
- [ ] Aurora section: connections, CPU, memory, IOPS, latency widgets
- [ ] Valkey section: hit rate, connections, memory, CPU widgets
- [ ] Cognito section: sign-ins, sign-ups, token refreshes widgets
- [ ] VPC section: NAT gateway metrics, data transfer widgets
- [ ] Dashboard name includes stage name
- [ ] Unit tests verify dashboard and widget creation
- [ ] File passes TypeScript compilation and linting

## Relevant Research

From `research.md`:
- **CloudWatch Observability** (lines 183-185): `cloudwatch.Dashboard` with `GraphWidget`, `AlarmWidget`, `TextWidget`
- **Known issue**: Metric widgets cannot display composite alarms (use alarm widget type)

From `brief.md`:
- CloudWatch Dashboards (lines 339-346): Dashboard widget layout specification
- DashboardWidgets configuration (lines 377-384): Widget types per resource

## Applicable Skills

Invoke these skills before writing implementation code:

- `/coding-philosophy` - Always required for all code
- `/jsdoc-best-practices` - For documenting dashboard layout decisions

## Implementation Details

**File to create:** `lib/stacks/observability/dashboard-stack.ts`

**Props interface:**
```typescript
interface DashboardStackProps extends cdk.StackProps {
  readonly stageName: string;
  readonly widgets: DashboardWidgets;
  readonly auroraClusterIdentifier?: string;
  readonly valkeyReplicationGroupId?: string;
  readonly cognitoUserPoolId?: string;
}
```

**Implementation:**
```typescript
const dashboard = new cloudwatch.Dashboard(this, "Dashboard", {
  dashboardName: `${props.stageName}-infrastructure-dashboard`,
});

// Aurora section
if (props.auroraClusterIdentifier) {
  dashboard.addWidgets(
    new cloudwatch.TextWidget({
      markdown: "# Aurora Database",
      width: 24,
      height: 1,
    })
  );

  dashboard.addWidgets(
    new cloudwatch.GraphWidget({
      title: "Database Connections",
      left: [new cloudwatch.Metric({
        namespace: "AWS/RDS",
        metricName: "DatabaseConnections",
        dimensionsMap: { DBClusterIdentifier: props.auroraClusterIdentifier },
        statistic: "Average",
        period: cdk.Duration.minutes(1),
      })],
      width: 8,
      height: 6,
    }),
    new cloudwatch.GraphWidget({
      title: "CPU Utilization",
      left: [/* ... */],
      width: 8,
      height: 6,
    }),
    new cloudwatch.GraphWidget({
      title: "Freeable Memory",
      left: [/* ... */],
      width: 8,
      height: 6,
    })
  );
}

// Valkey section
if (props.valkeyReplicationGroupId) {
  dashboard.addWidgets(
    new cloudwatch.TextWidget({
      markdown: "# Valkey Cache",
      width: 24,
      height: 1,
    })
  );
  // Add valkey widgets...
}

// Cognito section
if (props.cognitoUserPoolId) {
  // Add cognito widgets...
}
```

**Dashboard layout:**
- Width: 24 units per row
- Section headers: TextWidget, full width
- Metrics: GraphWidget, 8 units wide, 6 units tall (3 per row)
- Alarm states: AlarmWidget where appropriate

**Widget configuration per resource (from config):**
- aurora: connections, cpu, memory, iops, latency
- valkey: hitRate, connections, memory, cpu
- cognito: signIns, signUps, tokenRefreshes
- vpc: natGateway, dataTransfer

## Testing Requirements

### Unit Tests
- [ ] `describe('DashboardStack')/it('should create dashboard with correct name')`: Verify name
- [ ] `describe('DashboardStack')/it('should add Aurora widgets when cluster provided')`: Verify widgets
- [ ] `describe('DashboardStack')/it('should add Valkey widgets when replication group provided')`: Verify widgets
- [ ] `describe('DashboardStack')/it('should skip sections when resources not provided')`: Verify conditional

### Integration Tests
N/A - stack creation tested via unit tests with CDK assertions

### E2E Tests
N/A - infrastructure stack, no user-facing changes

## Documentation Requirements

### Code Documentation (JSDoc)
- [ ] File preamble - explain dashboard purpose and layout strategy
- [ ] `DashboardStackProps` - document each prop
- [ ] `DashboardStack` - explain conditional widget creation
- [ ] Each section - explain what metrics are shown and why

### Database Comments
N/A - no database changes

### GraphQL Descriptions
N/A - no GraphQL changes

## Verification

### Type
`test-coverage`

### Proof Command
```bash
npm run build && npm run test -- --testPathPattern="dashboard-stack" --coverage --collectCoverageFrom='lib/stacks/observability/dashboard-stack.ts'
```

### Expected Output
All tests pass. Dashboard created with appropriate widgets for provided resources.

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

1. Create `test/stacks/observability/dashboard-stack.test.ts`
2. Write tests using CDK assertions library
3. Run tests to confirm they fail (stack doesn't exist yet)

Mark "Write failing tests" as completed.

### Step 3: Write Implementation
Mark "Write implementation" as in_progress.

Create `lib/stacks/observability/dashboard-stack.ts` until tests pass.

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
