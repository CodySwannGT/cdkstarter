# Task: Create App Stage

**Type:** Task
**Parent:** None

## Description

Create the AppStage that orchestrates application infrastructure stacks (Aurora, Valkey, Cognito, IAM) for a stage environment. This stage depends on NetworkStage completing first.

## Acceptance Criteria

- [ ] `lib/stages/app-stage.ts` creates AppStage class extending cdk.Stage
- [ ] Imports VPC and security groups from NetworkStage via Fn.importValue
- [ ] Instantiates AuroraStack if features.aurora is true
- [ ] Instantiates ValkeyStack if features.valkey is true
- [ ] Instantiates CognitoStack if features.cognito is true
- [ ] Instantiates IamStack with resource ARNs
- [ ] Feature flags control stack creation
- [ ] Unit tests verify conditional stack creation
- [ ] File passes TypeScript compilation and linting

## Relevant Research

From `research.md`:
- **App Stage** (`lib/app-stage.ts:1-264`): Imports values from network stage via Fn.importValue, instantiates stacks conditionally based on feature flags

From `brief.md`:
- Pipeline Flow (lines 414-421): AppStage contains Aurora, Valkey, Cognito, IAM stacks
- Stage Orchestration (lines 493-494): Create AppStage with feature flags

## Applicable Skills

Invoke these skills before writing implementation code:

- `/coding-philosophy` - Always required for all code
- `/jsdoc-best-practices` - For documenting stage purpose and feature flags

## Implementation Details

**File to create:** `lib/stages/app-stage.ts`

**Props interface:**
```typescript
interface AppStageProps extends cdk.StageProps {
  readonly stageName: string;
  readonly stageEnvironment: StageEnvironment;
}
```

**Implementation:**
```typescript
export class AppStage extends cdk.Stage {
  public readonly auroraStack?: AuroraStack;
  public readonly valkeyStack?: ValkeyStack;
  public readonly cognitoStack?: CognitoStack;
  public readonly iamStack?: IamStack;

  constructor(scope: Construct, id: string, props: AppStageProps) {
    super(scope, id, props);

    const { stageName, stageEnvironment } = props;
    const { features } = stageEnvironment;

    // Import VPC and security groups from network stage
    const vpcId = cdk.Fn.importValue(`${stageName}-vpc-id`);
    const vpc = ec2.Vpc.fromVpcAttributes(this, "ImportedVpc", {
      vpcId,
      availabilityZones: cdk.Fn.split(",", cdk.Fn.importValue(`${stageName}-availability-zones`)),
    });

    const auroraSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this, "AuroraSg",
      cdk.Fn.importValue(`${stageName}-aurora-security-group-id`)
    );

    // Conditionally create Aurora
    if (features.aurora) {
      this.auroraStack = new AuroraStack(this, "AuroraStack", {
        stageName,
        vpc,
        securityGroup: auroraSecurityGroup,
        aurora: stageEnvironment.aurora,
      });
    }

    // Conditionally create Valkey
    if (features.valkey) {
      // Similar pattern...
    }

    // Conditionally create Cognito
    if (features.cognito) {
      this.cognitoStack = new CognitoStack(this, "CognitoStack", {
        stageName,
      });
    }

    // IAM stack needs ARNs from other stacks
    if (this.auroraStack && this.cognitoStack) {
      this.iamStack = new IamStack(this, "IamStack", {
        stageName,
        auroraClusterArn: this.auroraStack.clusterArn,
        auroraSecretArn: this.auroraStack.secretArn,
        cognitoUserPoolArn: this.cognitoStack.userPoolArn,
      });
    }
  }
}
```

**Feature flag handling:**
- `features.aurora`: Create AuroraStack
- `features.valkey`: Create ValkeyStack
- `features.cognito`: Create CognitoStack
- `features.xray`: Enable X-Ray in IAM policies

**Cross-stage imports:**
- VPC ID, availability zones
- Security group IDs
- Subnet IDs (for database placement)

## Testing Requirements

### Unit Tests
- [ ] `describe('AppStage')/it('should create AuroraStack when feature enabled')`: Verify conditional
- [ ] `describe('AppStage')/it('should skip AuroraStack when feature disabled')`: Verify conditional
- [ ] `describe('AppStage')/it('should create ValkeyStack when feature enabled')`: Verify conditional
- [ ] `describe('AppStage')/it('should create CognitoStack when feature enabled')`: Verify conditional
- [ ] `describe('AppStage')/it('should import VPC from network stage')`: Verify import

### Integration Tests
N/A - stage creation tested via unit tests

### E2E Tests
N/A - infrastructure stage, no user-facing changes

## Documentation Requirements

### Code Documentation (JSDoc)
- [ ] File preamble - explain AppStage purpose and feature flag system
- [ ] `AppStageProps` - document props
- [ ] `AppStage` - explain conditional stack creation and dependencies
- [ ] Feature flag section - document each flag's effect

### Database Comments
N/A - no database changes

### GraphQL Descriptions
N/A - no GraphQL changes

## Verification

### Type
`test-coverage`

### Proof Command
```bash
npm run build && npm run test -- --testPathPattern="app-stage" --coverage --collectCoverageFrom='lib/stages/app-stage.ts'
```

### Expected Output
All tests pass. AppStage conditionally creates stacks based on feature flags.

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

1. Create `test/stages/app-stage.test.ts`
2. Write tests verifying conditional stack creation
3. Run tests to confirm they fail (stage doesn't exist yet)

Mark "Write failing tests" as completed.

### Step 3: Write Implementation
Mark "Write implementation" as in_progress.

Create `lib/stages/app-stage.ts` until tests pass.

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
