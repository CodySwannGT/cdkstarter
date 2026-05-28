# Task: Create SNS Stack

**Type:** Task
**Parent:** None

## Description

Create the SnsStack that provisions SNS topics for CloudWatch alarms at different severity levels (critical, warning, info). These topics serve as notification channels for infrastructure alerts.

## Acceptance Criteria

- [ ] `lib/stacks/observability/sns-stack.ts` creates SnsStack class
- [ ] Three SNS topics: critical-alarms, warning-alarms, info-alarms
- [ ] Email subscriptions added from observability config
- [ ] Topics have descriptive display names
- [ ] Stack outputs: topic ARNs for each severity level
- [ ] Unit tests verify SNS topic creation
- [ ] File passes TypeScript compilation and linting

## Relevant Research

From `research.md`:
- **SNS Stack** (`lib/sns-stack.ts:1-34`): Creates SNS topics for error notifications, email subscriptions
- Per Q3 answer: Ignore Slack/PagerDuty integration - email only

From `brief.md`:
- Enterprise Observability Architecture (lines 307-310): SNS topics for critical/warning/info alarms
- SnsStack (lines 469-473): Critical/warning/info alarm topics, email subscriptions from config

## Applicable Skills

Invoke these skills before writing implementation code:

- `/coding-philosophy` - Always required for all code
- `/jsdoc-best-practices` - For documenting topic purpose and severity levels

## Implementation Details

**File to create:** `lib/stacks/observability/sns-stack.ts`

**Props interface:**
```typescript
interface SnsStackProps extends cdk.StackProps {
  readonly stageName: string;
  readonly alarmEmailEndpoints: string[];
}
```

**Implementation:**
```typescript
// Critical alarms - immediate action required
const criticalTopic = new sns.Topic(this, "CriticalAlarmsTopic", {
  topicName: `${props.stageName}-critical-alarms`,
  displayName: `${props.stageName} Critical Alarms`,
});

// Warning alarms - attention needed soon
const warningTopic = new sns.Topic(this, "WarningAlarmsTopic", {
  topicName: `${props.stageName}-warning-alarms`,
  displayName: `${props.stageName} Warning Alarms`,
});

// Info alarms - for logging/tracking
const infoTopic = new sns.Topic(this, "InfoAlarmsTopic", {
  topicName: `${props.stageName}-info-alarms`,
  displayName: `${props.stageName} Info Alarms`,
});

// Add email subscriptions to critical and warning topics
props.alarmEmailEndpoints.forEach(email => {
  criticalTopic.addSubscription(new subscriptions.EmailSubscription(email));
  warningTopic.addSubscription(new subscriptions.EmailSubscription(email));
});
```

**Outputs to export:**
- `{stageName}-critical-alarms-topic-arn`
- `{stageName}-warning-alarms-topic-arn`
- `{stageName}-info-alarms-topic-arn`

**Severity level definitions (for JSDoc):**
- **Critical**: Immediate action required. System down or severe degradation. Examples: CPU > 95%, storage critically low.
- **Warning**: Attention needed within hours. Performance degradation possible. Examples: CPU > 80%, high connection count.
- **Info**: For tracking/auditing. No immediate action. Examples: anomaly detection triggers, traffic spikes.

## Testing Requirements

### Unit Tests
- [ ] `describe('SnsStack')/it('should create critical alarms topic')`: Verify topic exists
- [ ] `describe('SnsStack')/it('should create warning alarms topic')`: Verify topic exists
- [ ] `describe('SnsStack')/it('should create info alarms topic')`: Verify topic exists
- [ ] `describe('SnsStack')/it('should add email subscriptions to critical topic')`: Verify subscriptions
- [ ] `describe('SnsStack')/it('should export topic ARNs')`: Verify outputs

### Integration Tests
N/A - stack creation tested via unit tests with CDK assertions

### E2E Tests
N/A - infrastructure stack, no user-facing changes

## Documentation Requirements

### Code Documentation (JSDoc)
- [ ] File preamble - explain SNS notification strategy
- [ ] `SnsStackProps` - document props
- [ ] `SnsStack` - explain three-tier severity model
- [ ] Each topic - explain when it's used and expected response time

### Database Comments
N/A - no database changes

### GraphQL Descriptions
N/A - no GraphQL changes

## Verification

### Type
`test-coverage`

### Proof Command
```bash
npm run build && npm run test -- --testPathPattern="sns-stack" --coverage --collectCoverageFrom='lib/stacks/observability/sns-stack.ts'
```

### Expected Output
All tests pass. SNS topics created with email subscriptions.

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

1. Create `test/stacks/observability/sns-stack.test.ts`
2. Write tests using CDK assertions library
3. Run tests to confirm they fail (stack doesn't exist yet)

Mark "Write failing tests" as completed.

### Step 3: Write Implementation
Mark "Write implementation" as in_progress.

Create `lib/stacks/observability/sns-stack.ts` until tests pass.

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
