# Task: Create Cross-Stage Imports

**Type:** Task
**Parent:** None

## Description

Create the cross-stage import utilities that provide type-safe access to CloudFormation exports from other stacks. These utilities standardize how stages reference outputs from previous stages.

## Acceptance Criteria

- [ ] `util/cross-stage-imports.ts` exports utility functions for importing cross-stack values
- [ ] `importVpc(stageName)` returns VPC attributes from NetworkStage
- [ ] `importSecurityGroups(stageName)` returns security group references
- [ ] `importAuroraOutputs(stageName)` returns Aurora cluster and proxy endpoints
- [ ] `importValkeyOutputs(stageName)` returns Valkey endpoint
- [ ] `importCognitoOutputs(stageName)` returns user pool ID and ARN
- [ ] All functions use consistent export name patterns
- [ ] Unit tests verify import function outputs
- [ ] File passes TypeScript compilation and linting

## Relevant Research

From `research.md`:
- **Cross-Stage Imports** (`util/cross-stage-imports.ts:1-57`): Uses `cdk.Fn.importValue()` for cross-stack references, imports VPC and security groups from network stacks

From `brief.md`:
- File structure (line 181): `util/cross-stage-imports.ts`
- Stage Orchestration (line 497): Wire up cross-stage imports utility

## Applicable Skills

Invoke these skills before writing implementation code:

- `/coding-philosophy` - Always required for all code
- `/jsdoc-best-practices` - For documenting import patterns

## Implementation Details

**File to create:** `util/cross-stage-imports.ts`

**Export name convention:**
```
{stageName}-{resource}-{attribute}
```

Examples:
- `dev-vpc-id`
- `dev-aurora-cluster-endpoint`
- `staging-cognito-user-pool-id`

**Implementation:**
```typescript
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

/**
 * Import VPC from NetworkStage exports.
 * Returns VPC attributes for use in dependent stacks.
 */
export const importVpc = (
  scope: Construct,
  stageName: string
): ec2.IVpc => {
  const vpcId = cdk.Fn.importValue(`${stageName}-vpc-id`);
  const availabilityZones = cdk.Fn.split(
    ",",
    cdk.Fn.importValue(`${stageName}-availability-zones`)
  );
  const privateSubnetIds = cdk.Fn.split(
    ",",
    cdk.Fn.importValue(`${stageName}-private-subnet-ids`)
  );
  const isolatedSubnetIds = cdk.Fn.split(
    ",",
    cdk.Fn.importValue(`${stageName}-isolated-subnet-ids`)
  );

  return ec2.Vpc.fromVpcAttributes(scope, "ImportedVpc", {
    vpcId,
    availabilityZones,
    privateSubnetIds,
    isolatedSubnetIds,
  });
};

/**
 * Import security groups from NetworkStage exports.
 */
export const importSecurityGroups = (
  scope: Construct,
  stageName: string
): {
  aurora: ec2.ISecurityGroup;
  valkey: ec2.ISecurityGroup;
  lambda: ec2.ISecurityGroup;
} => {
  return {
    aurora: ec2.SecurityGroup.fromSecurityGroupId(
      scope,
      "AuroraSg",
      cdk.Fn.importValue(`${stageName}-aurora-security-group-id`)
    ),
    valkey: ec2.SecurityGroup.fromSecurityGroupId(
      scope,
      "ValkeySg",
      cdk.Fn.importValue(`${stageName}-valkey-security-group-id`)
    ),
    lambda: ec2.SecurityGroup.fromSecurityGroupId(
      scope,
      "LambdaSg",
      cdk.Fn.importValue(`${stageName}-lambda-security-group-id`)
    ),
  };
};

/**
 * Import Aurora outputs from AppStage exports.
 */
export const importAuroraOutputs = (stageName: string) => ({
  clusterEndpoint: cdk.Fn.importValue(`${stageName}-aurora-cluster-endpoint`),
  proxyEndpoint: cdk.Fn.importValue(`${stageName}-aurora-proxy-endpoint`),
  proxyReadOnlyEndpoint: cdk.Fn.importValue(`${stageName}-aurora-proxy-readonly-endpoint`),
  secretArn: cdk.Fn.importValue(`${stageName}-aurora-secret-arn`),
  clusterIdentifier: cdk.Fn.importValue(`${stageName}-aurora-cluster-identifier`),
});

// Similar patterns for Valkey, Cognito...
```

**Naming conventions (document in JSDoc):**
- Use lowercase stage names
- Use kebab-case for multi-word attributes
- Consistent patterns make debugging easier

## Testing Requirements

### Unit Tests
- [ ] `describe('cross-stage-imports')/it('importVpc should return IVpc')`: Verify return type
- [ ] `describe('cross-stage-imports')/it('importSecurityGroups should return all groups')`: Verify structure
- [ ] `describe('cross-stage-imports')/it('importAuroraOutputs should return all outputs')`: Verify structure
- [ ] `describe('cross-stage-imports')/it('should use correct export name pattern')`: Verify naming

### Integration Tests
N/A - utility functions tested via unit tests

### E2E Tests
N/A - infrastructure utility, no user-facing changes

## Documentation Requirements

### Code Documentation (JSDoc)
- [ ] File preamble - explain cross-stage import pattern and why it exists
- [ ] `importVpc` - document what's imported and required exports
- [ ] `importSecurityGroups` - document what's imported
- [ ] Export naming section - document the naming convention

### Database Comments
N/A - no database changes

### GraphQL Descriptions
N/A - no GraphQL changes

## Verification

### Type
`test-coverage`

### Proof Command
```bash
npm run build && npm run test -- --testPathPattern="cross-stage-imports" --coverage --collectCoverageFrom='util/cross-stage-imports.ts'
```

### Expected Output
All tests pass. Import functions return correct types.

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

1. Create `test/util/cross-stage-imports.test.ts`
2. Write tests verifying import function structure
3. Run tests to confirm they fail (file doesn't exist yet)

Mark "Write failing tests" as completed.

### Step 3: Write Implementation
Mark "Write implementation" as in_progress.

Create `util/cross-stage-imports.ts` until tests pass.

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
