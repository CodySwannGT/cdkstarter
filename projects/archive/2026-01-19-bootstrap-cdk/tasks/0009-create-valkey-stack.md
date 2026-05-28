# Task: Create Valkey Stack

**Type:** Task
**Parent:** None

## Description

Create the ValkeyStack that provisions an ElastiCache Valkey cluster for caching. Valkey is a Redis-compatible, open-source in-memory data store.

## Acceptance Criteria

- [ ] `lib/stacks/database/valkey-stack.ts` creates ValkeyStack class
- [ ] ElastiCache replication group with Valkey engine
- [ ] Configurable node type via props (from environment config)
- [ ] Configurable number of cache nodes via props
- [ ] Subnet group in isolated subnets
- [ ] Security group for cache access
- [ ] Encryption at rest and in transit enabled
- [ ] Stack outputs: cache endpoint, cache port
- [ ] Unit tests verify Valkey resource creation
- [ ] File passes TypeScript compilation and linting

## Relevant Research

From `research.md`:
- **ElastiCache Stack** (`lib/elasticache-stack.ts:1-52`): Uses `elasticache.CfnCacheCluster` L1 construct
- **ElastiCache Valkey Support** (lines 174-178):
  - L1 constructs: `CfnReplicationGroup` with `engine: "valkey"`, `cacheParameterGroupFamily: "valkey7"`
  - open-constructs library provides `ServerlessCache` with Valkey support

From `brief.md`:
- Required AWS Resources (line 26): Valkey (cache endpoint)
- Valkey configuration (lines 213-216): nodeType, numCacheNodes

## Applicable Skills

Invoke these skills before writing implementation code:

- `/coding-philosophy` - Always required for all code
- `/jsdoc-best-practices` - For documenting Valkey configuration

## Implementation Details

**File to create:** `lib/stacks/database/valkey-stack.ts`

**Props interface:**
```typescript
interface ValkeyStackProps extends cdk.StackProps {
  readonly stageName: string;
  readonly vpc: ec2.IVpc;
  readonly securityGroup: ec2.ISecurityGroup;
  readonly valkey: ValkeyConfig;
}
```

**Implementation using L1 construct:**
```typescript
// Subnet group for cache cluster
const subnetGroup = new elasticache.CfnSubnetGroup(this, "SubnetGroup", {
  description: `${props.stageName} Valkey subnet group`,
  subnetIds: props.vpc.isolatedSubnets.map(s => s.subnetId),
  cacheSubnetGroupName: `${props.stageName}-valkey-subnet-group`,
});

// Parameter group for Valkey 7
const parameterGroup = new elasticache.CfnParameterGroup(this, "ParameterGroup", {
  cacheParameterGroupFamily: "valkey7",
  description: `${props.stageName} Valkey parameter group`,
});

// Replication group (Valkey cluster)
const replicationGroup = new elasticache.CfnReplicationGroup(this, "ReplicationGroup", {
  replicationGroupDescription: `${props.stageName} Valkey cluster`,
  engine: "valkey",
  engineVersion: "7.2",
  cacheNodeType: props.valkey.nodeType,
  numNodeGroups: 1,
  replicasPerNodeGroup: props.valkey.numCacheNodes - 1,
  cacheSubnetGroupName: subnetGroup.cacheSubnetGroupName,
  securityGroupIds: [props.securityGroup.securityGroupId],
  cacheParameterGroupName: parameterGroup.ref,
  atRestEncryptionEnabled: true,
  transitEncryptionEnabled: true,
  automaticFailoverEnabled: props.valkey.numCacheNodes > 1,
});
```

**Outputs to export:**
- `{stageName}-valkey-endpoint`
- `{stageName}-valkey-port`

**Node type recommendations (for JSDoc):**
- dev: `cache.t4g.micro` (0.5 GB) - minimal cost
- staging: `cache.t4g.small` (1.37 GB) - moderate testing
- production: `cache.r7g.large` (13.07 GB) - high performance

## Testing Requirements

### Unit Tests
- [ ] `describe('ValkeyStack')/it('should create Valkey replication group')`: Verify resource type
- [ ] `describe('ValkeyStack')/it('should use Valkey engine')`: Verify engine
- [ ] `describe('ValkeyStack')/it('should configure node type from props')`: Verify configuration
- [ ] `describe('ValkeyStack')/it('should enable encryption')`: Verify at-rest and in-transit
- [ ] `describe('ValkeyStack')/it('should export cache endpoint')`: Verify outputs

### Integration Tests
N/A - stack creation tested via unit tests with CDK assertions

### E2E Tests
N/A - infrastructure stack, no user-facing changes

## Documentation Requirements

### Code Documentation (JSDoc)
- [ ] File preamble - explain Valkey choice over Redis (open-source, AWS support)
- [ ] `ValkeyStackProps` - document each prop, especially node types
- [ ] `ValkeyStack` - explain cluster configuration and encryption
- [ ] Node type section - document memory per node type

### Database Comments
N/A - no database schema changes

### GraphQL Descriptions
N/A - no GraphQL changes

## Verification

### Type
`test-coverage`

### Proof Command
```bash
npm run build && npm run test -- --testPathPattern="valkey-stack" --coverage --collectCoverageFrom='lib/stacks/database/valkey-stack.ts'
```

### Expected Output
All tests pass. Valkey cluster created with correct configuration.

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

1. Create `test/stacks/database/valkey-stack.test.ts`
2. Write tests using CDK assertions library
3. Run tests to confirm they fail (stack doesn't exist yet)

Mark "Write failing tests" as completed.

### Step 3: Write Implementation
Mark "Write implementation" as in_progress.

Create `lib/stacks/database/valkey-stack.ts` until tests pass.

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
