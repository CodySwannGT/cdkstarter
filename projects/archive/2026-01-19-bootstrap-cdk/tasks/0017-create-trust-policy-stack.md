# Task: Create Trust Policy Stack

**Type:** Task
**Parent:** None

## Description

Create the TrustPolicyStack that manages CDK bootstrap role trust relationships. This enables the shared account's pipeline to deploy to stage environment accounts.

## Acceptance Criteria

- [ ] `lib/stacks/support/trust-policy-stack.ts` creates TrustPolicyStack class
- [ ] Configures CDK bootstrap roles in each stage account to trust the shared account
- [ ] Uses dynamic role lookup for trust policy configuration
- [ ] Only creates trust policies for environments with valid (non-PLACEHOLDER) account IDs
- [ ] Unit tests verify trust policy creation
- [ ] File passes TypeScript compilation and linting

## Relevant Research

From `research.md`:
- **Trust Policy Stage** (`lib/trust-policy-stage.ts:1-61`): Manages CDK bootstrap role trust policies, iterates over environments
- **CdkTrustPolicyStack** (`lib/cdk-trust-policy-stack.ts:1-207`): CDK bootstrap role trust configuration

From `brief.md`:
- Pipeline Flow (lines 397-400): TrustPolicyStage configures CDK bootstrap trust relationships
- Support Infrastructure (line 487): TrustPolicyStack for bootstrap role trust

## Applicable Skills

Invoke these skills before writing implementation code:

- `/coding-philosophy` - Always required for all code
- `/jsdoc-best-practices` - For documenting trust relationship setup

## Implementation Details

**File to create:** `lib/stacks/support/trust-policy-stack.ts`

**Props interface:**
```typescript
interface TrustPolicyStackProps extends cdk.StackProps {
  readonly stageName: string;
  readonly targetAccountId: string;
  readonly pipelineAccountId: string;
  readonly region: string;
}
```

**Implementation pattern (from reference):**
```typescript
// Get the CDK bootstrap roles in the target account
const deployRoleArn = `arn:aws:iam::${props.targetAccountId}:role/cdk-hnb659fds-deploy-role-${props.targetAccountId}-${props.region}`;
const filePublishRoleArn = `arn:aws:iam::${props.targetAccountId}:role/cdk-hnb659fds-file-publishing-role-${props.targetAccountId}-${props.region}`;
const imagePublishRoleArn = `arn:aws:iam::${props.targetAccountId}:role/cdk-hnb659fds-image-publishing-role-${props.targetAccountId}-${props.region}`;
const lookupRoleArn = `arn:aws:iam::${props.targetAccountId}:role/cdk-hnb659fds-lookup-role-${props.targetAccountId}-${props.region}`;

// Import roles and update trust policies to allow pipeline account
const deployRole = iam.Role.fromRoleArn(this, "DeployRole", deployRoleArn);
// Note: Trust policy updates require custom resources or manual bootstrapping
```

**Note on implementation complexity:**
Trust policy updates for CDK bootstrap roles typically require:
1. Custom resources that call IAM APIs
2. Or manual `cdk bootstrap --trust` commands

For initial implementation, document the manual bootstrap command needed:
```bash
cdk bootstrap aws://{targetAccountId}/{region} \
  --trust {pipelineAccountId} \
  --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
```

**Outputs:**
- Documentation of trust relationships configured

## Testing Requirements

### Unit Tests
- [ ] `describe('TrustPolicyStack')/it('should create stack for valid account IDs')`: Verify creation
- [ ] `describe('TrustPolicyStack')/it('should use correct CDK bootstrap role ARN format')`: Verify ARNs
- [ ] `describe('TrustPolicyStack')/it('should reference pipeline account in trust')`: Verify trust

### Integration Tests
N/A - stack creation tested via unit tests with CDK assertions

### E2E Tests
N/A - infrastructure stack, no user-facing changes

## Documentation Requirements

### Code Documentation (JSDoc)
- [ ] File preamble - explain trust policy purpose and CDK bootstrap relationship
- [ ] `TrustPolicyStackProps` - document each prop
- [ ] `TrustPolicyStack` - explain the trust relationship chain
- [ ] Manual bootstrap section - document required `cdk bootstrap` commands

### Database Comments
N/A - no database changes

### GraphQL Descriptions
N/A - no GraphQL changes

## Verification

### Type
`test-coverage`

### Proof Command
```bash
npm run build && npm run test -- --testPathPattern="trust-policy-stack" --coverage --collectCoverageFrom='lib/stacks/support/trust-policy-stack.ts'
```

### Expected Output
All tests pass. Trust policy stack created with correct role ARN references.

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

1. Create `test/stacks/support/trust-policy-stack.test.ts`
2. Write tests using CDK assertions library
3. Run tests to confirm they fail (stack doesn't exist yet)

Mark "Write failing tests" as completed.

### Step 3: Write Implementation
Mark "Write implementation" as in_progress.

Create `lib/stacks/support/trust-policy-stack.ts` until tests pass.

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
