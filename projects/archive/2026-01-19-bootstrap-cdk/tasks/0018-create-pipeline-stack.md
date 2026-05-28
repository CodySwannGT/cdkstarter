# Task: Create Pipeline Stack

**Type:** Task
**Parent:** None

## Description

Create the PipelineStack that provisions the CDK Pipeline with GitHub CodeConnections integration. This pipeline orchestrates deployments to all stage environments.

## Acceptance Criteria

- [ ] `lib/pipeline-stack.ts` creates PipelineStack class
- [ ] Uses CDK Pipelines (`aws-cdk-lib/pipelines`)
- [ ] GitHub source via `CodePipelineSource.connection()`
- [ ] Cross-account deployment enabled (`crossAccountKeys: true`)
- [ ] Pipeline stages added for each deployable environment
- [ ] Synth step with `npm ci` and `npx cdk synth`
- [ ] Stack outputs: pipeline ARN
- [ ] Unit tests verify pipeline structure
- [ ] File passes TypeScript compilation and linting

## Relevant Research

From `research.md`:
- **Pipeline Structure** (`lib/pipeline-stack.ts:1-199`):
  - Uses `CodePipeline` from `aws-cdk-lib/pipelines`
  - `CodePipelineSource.connection()` for GitHub via AWS CodeConnections
  - Stages deployed: TrustPolicy -> Shared -> (Network -> App -> Security per env)
  - Cross-account deployment with `crossAccountKeys: true`

From `brief.md`:
- Pipeline Flow (lines 389-426): Full pipeline stage order
- Support Infrastructure (line 486): PipelineStack with CDK Pipeline and CodeConnections

## Applicable Skills

Invoke these skills before writing implementation code:

- `/coding-philosophy` - Always required for all code
- `/jsdoc-best-practices` - For documenting pipeline structure

## Implementation Details

**File to create:** `lib/pipeline-stack.ts`

**Props interface:**
```typescript
interface PipelineStackProps extends cdk.StackProps {
  readonly repositoryOwner: string;
  readonly repositoryName: string;
  readonly branch: string;
  readonly connectionArn: string;
  readonly stageEnvironments: readonly StageEnvironment[];
  readonly supportEnvironment: SupportEnvironment;
}
```

**Implementation:**
```typescript
const pipeline = new pipelines.CodePipeline(this, "Pipeline", {
  pipelineName: "your-project-infrastructure",
  crossAccountKeys: true,
  synth: new pipelines.ShellStep("Synth", {
    input: pipelines.CodePipelineSource.connection(
      `${props.repositoryOwner}/${props.repositoryName}`,
      props.branch,
      { connectionArn: props.connectionArn }
    ),
    commands: [
      "npm ci",
      "npm run build",
      "npx cdk synth",
    ],
    primaryOutputDirectory: "cdk.out",
  }),
});

// Add support stage first (DNS, shared resources)
pipeline.addStage(new SupportStage(this, "Support", {
  env: {
    account: props.supportEnvironment.accountId,
    region: props.supportEnvironment.region,
  },
}));

// Add stages for each deployable environment
props.stageEnvironments.forEach(env => {
  // Skip PLACEHOLDER environments
  if (env.accountId === "PLACEHOLDER") return;

  pipeline.addStage(new NetworkStage(this, `${env.name}-Network`, { ... }));
  pipeline.addStage(new AppStage(this, `${env.name}-App`, { ... }));
  pipeline.addStage(new ObservabilityStage(this, `${env.name}-Observability`, { ... }));
});
```

**Pipeline structure:**
1. Source (GitHub via CodeConnections)
2. Synth (build and synthesize CDK)
3. SupportStage (shared account: DNS, CodeConnections)
4. Per environment:
   - NetworkStage (VPC, security groups)
   - AppStage (Aurora, Valkey, Cognito, IAM)
   - ObservabilityStage (SNS, alarms, dashboard)

**Note:** This task depends on stages being created first (tasks 0019-0022).

## Testing Requirements

### Unit Tests
- [ ] `describe('PipelineStack')/it('should create CodePipeline')`: Verify pipeline exists
- [ ] `describe('PipelineStack')/it('should use GitHub connection source')`: Verify source
- [ ] `describe('PipelineStack')/it('should enable cross-account keys')`: Verify setting
- [ ] `describe('PipelineStack')/it('should add stages for deployable environments')`: Verify stages
- [ ] `describe('PipelineStack')/it('should skip PLACEHOLDER environments')`: Verify filtering

### Integration Tests
N/A - stack creation tested via unit tests with CDK assertions

### E2E Tests
N/A - infrastructure stack, no user-facing changes

## Documentation Requirements

### Code Documentation (JSDoc)
- [ ] File preamble - explain pipeline purpose and cross-account deployment
- [ ] `PipelineStackProps` - document each prop, especially connectionArn
- [ ] `PipelineStack` - explain stage ordering and dependencies
- [ ] PLACEHOLDER handling - document why and how they're skipped

### Database Comments
N/A - no database changes

### GraphQL Descriptions
N/A - no GraphQL changes

## Verification

### Type
`test-coverage`

### Proof Command
```bash
npm run build && npm run test -- --testPathPattern="pipeline-stack" --coverage --collectCoverageFrom='lib/pipeline-stack.ts'
```

### Expected Output
All tests pass. Pipeline created with correct stages for deployable environments.

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

1. Create `test/pipeline-stack.test.ts`
2. Write tests using CDK assertions library
3. Run tests to confirm they fail (stack doesn't exist yet)

Mark "Write failing tests" as completed.

### Step 3: Write Implementation
Mark "Write implementation" as in_progress.

Create `lib/pipeline-stack.ts` until tests pass.

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
