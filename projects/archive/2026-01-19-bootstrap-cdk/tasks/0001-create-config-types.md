# Task: Create Configuration Types

**Type:** Task
**Parent:** None

## Description

Define TypeScript interfaces for all configuration types used throughout the CDK infrastructure. This establishes the type-safe foundation for the entire configuration system.

## Acceptance Criteria

- [ ] All configuration interfaces are defined in `lib/types.ts`
- [ ] StageEnvironment interface includes name, accountId, region, features, aurora, valkey, observability
- [ ] SupportEnvironment interface includes name, accountId, region, purpose
- [ ] AuroraConfig interface includes minCapacity, maxCapacity, instanceCount, deletionProtection, backupRetentionDays, logRetentionDays
- [ ] ValkeyConfig interface includes nodeType, numCacheNodes
- [ ] ObservabilityConfig interface includes alarmEmailEndpoints, dashboardEnabled, detailedMonitoring, logRetentionDays
- [ ] DomainConfig interface includes domains array with isPrimary marker
- [ ] NetworkConfig interface includes vpcCidr (with documentation about uniqueness requirement)
- [ ] All interfaces have JSDoc documentation explaining "why" not "what"
- [ ] Unit tests verify type structure (compile-time validation)

## Relevant Research

From `research.md`:
- **Type Definitions** (`lib/types.ts:1-31` in reference project): Stage union type, DomainConfig, DnsResult patterns
- Per Q1 answer: Use `.ts` files for type safety
- Per Q4 answer: VPC CIDRs must be configurable and unique per environment

From `brief.md`:
- Environment Type System (lines 56-98): Full interface definitions for StageEnvironment, SupportEnvironment, AuroraConfig, ValkeyConfig, ObservabilityConfig
- Domain Configuration (lines 100-141): DomainConfig and Domain interfaces

## Applicable Skills

Invoke these skills before writing implementation code:

- `/coding-philosophy` - Always required for all code
- `/jsdoc-best-practices` - For documenting interfaces with "why" explanations

## Implementation Details

**File to create:** `lib/types.ts`

**Interfaces to define:**
1. `EnvironmentType = "stage" | "support"`
2. `StageFeatures` - feature flags for aurora, valkey, cognito, xray
3. `AuroraConfig` - database capacity and settings
4. `ValkeyConfig` - cache node configuration
5. `ObservabilityConfig` - monitoring settings
6. `NetworkConfig` - VPC CIDR with uniqueness documentation
7. `StageEnvironment` - full stage environment definition
8. `SupportPurpose` - flags for pipeline, dns, codeConnections
9. `SupportEnvironment` - shared account definition
10. `Domain` - single domain with environments mapping
11. `DomainConfig` - domains array wrapper
12. `AlarmThresholds` - configurable alarm thresholds for aurora, valkey
13. `DashboardWidgets` - widget configuration per resource type

**JSDoc requirements:**
- File preamble explaining the configuration type system
- Each interface should explain WHY it exists (not just what it contains)
- NetworkConfig.vpcCidr should document the uniqueness requirement and suggest CIDR patterns

## Testing Requirements

### Unit Tests
- [ ] `describe('types')/it('should export all required interfaces')`: Verify imports work
- [ ] Types are validated at compile time - create a test file that imports and uses all types

### Integration Tests
N/A - no integration points for pure type definitions

### E2E Tests
N/A - no user-facing changes

## Documentation Requirements

### Code Documentation (JSDoc)
- [ ] File preamble - explain the configuration type system purpose
- [ ] `StageEnvironment` - explain account isolation strategy
- [ ] `NetworkConfig.vpcCidr` - document uniqueness requirement with suggested patterns (10.0.0.0/16, 10.1.0.0/16, etc.)
- [ ] `AuroraConfig` - explain capacity unit meanings
- [ ] `SupportEnvironment` - explain shared account purpose

### Database Comments
N/A - no database changes

### GraphQL Descriptions
N/A - no GraphQL changes

## Verification

### Type
`test-coverage`

### Proof Command
```bash
npm run build && npm run test -- --testPathPattern="types" --coverage --collectCoverageFrom='lib/types.ts'
```

### Expected Output
All type definitions compile without errors. Test imports succeed.

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

1. Create `test/types.test.ts`
2. Write tests that import all types and verify structure
3. Run tests to confirm they fail (file doesn't exist yet)

Mark "Write failing tests" as completed.

### Step 3: Write Implementation
Mark "Write implementation" as in_progress.

Create `lib/types.ts` with all interfaces until tests pass.

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
