# Task: Create Network Stage

**Type:** Task
**Parent:** None

## Description

Create the NetworkStage that orchestrates network infrastructure stacks (VPC, Security Groups) for a stage environment. This stage runs first in each environment's deployment sequence.

## Acceptance Criteria

- [ ] `lib/stages/network-stage.ts` creates NetworkStage class extending cdk.Stage
- [ ] Instantiates VpcStack with environment-specific configuration
- [ ] Instantiates SecurityGroupsStack with VPC reference
- [ ] Props include stageName and environment configuration
- [ ] Outputs from stacks are accessible for cross-stage reference
- [ ] Unit tests verify stage instantiates correct stacks
- [ ] File passes TypeScript compilation and linting

## Relevant Research

From `research.md`:
- **Network Stage** (`lib/network-stage.ts:1-99`): Extracts stage name from props, instantiates InfrastructureStack, SecurityGroupStack, conditionally creates stacks based on configuration

From `brief.md`:
- Pipeline Flow (lines 410-413): NetworkStage contains VpcStack and SecurityGroupsStack
- Stage Orchestration (lines 491-492): Create NetworkStage to orchestrate network stacks

## Applicable Skills

Invoke these skills before writing implementation code:

- `/coding-philosophy` - Always required for all code
- `/jsdoc-best-practices` - For documenting stage purpose

## Implementation Details

**File to create:** `lib/stages/network-stage.ts`

**Props interface:**
```typescript
interface NetworkStageProps extends cdk.StageProps {
  readonly stageName: string;
  readonly stageEnvironment: StageEnvironment;
}
```

**Implementation:**
```typescript
export class NetworkStage extends cdk.Stage {
  public readonly vpcStack: VpcStack;
  public readonly securityGroupsStack: SecurityGroupsStack;

  constructor(scope: Construct, id: string, props: NetworkStageProps) {
    super(scope, id, props);

    const { stageName, stageEnvironment } = props;

    // Create VPC
    this.vpcStack = new VpcStack(this, "VpcStack", {
      stageName,
      vpcCidr: stageEnvironment.network.vpcCidr,
      natGatewayCount: stageName === "production" ? 2 : 1,
      enableFlowLogs: stageName !== "dev",
    });

    // Create Security Groups
    this.securityGroupsStack = new SecurityGroupsStack(this, "SecurityGroupsStack", {
      stageName,
      vpc: this.vpcStack.vpc,
    });

    // Add dependency
    this.securityGroupsStack.addDependency(this.vpcStack);
  }
}
```

**Stack order:**
1. VpcStack (creates VPC, subnets, NAT gateways)
2. SecurityGroupsStack (creates security groups using VPC)

**Outputs to expose:**
- VPC reference for AppStage
- Security group references for AppStage

## Testing Requirements

### Unit Tests
- [ ] `describe('NetworkStage')/it('should create VpcStack')`: Verify stack instantiation
- [ ] `describe('NetworkStage')/it('should create SecurityGroupsStack')`: Verify stack instantiation
- [ ] `describe('NetworkStage')/it('should pass stageName to stacks')`: Verify props
- [ ] `describe('NetworkStage')/it('should set NAT gateway count based on stage')`: Verify conditional

### Integration Tests
N/A - stage creation tested via unit tests

### E2E Tests
N/A - infrastructure stage, no user-facing changes

## Documentation Requirements

### Code Documentation (JSDoc)
- [ ] File preamble - explain NetworkStage purpose and stack ordering
- [ ] `NetworkStageProps` - document props
- [ ] `NetworkStage` - explain what stacks are created and dependencies
- [ ] Public properties - explain they're exposed for cross-stage reference

### Database Comments
N/A - no database changes

### GraphQL Descriptions
N/A - no GraphQL changes

## Verification

### Type
`test-coverage`

### Proof Command
```bash
npm run build && npm run test -- --testPathPattern="network-stage" --coverage --collectCoverageFrom='lib/stages/network-stage.ts'
```

### Expected Output
All tests pass. NetworkStage creates VpcStack and SecurityGroupsStack.

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

1. Create `test/stages/network-stage.test.ts`
2. Write tests verifying stage structure
3. Run tests to confirm they fail (stage doesn't exist yet)

Mark "Write failing tests" as completed.

### Step 3: Write Implementation
Mark "Write implementation" as in_progress.

Create `lib/stages/network-stage.ts` until tests pass.

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
