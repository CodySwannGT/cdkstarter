# Task: Create Deployment Documentation

**Type:** Task
**Parent:** None

## Description

Create comprehensive documentation for the configuration system, explaining how to add environments, configure domains, and deploy the infrastructure.

## Acceptance Criteria

- [ ] `config/README.md` created with configuration documentation
- [ ] Documents how to add a new environment
- [ ] Documents how to add/remove domains
- [ ] Documents PLACEHOLDER account ID workflow
- [ ] Documents VPC CIDR selection guidance
- [ ] Documents observability configuration options
- [ ] Includes example configurations
- [ ] File passes markdown linting

## Relevant Research

From `research.md`:
- **Documentation Patterns** (lines 229-242): JSDoc conventions, inline comments, IMPORTANT/TODO/NOTE prefixes

From `brief.md`:
- Success Criteria #8: Clear documentation for adding environments, features, and domains
- Configuration File Structure (lines 145-154): config/ directory with README.md

## Applicable Skills

Invoke these skills before writing implementation code:

- `/jsdoc-best-practices` - For documentation style

## Implementation Details

**File to create:** `config/README.md`

**Content structure:**

```markdown
# Configuration Guide

This directory contains all configuration for the your-project infrastructure.

## Quick Start

1. Copy `environments.example.ts` to `environments.ts`
2. Update account IDs (or leave as PLACEHOLDER for development)
3. Run `npx cdk synth` to verify configuration
4. Run `npx cdk deploy` when ready

## Configuration Files

| File | Purpose |
|------|---------|
| `environments.ts` | AWS account and environment definitions |
| `domains.ts` | Domain and DNS configuration |
| `observability.ts` | Alarm thresholds and dashboard widgets |

## Adding a New Environment

1. Add entry to `stageEnvironments` array in `environments.ts`
2. Configure VPC CIDR (must be unique - see CIDR guidance below)
3. Set feature flags for required resources
4. Configure Aurora and Valkey capacity
5. Configure observability settings
6. Run `npx cdk synth` to validate

### Example: Adding a QA Environment

```typescript
{
  name: "qa",
  accountId: "PLACEHOLDER", // Replace with real account ID
  region: "us-east-1",
  features: { aurora: true, valkey: true, cognito: true, xray: true },
  network: { vpcCidr: "10.3.0.0/16" }, // Unique CIDR
  aurora: { minCapacity: 0.5, maxCapacity: 2, ... },
  ...
}
```

## VPC CIDR Selection

Each environment needs a unique /16 CIDR block. Recommended pattern:

| Environment | CIDR Block | IP Range |
|-------------|------------|----------|
| dev | 10.0.0.0/16 | 10.0.0.0 - 10.0.255.255 |
| staging | 10.1.0.0/16 | 10.1.0.0 - 10.1.255.255 |
| production | 10.2.0.0/16 | 10.2.0.0 - 10.2.255.255 |
| qa | 10.3.0.0/16 | 10.3.0.0 - 10.3.255.255 |

**Why unique CIDRs?**
- Enables VPC peering between environments
- Prevents routing conflicts
- Required for certain AWS networking features

## Domain Configuration

Domains are optional. If no domains are configured, DNS stacks are skipped.

### Adding a Domain

1. Add entry to `domains` array in `domains.ts`
2. Set `isPrimary: true` for exactly one domain
3. Configure environment mappings

### Example

```typescript
{
  name: "example.com",
  isPrimary: true,
  environments: {
    dev: { subdomain: "dev" },      // dev.example.com
    staging: { subdomain: "staging" }, // staging.example.com
    production: { useApex: true },   // example.com
  },
}
```

## PLACEHOLDER Account IDs

During development, use "PLACEHOLDER" for account IDs:

- `cdk synth` works with PLACEHOLDER values
- `cdk deploy` filters out PLACEHOLDER environments
- Warnings are shown for missing configurations

### Workflow

1. Start with all PLACEHOLDERs
2. Create AWS accounts
3. Replace PLACEHOLDERs with real account IDs
4. Deploy

## Observability Configuration

Configure alarm thresholds in `observability.ts`:

### Aurora Thresholds

| Metric | Warning | Critical | Notes |
|--------|---------|----------|-------|
| CPU | 80% | 95% | Scale consideration at warning |
| Memory | 1000 MB | 500 MB | OOM risk at critical |
| Replication Lag | 100 ms | 1000 ms | Data consistency at risk |

### Dashboard Widgets

Configure which widgets appear on the CloudWatch dashboard.

## Troubleshooting

### "Duplicate VPC CIDRs found"

Each environment must have a unique CIDR. Update the conflicting CIDRs.

### "No primary domain configured"

When domains are configured, exactly one must have `isPrimary: true`.

### "Configuration Error"

Check the error message for specific validation failures.
```

## Testing Requirements

### Unit Tests
N/A - documentation file

### Integration Tests
N/A - documentation file

### E2E Tests
N/A - documentation file

## Documentation Requirements

### Code Documentation (JSDoc)
N/A - this IS the documentation

### Database Comments
N/A - no database changes

### GraphQL Descriptions
N/A - no GraphQL changes

## Verification

### Type
`documentation`

### Proof Command
```bash
cat /Users/cody/workspace/your-project/infrastructure/config/README.md | head -50
```

### Expected Output
Documentation file exists with configuration guide content.

## Implementation Steps

### Step 0: Setup Tracking
Use TodoWrite to create task tracking todos:
- Invoke skills
- Write documentation
- Verify documentation
- Commit changes

### Step 1: Invoke Skills
Mark "Invoke skills" as in_progress.

1. Mark this task as "in progress" in `progress.md`
2. Invoke `/jsdoc-best-practices` for documentation style

Mark "Invoke skills" as completed.

### Step 2: Write Documentation
Mark "Write documentation" as in_progress.

Create `config/README.md` with comprehensive configuration guide.

Mark "Write documentation" as completed.

### Step 3: Verify Documentation
Mark "Verify documentation" as in_progress.

1. Run the Proof Command from Verification section
2. Confirm documentation is comprehensive and clear
3. If verification fails, improve and re-verify

Mark "Verify documentation" as completed.

### Step 4: Commit Changes
Mark "Commit changes" as in_progress.

1. Run `/git:commit`
2. Mark this task as "completed" in `progress.md`
3. Record any learnings in `findings.md`

Mark "Commit changes" as completed.
