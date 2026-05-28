# Task: Create Aurora Stack

**Type:** Task
**Parent:** None

## Description

Create the AuroraStack that provisions Aurora Serverless v2 PostgreSQL with IAM authentication, RDS Proxy, and configurable capacity. This is the primary database for the application.

## Acceptance Criteria

- [ ] `lib/stacks/database/aurora-stack.ts` creates AuroraStack class
- [ ] Aurora Serverless v2 PostgreSQL with engine version 15+
- [ ] IAM authentication enabled via RDS Proxy
- [ ] Configurable min/max capacity via props (from environment config)
- [ ] RDS Proxy with IAM auth and read-only endpoint
- [ ] Deletion protection configurable
- [ ] Backup retention configurable
- [ ] CloudWatch log exports enabled (postgresql)
- [ ] Credentials stored in Secrets Manager
- [ ] Stack outputs: cluster endpoint, proxy endpoint, read-only proxy endpoint, secret ARN
- [ ] Unit tests verify Aurora resource creation
- [ ] File passes TypeScript compilation and linting

## Relevant Research

From `research.md`:
- **Aurora Stack** (`lib/aurora-stack.ts:1-246`):
  - Uses `rds.DatabaseCluster` with `instanceType: new ec2.InstanceType("serverless")`
  - Serverless v2 via L1 escape hatch: `serverlessV2ScalingConfiguration`
  - RDS Proxy with IAM auth: `cluster.addProxy({ iamAuth: true })`
  - Read-only proxy endpoint via `rds.CfnDBProxyEndpoint`
- **Aurora Serverless v2 with IAM Auth** (lines 165-173): Detailed setup instructions
- Capacity values need to be configurable per environment

From `brief.md`:
- Required AWS Resources (line 26): Aurora RDS (cluster, proxy, secrets)
- Aurora capacity settings (lines 203-211): minCapacity, maxCapacity, instanceCount, deletionProtection, backupRetentionDays

## Applicable Skills

Invoke these skills before writing implementation code:

- `/coding-philosophy` - Always required for all code
- `/jsdoc-best-practices` - For documenting stack purpose and capacity units

## Implementation Details

**File to create:** `lib/stacks/database/aurora-stack.ts`

**Props interface:**
```typescript
interface AuroraStackProps extends cdk.StackProps {
  readonly stageName: string;
  readonly vpc: ec2.IVpc;
  readonly securityGroup: ec2.ISecurityGroup;
  readonly aurora: AuroraConfig;
}
```

**Implementation pattern (from reference):**
```typescript
const cluster = new rds.DatabaseCluster(this, "AuroraCluster", {
  engine: rds.DatabaseClusterEngine.auroraPostgres({
    version: rds.AuroraPostgresEngineVersion.VER_15_4,
  }),
  writer: rds.ClusterInstance.serverlessV2("writer"),
  readers: props.aurora.instanceCount > 1
    ? [rds.ClusterInstance.serverlessV2("reader", { scaleWithWriter: true })]
    : undefined,
  vpc: props.vpc,
  vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
  securityGroups: [props.securityGroup],
  deletionProtection: props.aurora.deletionProtection,
  backup: { retention: cdk.Duration.days(props.aurora.backupRetentionDays) },
  cloudwatchLogsExports: ["postgresql"],
  cloudwatchLogsRetention: logs.RetentionDays.ONE_MONTH,
  serverlessV2MinCapacity: props.aurora.minCapacity,
  serverlessV2MaxCapacity: props.aurora.maxCapacity,
});

// RDS Proxy with IAM auth
const proxy = cluster.addProxy("RdsProxy", {
  vpc: props.vpc,
  secrets: [cluster.secret!],
  iamAuth: true,
  securityGroups: [props.securityGroup],
});
```

**Outputs to export:**
- `{stageName}-aurora-cluster-endpoint`
- `{stageName}-aurora-proxy-endpoint`
- `{stageName}-aurora-proxy-readonly-endpoint`
- `{stageName}-aurora-secret-arn`

**Capacity unit documentation (for JSDoc):**
- 0.5 ACU = 1 GB RAM (minimum for dev)
- 1 ACU = 2 GB RAM
- Each ACU provides approximately 2 GB of memory

## Testing Requirements

### Unit Tests
- [ ] `describe('AuroraStack')/it('should create Aurora Serverless v2 cluster')`: Verify engine type
- [ ] `describe('AuroraStack')/it('should configure serverless capacity')`: Verify min/max ACUs
- [ ] `describe('AuroraStack')/it('should create RDS Proxy with IAM auth')`: Verify proxy
- [ ] `describe('AuroraStack')/it('should enable deletion protection when configured')`: Verify setting
- [ ] `describe('AuroraStack')/it('should export cluster and proxy endpoints')`: Verify outputs

### Integration Tests
N/A - stack creation tested via unit tests with CDK assertions

### E2E Tests
N/A - infrastructure stack, no user-facing changes

## Documentation Requirements

### Code Documentation (JSDoc)
- [ ] File preamble - explain Aurora Serverless v2 choice and IAM auth benefits
- [ ] `AuroraStackProps` - document each prop, especially capacity units
- [ ] `AuroraStack` - explain proxy usage and why IAM auth is preferred
- [ ] Capacity section - document ACU to memory mapping

### Database Comments
N/A - this creates the database, doesn't define schema

### GraphQL Descriptions
N/A - no GraphQL changes

## Verification

### Type
`test-coverage`

### Proof Command
```bash
npm run build && npm run test -- --testPathPattern="aurora-stack" --coverage --collectCoverageFrom='lib/stacks/database/aurora-stack.ts'
```

### Expected Output
All tests pass. Aurora cluster created with correct configuration.

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

1. Create `test/stacks/database/aurora-stack.test.ts`
2. Write tests using CDK assertions library
3. Run tests to confirm they fail (stack doesn't exist yet)

Mark "Write failing tests" as completed.

### Step 3: Write Implementation
Mark "Write implementation" as in_progress.

Create `lib/stacks/database/aurora-stack.ts` until tests pass.

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
