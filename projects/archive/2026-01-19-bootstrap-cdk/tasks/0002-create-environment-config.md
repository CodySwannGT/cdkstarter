# Task: Create Environment Configuration

**Type:** Task
**Parent:** None

## Description

Create the typed environment configuration file that defines all stage environments (dev, staging, production) and support environments (shared). This configuration drives which AWS accounts receive deployments and their specific resource settings.

## Acceptance Criteria

- [ ] `config/environments.ts` exports typed stage and support environment arrays
- [ ] Three stage environments defined: dev, staging, production with PLACEHOLDER accountIds
- [ ] One support environment defined: shared with PLACEHOLDER accountId
- [ ] Each stage has appropriate aurora capacity settings (0.5-2 for dev, 1-8 for staging, 2-64 for production)
- [ ] Each stage has appropriate valkey settings (t4g.micro for dev, t4g.small for staging, r7g.large for production)
- [ ] Each stage has appropriate observability settings (disabled dashboard for dev, enabled for staging/production)
- [ ] Each stage has unique VPC CIDR configured
- [ ] All feature flags set to true for all stages
- [ ] Region set to us-east-1 for all environments
- [ ] File passes TypeScript compilation

## Relevant Research

From `research.md`:
- **Configuration Pattern** (`util/shared-config.ts:1-98`): Configuration factory pattern
- **Environment Configuration** (`util/environment-config.ts:1-158`): Per-environment settings including VPC IDs, feature toggles
- Per Q2 answer: Only deploy environments with valid accountIds (filter PLACEHOLDER during deploy)
- Per Q4 answer: VPC CIDRs must be unique - suggested pattern: 10.0.0.0/16, 10.1.0.0/16, 10.2.0.0/16

From `brief.md`:
- environments.json Schema (lines 189-297): Full example configuration structure
- Aurora capacity settings: 0.5-2 (dev), 1-8 (staging), 2-64 (production)
- Valkey settings: t4g.micro (dev), t4g.small (staging), r7g.large (production)

## Applicable Skills

Invoke these skills before writing implementation code:

- `/coding-philosophy` - Always required for all code
- `/jsdoc-best-practices` - For documenting configuration purpose

## Implementation Details

**File to create:** `config/environments.ts`

**Structure:**
```typescript
import { StageEnvironment, SupportEnvironment } from "../lib/types";

export const stageEnvironments: readonly StageEnvironment[] = [
  { name: "dev", accountId: "PLACEHOLDER", ... },
  { name: "staging", accountId: "PLACEHOLDER", ... },
  { name: "production", accountId: "PLACEHOLDER", ... },
] as const;

export const supportEnvironments: readonly SupportEnvironment[] = [
  { name: "shared", accountId: "PLACEHOLDER", ... },
] as const;
```

**VPC CIDR suggestions (document in JSDoc):**
- dev: 10.0.0.0/16 (65,536 IPs)
- staging: 10.1.0.0/16 (65,536 IPs)
- production: 10.2.0.0/16 (65,536 IPs)

**Environment-specific settings:**

| Setting | dev | staging | production |
|---------|-----|---------|------------|
| aurora.minCapacity | 0.5 | 1 | 2 |
| aurora.maxCapacity | 2 | 8 | 64 |
| aurora.instanceCount | 1 | 2 | 2 |
| aurora.deletionProtection | false | true | true |
| aurora.backupRetentionDays | 1 | 7 | 35 |
| valkey.nodeType | cache.t4g.micro | cache.t4g.small | cache.r7g.large |
| valkey.numCacheNodes | 1 | 2 | 2 |
| observability.dashboardEnabled | false | true | true |
| observability.detailedMonitoring | false | true | true |

## Testing Requirements

### Unit Tests
- [ ] `describe('environments')/it('should export stageEnvironments array')`: Verify array export
- [ ] `describe('environments')/it('should have unique VPC CIDRs for each stage')`: Verify CIDR uniqueness
- [ ] `describe('environments')/it('should have dev environment with low capacity')`: Verify dev settings
- [ ] `describe('environments')/it('should have production environment with high capacity')`: Verify prod settings
- [ ] `describe('environments')/it('should export supportEnvironments array')`: Verify support array

### Integration Tests
N/A - configuration file, no integration points

### E2E Tests
N/A - no user-facing changes

## Documentation Requirements

### Code Documentation (JSDoc)
- [ ] File preamble - explain this is the source of truth for environments
- [ ] `stageEnvironments` - explain the stage environment concept (isolated AWS accounts)
- [ ] `supportEnvironments` - explain shared account resources
- [ ] VPC CIDR section - explain uniqueness requirement and document suggested patterns

### Database Comments
N/A - no database changes

### GraphQL Descriptions
N/A - no GraphQL changes

## Verification

### Type
`test-coverage`

### Proof Command
```bash
npm run build && npm run test -- --testPathPattern="environments" --coverage --collectCoverageFrom='config/environments.ts'
```

### Expected Output
All tests pass. TypeScript compiles without errors. Coverage shows config file is imported.

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

1. Create `test/config/environments.test.ts`
2. Write tests that verify configuration structure and constraints
3. Run tests to confirm they fail (file doesn't exist yet)

Mark "Write failing tests" as completed.

### Step 3: Write Implementation
Mark "Write implementation" as in_progress.

Create `config/environments.ts` with all environment definitions until tests pass.

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
