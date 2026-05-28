# Task: Add Configuration Validation

**Type:** Task
**Parent:** None

## Description

Enhance the configuration validation to ensure unique VPC CIDRs across environments and exactly one primary domain when domains are configured. This validation runs during `cdk synth`.

## Acceptance Criteria

- [ ] Validation checks that all VPC CIDRs are unique across stage environments
- [ ] Validation checks that exactly one domain has isPrimary=true (if domains exist)
- [ ] Validation allows empty domains array (no validation needed)
- [ ] Clear error messages indicate which CIDRs or domains have conflicts
- [ ] Validation integrated into config-loader's validateConfiguration()
- [ ] Unit tests cover all validation scenarios
- [ ] File passes TypeScript compilation and linting

## Relevant Research

From `research.md`:
- Per Q4 answer: VPC CIDRs must be configurable and unique per environment

From `brief.md`:
- Configuration validation (line 502): Domain configuration validation (exactly one primary if domains exist)
- VPC CIDR uniqueness: Two environments cannot have the same CIDR block

## Applicable Skills

Invoke these skills before writing implementation code:

- `/coding-philosophy` - Always required for all code
- `/jsdoc-best-practices` - For documenting validation rules

## Implementation Details

**File to update:** `util/config-loader.ts`

**Validation functions to add:**

```typescript
/**
 * Validates that all VPC CIDRs are unique across environments.
 * Throws ConfigurationError if duplicates found.
 */
const validateUniqueCidrs = (environments: readonly StageEnvironment[]): void => {
  const cidrs = new Map<string, string[]>();

  environments.forEach(env => {
    const cidr = env.network.vpcCidr;
    const existing = cidrs.get(cidr) ?? [];
    existing.push(env.name);
    cidrs.set(cidr, existing);
  });

  const duplicates = Array.from(cidrs.entries())
    .filter(([, envs]) => envs.length > 1);

  if (duplicates.length > 0) {
    const details = duplicates
      .map(([cidr, envs]) => `  - ${cidr}: used by ${envs.join(", ")}`)
      .join("\n");
    throw new ConfigurationError(
      `Duplicate VPC CIDRs found:\n${details}\n\n` +
      "Each environment must have a unique CIDR block to enable VPC peering."
    );
  }
};

/**
 * Validates that exactly one domain is marked as primary (if any domains exist).
 * Throws ConfigurationError if validation fails.
 */
const validatePrimaryDomain = (domains: readonly Domain[]): void => {
  if (domains.length === 0) {
    return; // No domains configured - valid
  }

  const primaryDomains = domains.filter(d => d.isPrimary);

  if (primaryDomains.length === 0) {
    throw new ConfigurationError(
      "No primary domain configured. " +
      "When domains are configured, exactly one must have isPrimary: true."
    );
  }

  if (primaryDomains.length > 1) {
    const names = primaryDomains.map(d => d.name).join(", ");
    throw new ConfigurationError(
      `Multiple primary domains found: ${names}\n` +
      "Exactly one domain must have isPrimary: true."
    );
  }
};

/**
 * Validates all configuration.
 */
export const validateConfiguration = (): void => {
  const environments = getAllStageEnvironments();
  const domains = getDomainConfig().domains;

  validateUniqueCidrs(environments);
  validatePrimaryDomain(domains);
};
```

**Error message guidelines:**
- State what's wrong
- List the specific conflicts
- Explain why it matters
- Suggest how to fix

## Testing Requirements

### Unit Tests
- [ ] `describe('validateUniqueCidrs')/it('should pass with unique CIDRs')`: Happy path
- [ ] `describe('validateUniqueCidrs')/it('should throw on duplicate CIDRs')`: Error case
- [ ] `describe('validateUniqueCidrs')/it('should list all duplicates in error')`: Error detail
- [ ] `describe('validatePrimaryDomain')/it('should pass with no domains')`: Edge case
- [ ] `describe('validatePrimaryDomain')/it('should pass with one primary')`: Happy path
- [ ] `describe('validatePrimaryDomain')/it('should throw on no primary')`: Error case
- [ ] `describe('validatePrimaryDomain')/it('should throw on multiple primaries')`: Error case

### Integration Tests
N/A - validation logic tested via unit tests

### E2E Tests
N/A - configuration validation, no user-facing changes

## Documentation Requirements

### Code Documentation (JSDoc)
- [ ] `validateUniqueCidrs` - document validation rule and why CIDRs must be unique
- [ ] `validatePrimaryDomain` - document validation rule and primary domain purpose
- [ ] `ConfigurationError` - document when it's thrown

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
All tests pass including validation error cases.

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

1. Add validation tests to `test/util/config-loader.test.ts`
2. Write tests for CIDR and domain validation
3. Run tests to confirm they fail (validation not implemented yet)

Mark "Write failing tests" as completed.

### Step 3: Write Implementation
Mark "Write implementation" as in_progress.

Add validation functions to `util/config-loader.ts` until tests pass.

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
