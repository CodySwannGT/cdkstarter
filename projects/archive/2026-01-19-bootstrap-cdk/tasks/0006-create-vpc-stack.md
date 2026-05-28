# Task: Create VPC Stack

**Type:** Task
**Parent:** None

## Description

Create the VpcStack that provisions a VPC with configurable CIDR, public subnets, private subnets with egress, and isolated subnets. NAT gateway count varies by environment (1 for dev, 2 for production).

## Acceptance Criteria

- [ ] `lib/stacks/network/vpc-stack.ts` creates VpcStack class extending cdk.Stack
- [ ] VPC CIDR is configurable via props (from environment config)
- [ ] Three subnet tiers: public (ingress), private with egress (application), private isolated (data)
- [ ] NAT gateway count configurable (1 for non-prod, 2 for prod)
- [ ] VPC flow logs enabled for staging/production
- [ ] Stack outputs: vpcId, publicSubnetIds, privateSubnetIds, isolatedSubnetIds, availabilityZones
- [ ] All outputs use CfnOutput for cross-stack reference
- [ ] Unit tests verify VPC resource creation with correct properties
- [ ] File passes TypeScript compilation and linting

## Relevant Research

From `research.md`:
- **VPC Stack** (`lib/infrastructure-stack.ts:1-149`): Creates VPC with configurable CIDR, subnet configuration (public, private with egress, private isolated), NAT gateways (2 for prod, 1 for non-prod), flow logs for production/staging
- **Cross-Stage Imports** (`util/cross-stage-imports.ts:1-57`): Uses `cdk.Fn.importValue()` for cross-stack references

From `brief.md`:
- Required AWS Resources (line 28): VPC (private subnets, security groups)
- File structure (lines 156-158): `lib/stacks/network/vpc-stack.ts`

## Applicable Skills

Invoke these skills before writing implementation code:

- `/coding-philosophy` - Always required for all code
- `/jsdoc-best-practices` - For documenting stack purpose and props

## Implementation Details

**File to create:** `lib/stacks/network/vpc-stack.ts`

**Props interface:**
```typescript
interface VpcStackProps extends cdk.StackProps {
  readonly stageName: string;
  readonly vpcCidr: string;
  readonly natGatewayCount: number;
  readonly enableFlowLogs: boolean;
}
```

**Implementation pattern (from reference):**
```typescript
const vpc = new ec2.Vpc(this, "Vpc", {
  ipAddresses: ec2.IpAddresses.cidr(props.vpcCidr),
  maxAzs: 2,
  natGateways: props.natGatewayCount,
  subnetConfiguration: [
    {
      name: "public",
      subnetType: ec2.SubnetType.PUBLIC,
      cidrMask: 24,
    },
    {
      name: "private",
      subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      cidrMask: 24,
    },
    {
      name: "isolated",
      subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      cidrMask: 24,
    },
  ],
});
```

**Outputs to export:**
- `{stageName}-vpc-id`
- `{stageName}-public-subnet-ids`
- `{stageName}-private-subnet-ids`
- `{stageName}-isolated-subnet-ids`
- `{stageName}-availability-zones`

**CIDR documentation (per Q4 answer):**
Document suggested CIDR patterns in JSDoc:
- 10.0.0.0/16 (dev)
- 10.1.0.0/16 (staging)
- 10.2.0.0/16 (production)
Two environments cannot share the same CIDR block (validation in config-loader).

## Testing Requirements

### Unit Tests
- [ ] `describe('VpcStack')/it('should create VPC with correct CIDR')`: Verify CIDR configuration
- [ ] `describe('VpcStack')/it('should create three subnet tiers')`: Verify subnet types
- [ ] `describe('VpcStack')/it('should create NAT gateway per configuration')`: Verify NAT count
- [ ] `describe('VpcStack')/it('should enable flow logs when configured')`: Verify flow logs
- [ ] `describe('VpcStack')/it('should export VPC ID as output')`: Verify CfnOutput

### Integration Tests
N/A - stack creation tested via unit tests with CDK assertions

### E2E Tests
N/A - infrastructure stack, no user-facing changes

## Documentation Requirements

### Code Documentation (JSDoc)
- [ ] File preamble - explain VPC purpose and subnet strategy
- [ ] `VpcStackProps` - document each prop and valid values
- [ ] `VpcStack` - explain the three-tier subnet architecture
- [ ] CIDR section - document uniqueness requirement and suggested patterns

### Database Comments
N/A - no database changes

### GraphQL Descriptions
N/A - no GraphQL changes

## Verification

### Type
`test-coverage`

### Proof Command
```bash
npm run build && npm run test -- --testPathPattern="vpc-stack" --coverage --collectCoverageFrom='lib/stacks/network/vpc-stack.ts'
```

### Expected Output
All tests pass. VPC resource created with correct CIDR, subnets, and NAT gateway configuration.

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

1. Create `test/stacks/network/vpc-stack.test.ts`
2. Write tests using CDK assertions library
3. Run tests to confirm they fail (stack doesn't exist yet)

Mark "Write failing tests" as completed.

### Step 3: Write Implementation
Mark "Write implementation" as in_progress.

Create `lib/stacks/network/vpc-stack.ts` until tests pass.

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
