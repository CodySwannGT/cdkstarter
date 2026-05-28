# Task: Create Domain Configuration

**Type:** Task
**Parent:** None

## Description

Create the typed domain configuration file that defines all domains for the infrastructure. Domains are optional - if none are configured, DNS-dependent stacks are skipped. One domain must be marked as primary.

## Acceptance Criteria

- [ ] `config/domains.ts` exports typed domain configuration
- [ ] Example domain configured (e.g., example.com) with isPrimary: true
- [ ] Domain has environment mappings (dev subdomain, staging subdomain, production apex)
- [ ] Configuration is readonly/immutable
- [ ] Exports helper function to get primary domain
- [ ] File passes TypeScript compilation

## Relevant Research

From `research.md`:
- **DNS Stack** (`lib/dns-stack.ts:1-122`): Creates Route53 hosted zones per environment, ACM certificates with DNS validation
- Key Design: Domains are optional, adding/removing domains doesn't break deploys

From `brief.md`:
- Domain Configuration (lines 100-141): DomainConfig and Domain interfaces
- Example domains.json (lines 119-141): Shows structure with primary domain and environment mappings
- Key Design Decision #4: Domains as Optional, Expandable Configuration

## Applicable Skills

Invoke these skills before writing implementation code:

- `/coding-philosophy` - Always required for all code
- `/jsdoc-best-practices` - For documenting domain configuration purpose

## Implementation Details

**File to create:** `config/domains.ts`

**Structure:**
```typescript
import { DomainConfig, Domain } from "../lib/types";

export const domainConfig: DomainConfig = {
  domains: [
    {
      name: "example.com",
      isPrimary: true,
      environments: {
        dev: { subdomain: "dev" },
        staging: { subdomain: "staging" },
        production: { useApex: true },
      },
    },
  ],
} as const;

/** Returns the primary domain, or undefined if no domains configured */
export const getPrimaryDomain = (): Domain | undefined =>
  domainConfig.domains.find(d => d.isPrimary);

/** Returns true if any domains are configured */
export const hasDomainsConfigured = (): boolean =>
  domainConfig.domains.length > 0;
```

**Domain environment mapping explanation:**
- `subdomain: "dev"` -> Creates dev.example.com
- `useApex: true` -> Uses example.com directly (no subdomain)

## Testing Requirements

### Unit Tests
- [ ] `describe('domains')/it('should export domainConfig')`: Verify export exists
- [ ] `describe('domains')/it('should have exactly one primary domain')`: Verify isPrimary constraint
- [ ] `describe('domains')/it('getPrimaryDomain should return the primary domain')`: Verify helper
- [ ] `describe('domains')/it('hasDomainsConfigured should return true when domains exist')`: Verify helper

### Integration Tests
N/A - configuration file, no integration points

### E2E Tests
N/A - no user-facing changes

## Documentation Requirements

### Code Documentation (JSDoc)
- [ ] File preamble - explain domain configuration is optional and expandable
- [ ] `domainConfig` - explain the structure and environment mapping concept
- [ ] `getPrimaryDomain` - explain why primary domain matters (for main certificate, etc.)
- [ ] `hasDomainsConfigured` - explain this is used to skip DNS stacks when no domains

### Database Comments
N/A - no database changes

### GraphQL Descriptions
N/A - no GraphQL changes

## Verification

### Type
`test-coverage`

### Proof Command
```bash
npm run build && npm run test -- --testPathPattern="domains" --coverage --collectCoverageFrom='config/domains.ts'
```

### Expected Output
All tests pass. TypeScript compiles without errors.

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

1. Create `test/config/domains.test.ts`
2. Write tests that verify domain configuration and helpers
3. Run tests to confirm they fail (file doesn't exist yet)

Mark "Write failing tests" as completed.

### Step 3: Write Implementation
Mark "Write implementation" as in_progress.

Create `config/domains.ts` with domain configuration until tests pass.

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
