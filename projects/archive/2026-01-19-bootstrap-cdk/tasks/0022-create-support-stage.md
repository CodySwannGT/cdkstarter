# Task: Create Support Stage

**Type:** Task
**Parent:** None

## Description

Create the SupportStage that orchestrates shared account infrastructure (DNS, TrustPolicy). This stage runs first in the pipeline before any environment-specific stages.

## Acceptance Criteria

- [ ] `lib/stages/support-stage.ts` creates SupportStage class extending cdk.Stage
- [ ] Instantiates DnsStack if domains are configured
- [ ] Instantiates TrustPolicyStack for each deployable environment
- [ ] Uses support environment configuration
- [ ] Unit tests verify stage structure
- [ ] File passes TypeScript compilation and linting

## Relevant Research

From `research.md`:
- **Shared Stage** (`lib/shared-stage.ts:1-54`): Runs in shared account, creates ParentDnsStack, SnsRoleStack, IamDeployRoleStack, CodeConnectionsShareStack

From `brief.md`:
- Pipeline Flow (lines 402-407): SupportStage contains DnsStack, CodeConnectionsStack, PipelineIamStack
- Stage Orchestration (line 496): Create SupportStage for shared account resources

## Applicable Skills

Invoke these skills before writing implementation code:

- `/coding-philosophy` - Always required for all code
- `/jsdoc-best-practices` - For documenting stage purpose

## Implementation Details

**File to create:** `lib/stages/support-stage.ts`

**Props interface:**
```typescript
interface SupportStageProps extends cdk.StageProps {
  readonly supportEnvironment: SupportEnvironment;
  readonly domainConfig: DomainConfig;
  readonly deployableEnvironments: readonly StageEnvironment[];
}
```

**Implementation:**
```typescript
export class SupportStage extends cdk.Stage {
  public readonly dnsStack?: DnsStack;
  public readonly trustPolicyStacks: TrustPolicyStack[];

  constructor(scope: Construct, id: string, props: SupportStageProps) {
    super(scope, id, props);

    const { supportEnvironment, domainConfig, deployableEnvironments } = props;

    this.trustPolicyStacks = [];

    // Create DNS stack only if domains are configured
    if (domainConfig.domains.length > 0) {
      this.dnsStack = new DnsStack(this, "DnsStack", {
        domainConfig,
      });
    }

    // Create trust policy for each deployable environment
    deployableEnvironments.forEach(env => {
      const trustPolicyStack = new TrustPolicyStack(this, `TrustPolicy-${env.name}`, {
        stageName: env.name,
        targetAccountId: env.accountId,
        pipelineAccountId: supportEnvironment.accountId,
        region: env.region,
      });
      this.trustPolicyStacks.push(trustPolicyStack);
    });
  }
}
```

**Stack order:**
1. DnsStack (if domains configured) - creates hosted zones and certificates
2. TrustPolicyStack (per environment) - enables cross-account deployment

**Why support stage runs first:**
- DNS and certificates must exist before other stacks can reference them
- Trust policies must be in place before cross-account deployments

## Testing Requirements

### Unit Tests
- [ ] `describe('SupportStage')/it('should create DnsStack when domains configured')`: Verify conditional
- [ ] `describe('SupportStage')/it('should skip DnsStack when no domains')`: Verify conditional
- [ ] `describe('SupportStage')/it('should create TrustPolicyStack for each environment')`: Verify creation
- [ ] `describe('SupportStage')/it('should skip PLACEHOLDER environments for trust')`: Verify filtering

### Integration Tests
N/A - stage creation tested via unit tests

### E2E Tests
N/A - infrastructure stage, no user-facing changes

## Documentation Requirements

### Code Documentation (JSDoc)
- [ ] File preamble - explain SupportStage purpose and why it runs first
- [ ] `SupportStageProps` - document props
- [ ] `SupportStage` - explain what stacks are created
- [ ] DNS conditional - explain domains are optional

### Database Comments
N/A - no database changes

### GraphQL Descriptions
N/A - no GraphQL changes

## Verification

### Type
`test-coverage`

### Proof Command
```bash
npm run build && npm run test -- --testPathPattern="support-stage" --coverage --collectCoverageFrom='lib/stages/support-stage.ts'
```

### Expected Output
All tests pass. SupportStage creates DNS and TrustPolicy stacks.

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

1. Create `test/stages/support-stage.test.ts`
2. Write tests verifying conditional stack creation
3. Run tests to confirm they fail (stage doesn't exist yet)

Mark "Write failing tests" as completed.

### Step 3: Write Implementation
Mark "Write implementation" as in_progress.

Create `lib/stages/support-stage.ts` until tests pass.

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
