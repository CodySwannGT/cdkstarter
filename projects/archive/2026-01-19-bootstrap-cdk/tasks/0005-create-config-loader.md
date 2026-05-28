# Task: Create Configuration Loader

**Type:** Task
**Parent:** None

## Description

Create the configuration loader utility that provides access to all configuration with validation. The loader filters out environments with PLACEHOLDER account IDs during deploy while allowing them during synth.

## Acceptance Criteria

- [ ] `util/config-loader.ts` exports functions to load all configuration
- [ ] `getDeployableStageEnvironments()` filters out PLACEHOLDER accountIds
- [ ] `getAllStageEnvironments()` returns all environments (including PLACEHOLDER for synth)
- [ ] `getSupportEnvironments()` returns support environments
- [ ] `validateConfiguration()` checks for unique VPC CIDRs and exactly one primary domain
- [ ] `getObservabilityConfig()` returns alarm thresholds and dashboard widgets
- [ ] `getDomainConfig()` returns domain configuration
- [ ] All functions have proper TypeScript return types
- [ ] File passes TypeScript compilation

## Relevant Research

From `research.md`:
- **Configuration Pattern** (`util/shared-config.ts:1-98`): Configuration factory function returning typed object
- Per Q2 answer: Only deploy environments with valid accountIds - filter PLACEHOLDER during deploy
- Per Q4 answer: VPC CIDRs must be unique per environment

From `brief.md`:
- Configuration File Structure (lines 145-185): Shows config/ directory organization
- PLACEHOLDER Account IDs decision (lines 509-511): Allows synth before real account IDs exist

## Applicable Skills

Invoke these skills before writing implementation code:

- `/coding-philosophy` - Always required for all code
- `/jsdoc-best-practices` - For documenting loader function purposes

## Implementation Details

**File to create:** `util/config-loader.ts`

**Functions to implement:**

```typescript
/** Returns all stage environments including PLACEHOLDER (for synth) */
export const getAllStageEnvironments = (): readonly StageEnvironment[] => { ... };

/** Returns only deployable environments (excludes PLACEHOLDER accountIds) */
export const getDeployableStageEnvironments = (): readonly StageEnvironment[] => { ... };

/** Returns support environments */
export const getSupportEnvironments = (): readonly SupportEnvironment[] => { ... };

/** Returns the deployable shared environment, or undefined if PLACEHOLDER */
export const getDeployableSharedEnvironment = (): SupportEnvironment | undefined => { ... };

/** Returns domain configuration */
export const getDomainConfig = (): DomainConfig => { ... };

/** Returns observability alarm thresholds */
export const getAlarmThresholds = (): AlarmThresholds => { ... };

/** Returns dashboard widget configuration */
export const getDashboardWidgets = (): DashboardWidgets => { ... };

/**
 * Validates all configuration:
 * - VPC CIDRs must be unique across all environments
 * - If domains configured, exactly one must be primary
 * Throws ConfigurationError if invalid
 */
export const validateConfiguration = (): void => { ... };

/** Custom error class for configuration validation failures */
export class ConfigurationError extends Error { ... }
```

**Validation logic:**
1. Collect all VPC CIDRs from stage environments
2. Check for duplicates using Set
3. If domains exist, count isPrimary=true (must be exactly 1)
4. Throw ConfigurationError with descriptive message on failure

## Testing Requirements

### Unit Tests
- [ ] `describe('config-loader')/it('getAllStageEnvironments should return all environments')`: Include PLACEHOLDER
- [ ] `describe('config-loader')/it('getDeployableStageEnvironments should filter PLACEHOLDER')`: Exclude PLACEHOLDER
- [ ] `describe('config-loader')/it('validateConfiguration should pass with valid config')`: Happy path
- [ ] `describe('config-loader')/it('validateConfiguration should throw on duplicate CIDRs')`: Error case
- [ ] `describe('config-loader')/it('validateConfiguration should throw on multiple primary domains')`: Error case
- [ ] `describe('config-loader')/it('validateConfiguration should pass with no domains')`: Edge case

### Integration Tests
N/A - utility file, no external integration points

### E2E Tests
N/A - no user-facing changes

## Documentation Requirements

### Code Documentation (JSDoc)
- [ ] File preamble - explain configuration loader purpose and validation
- [ ] `getAllStageEnvironments` - explain when to use (synth time)
- [ ] `getDeployableStageEnvironments` - explain when to use (deploy time)
- [ ] `validateConfiguration` - document all validation rules
- [ ] `ConfigurationError` - explain it's thrown on validation failure

### Database Comments
N/A - no database changes

### GraphQL Descriptions
N/A - no GraphQL changes

## Verification

### Type
`test-coverage`

### Proof Command
```bash
npm run build && npm run test -- --testPathPattern="config-loader" --coverage --collectCoverageFrom='util/config-loader.ts'
```

### Expected Output
All tests pass including validation error cases. TypeScript compiles without errors.

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

1. Create `test/util/config-loader.test.ts`
2. Write tests for all loader functions and validation
3. Run tests to confirm they fail (file doesn't exist yet)

Mark "Write failing tests" as completed.

### Step 3: Write Implementation
Mark "Write implementation" as in_progress.

Create `util/config-loader.ts` with all functions until tests pass.

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
