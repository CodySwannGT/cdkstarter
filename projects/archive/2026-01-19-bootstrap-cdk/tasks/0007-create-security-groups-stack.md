# Task: Create Security Groups Stack

**Type:** Task
**Parent:** None

## Description

Create the SecurityGroupsStack that provisions security groups for Aurora, Valkey, and Lambda. These security groups control network access between infrastructure components.

## Acceptance Criteria

- [ ] `lib/stacks/network/security-groups-stack.ts` creates SecurityGroupsStack class
- [ ] Aurora security group allows PostgreSQL (5432) from Lambda security group
- [ ] Valkey security group allows Redis (6379) from Lambda security group
- [ ] Lambda security group allows outbound to Aurora and Valkey
- [ ] VPC is imported via cross-stack reference
- [ ] Stack outputs security group IDs for cross-stack use
- [ ] All security groups have descriptive names and descriptions
- [ ] Unit tests verify security group rules
- [ ] File passes TypeScript compilation and linting

## Relevant Research

From `research.md`:
- **Security Groups** (`lib/security-group-stack.ts:1-161`): Creates cluster SG, lambda SG, VPN SG, Redis SG with ingress rules for database access
- **Cross-Stage Imports** (`util/cross-stage-imports.ts:1-57`): Uses `cdk.Fn.importValue()` for VPC reference

From `brief.md`:
- Required AWS Resources (line 28): VPC (private subnets, security groups)
- File structure (line 158): `lib/stacks/network/security-groups-stack.ts`

## Applicable Skills

Invoke these skills before writing implementation code:

- `/coding-philosophy` - Always required for all code
- `/jsdoc-best-practices` - For documenting security group purposes

## Implementation Details

**File to create:** `lib/stacks/network/security-groups-stack.ts`

**Props interface:**
```typescript
interface SecurityGroupsStackProps extends cdk.StackProps {
  readonly stageName: string;
  readonly vpc: ec2.IVpc;
}
```

**Security groups to create:**

1. **Aurora Security Group**
   - Name: `{stageName}-aurora-sg`
   - Ingress: Port 5432 from Lambda SG
   - Purpose: Controls access to Aurora PostgreSQL

2. **Valkey Security Group**
   - Name: `{stageName}-valkey-sg`
   - Ingress: Port 6379 from Lambda SG
   - Purpose: Controls access to Valkey cache

3. **Lambda Security Group**
   - Name: `{stageName}-lambda-sg`
   - Egress: To Aurora SG on 5432, to Valkey SG on 6379
   - Purpose: Lambda functions that access database and cache

**Outputs to export:**
- `{stageName}-aurora-security-group-id`
- `{stageName}-valkey-security-group-id`
- `{stageName}-lambda-security-group-id`

## Testing Requirements

### Unit Tests
- [ ] `describe('SecurityGroupsStack')/it('should create Aurora security group')`: Verify SG exists
- [ ] `describe('SecurityGroupsStack')/it('should allow PostgreSQL from Lambda SG')`: Verify ingress rule
- [ ] `describe('SecurityGroupsStack')/it('should create Valkey security group')`: Verify SG exists
- [ ] `describe('SecurityGroupsStack')/it('should allow Redis from Lambda SG')`: Verify ingress rule
- [ ] `describe('SecurityGroupsStack')/it('should create Lambda security group')`: Verify SG exists
- [ ] `describe('SecurityGroupsStack')/it('should export security group IDs')`: Verify outputs

### Integration Tests
N/A - stack creation tested via unit tests with CDK assertions

### E2E Tests
N/A - infrastructure stack, no user-facing changes

## Documentation Requirements

### Code Documentation (JSDoc)
- [ ] File preamble - explain security group purpose and network isolation strategy
- [ ] `SecurityGroupsStackProps` - document each prop
- [ ] `SecurityGroupsStack` - explain the security group relationships
- [ ] Each security group - explain what it protects and who can access

### Database Comments
N/A - no database changes

### GraphQL Descriptions
N/A - no GraphQL changes

## Verification

### Type
`test-coverage`

### Proof Command
```bash
npm run build && npm run test -- --testPathPattern="security-groups-stack" --coverage --collectCoverageFrom='lib/stacks/network/security-groups-stack.ts'
```

### Expected Output
All tests pass. Security groups created with correct ingress/egress rules.

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

1. Create `test/stacks/network/security-groups-stack.test.ts`
2. Write tests using CDK assertions library
3. Run tests to confirm they fail (stack doesn't exist yet)

Mark "Write failing tests" as completed.

### Step 3: Write Implementation
Mark "Write implementation" as in_progress.

Create `lib/stacks/network/security-groups-stack.ts` until tests pass.

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
