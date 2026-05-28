# Task: Update Entry Point

**Type:** Task
**Parent:** None

## Description

Update the CDK application entry point (`bin/infrastructure.ts`) to use the configuration system and wire up the pipeline with all stages.

## Acceptance Criteria

- [ ] `bin/infrastructure.ts` loads configuration via config-loader
- [ ] Validates configuration on startup
- [ ] Creates PipelineStack with all stages
- [ ] Filters PLACEHOLDER environments from deployment
- [ ] Provides clear error messages for configuration issues
- [ ] Unit tests verify entry point logic
- [ ] File passes TypeScript compilation and linting

## Relevant Research

From `research.md`:
- **Entry point**: `bin/infrastructure.ts:1-16` - Currently a placeholder
- Per Q2 answer: Only deploy environments with valid accountIds

From `brief.md`:
- Entry Point and Validation (lines 499-504): Update entry point with config loader, validation
- File structure (line 184): `bin/infrastructure.ts`

## Applicable Skills

Invoke these skills before writing implementation code:

- `/coding-philosophy` - Always required for all code
- `/jsdoc-best-practices` - For documenting application bootstrap

## Implementation Details

**File to update:** `bin/infrastructure.ts`

**Implementation:**
```typescript
#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { PipelineStack } from "../lib/pipeline-stack";
import {
  validateConfiguration,
  getDeployableStageEnvironments,
  getDeployableSharedEnvironment,
  getDomainConfig,
  getAlarmThresholds,
  getDashboardWidgets,
  ConfigurationError,
} from "../util/config-loader";

/**
 * CDK Application entry point for cdkstarter infrastructure.
 *
 * This application creates a CDK Pipeline that deploys infrastructure
 * to multiple AWS accounts based on configuration in config/*.ts files.
 *
 * @see config/environments.ts - Environment definitions
 * @see config/domains.ts - Domain configuration
 * @see config/observability.ts - Monitoring configuration
 */

const app = new cdk.App();

// Validate configuration first
try {
  validateConfiguration();
} catch (error) {
  if (error instanceof ConfigurationError) {
    console.error(`Configuration Error: ${error.message}`);
    console.error("Please fix the configuration and try again.");
    process.exit(1);
  }
  throw error;
}

// Get deployable environments (filters PLACEHOLDER)
const stageEnvironments = getDeployableStageEnvironments();
const sharedEnvironment = getDeployableSharedEnvironment();

// Warn if no deployable environments
if (stageEnvironments.length === 0) {
  console.warn("Warning: No deployable stage environments found.");
  console.warn("All environments have PLACEHOLDER account IDs.");
  console.warn("The pipeline will be created but will not deploy any stages.");
}

if (!sharedEnvironment) {
  console.warn("Warning: Shared environment has PLACEHOLDER account ID.");
  console.warn("Pipeline cannot be deployed until shared account is configured.");
}

// Create pipeline stack (only if shared environment is deployable)
if (sharedEnvironment) {
  new PipelineStack(app, "CdkstarterInfrastructurePipeline", {
    env: {
      account: sharedEnvironment.accountId,
      region: sharedEnvironment.region,
    },
    repositoryOwner: "gunnertech",
    repositoryName: "cdkstarter",
    branch: "main",
    connectionArn: app.node.tryGetContext("connectionArn") ?? "PLACEHOLDER",
    stageEnvironments,
    supportEnvironment: sharedEnvironment,
    domainConfig: getDomainConfig(),
    alarmThresholds: getAlarmThresholds(),
    dashboardWidgets: getDashboardWidgets(),
  });
}

app.synth();
```

**Key behaviors:**
1. Validate configuration first - fail fast with clear error
2. Filter PLACEHOLDER environments from deployment
3. Warn but continue if environments are missing
4. Fail gracefully if shared account not configured
5. Pass configuration to PipelineStack

## Testing Requirements

### Unit Tests
- [ ] `describe('infrastructure')/it('should validate configuration on startup')`: Verify validation
- [ ] `describe('infrastructure')/it('should filter PLACEHOLDER environments')`: Verify filtering
- [ ] `describe('infrastructure')/it('should warn when no deployable environments')`: Verify warning
- [ ] `describe('infrastructure')/it('should create PipelineStack when shared env configured')`: Verify creation

### Integration Tests
- [ ] `describe('infrastructure')/it('should synth without errors')`: Verify `cdk synth` works

### E2E Tests
N/A - entry point, no user-facing changes

## Documentation Requirements

### Code Documentation (JSDoc)
- [ ] File preamble - explain application purpose and configuration sources
- [ ] Validation section - explain what's validated and error handling
- [ ] Environment filtering - explain PLACEHOLDER handling
- [ ] Warning messages - explain what they mean and how to fix

### Database Comments
N/A - no database changes

### GraphQL Descriptions
N/A - no GraphQL changes

## Verification

### Type
`manual-check`

### Proof Command
```bash
npm run build && npx cdk synth --quiet 2>&1 | head -20
```

### Expected Output
CDK synthesizes successfully (or shows expected warnings about PLACEHOLDER accounts).

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

1. Create `test/bin/infrastructure.test.ts`
2. Write tests for entry point logic
3. Run tests to confirm they fail

Mark "Write failing tests" as completed.

### Step 3: Write Implementation
Mark "Write implementation" as in_progress.

Update `bin/infrastructure.ts` until tests pass.

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
