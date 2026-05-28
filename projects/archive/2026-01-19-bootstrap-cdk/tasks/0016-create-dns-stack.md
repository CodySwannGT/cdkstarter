# Task: Create DNS Stack

**Type:** Task
**Parent:** None

## Description

Create the DnsStack that provisions Route53 hosted zones for configured domains. This stack runs in the shared account and creates hosted zones and ACM certificates for domain validation.

## Acceptance Criteria

- [ ] `lib/stacks/support/dns-stack.ts` creates DnsStack class
- [ ] Creates Route53 hosted zone for each configured domain
- [ ] Creates ACM certificate with DNS validation for each domain
- [ ] Handles wildcard certificates (*.domain.com)
- [ ] Stack only created if domains are configured
- [ ] Stack outputs: zone IDs, certificate ARNs per domain
- [ ] Unit tests verify hosted zone and certificate creation
- [ ] File passes TypeScript compilation and linting

## Relevant Research

From `research.md`:
- **DNS Stack** (`lib/dns-stack.ts:1-122`): Creates Route53 hosted zones per environment, ACM certificates with DNS validation, supports CNAME, A, TXT, MX, NS records
- Outputs zone ID and certificate ARN for cross-stack use

From `brief.md`:
- Domain Configuration (lines 100-141): Domain structure with environment mappings
- Key Design Decision #4: Domains as Optional, Expandable Configuration
- Support Infrastructure (line 485): DnsStack in shared account

## Applicable Skills

Invoke these skills before writing implementation code:

- `/coding-philosophy` - Always required for all code
- `/jsdoc-best-practices` - For documenting DNS setup and certificate validation

## Implementation Details

**File to create:** `lib/stacks/support/dns-stack.ts`

**Props interface:**
```typescript
interface DnsStackProps extends cdk.StackProps {
  readonly domainConfig: DomainConfig;
}
```

**Implementation:**
```typescript
// Create hosted zone and certificate for each domain
props.domainConfig.domains.forEach((domain, index) => {
  const zone = new route53.HostedZone(this, `Zone${index}`, {
    zoneName: domain.name,
    comment: `Hosted zone for ${domain.name}${domain.isPrimary ? " (primary)" : ""}`,
  });

  // Wildcard certificate with DNS validation
  const certificate = new acm.Certificate(this, `Certificate${index}`, {
    domainName: domain.name,
    subjectAlternativeNames: [`*.${domain.name}`],
    validation: acm.CertificateValidation.fromDns(zone),
  });

  // Export zone ID and certificate ARN
  new cdk.CfnOutput(this, `${domain.name.replace(/\./g, "-")}-zone-id`, {
    value: zone.hostedZoneId,
    exportName: `${domain.name.replace(/\./g, "-")}-zone-id`,
  });

  new cdk.CfnOutput(this, `${domain.name.replace(/\./g, "-")}-certificate-arn`, {
    value: certificate.certificateArn,
    exportName: `${domain.name.replace(/\./g, "-")}-certificate-arn`,
  });
});
```

**Outputs to export (per domain):**
- `{domain-name}-zone-id` (dots replaced with dashes)
- `{domain-name}-certificate-arn`

**Notes:**
- Certificate validation requires DNS records in the zone
- Wildcard certificate covers all subdomains (dev.domain.com, staging.domain.com, etc.)
- This stack should be deployed first before other stacks that need certificates

## Testing Requirements

### Unit Tests
- [ ] `describe('DnsStack')/it('should create hosted zone for each domain')`: Verify zone count
- [ ] `describe('DnsStack')/it('should create ACM certificate for each domain')`: Verify certificate
- [ ] `describe('DnsStack')/it('should include wildcard in certificate')`: Verify SANs
- [ ] `describe('DnsStack')/it('should export zone IDs and certificate ARNs')`: Verify outputs
- [ ] `describe('DnsStack')/it('should mark primary domain in zone comment')`: Verify comment

### Integration Tests
N/A - stack creation tested via unit tests with CDK assertions

### E2E Tests
N/A - infrastructure stack, no user-facing changes

## Documentation Requirements

### Code Documentation (JSDoc)
- [ ] File preamble - explain DNS setup in shared account
- [ ] `DnsStackProps` - document props
- [ ] `DnsStack` - explain why DNS is centralized in shared account
- [ ] Certificate section - explain wildcard usage and DNS validation

### Database Comments
N/A - no database changes

### GraphQL Descriptions
N/A - no GraphQL changes

## Verification

### Type
`test-coverage`

### Proof Command
```bash
npm run build && npm run test -- --testPathPattern="dns-stack" --coverage --collectCoverageFrom='lib/stacks/support/dns-stack.ts'
```

### Expected Output
All tests pass. Hosted zones and certificates created for all configured domains.

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

1. Create `test/stacks/support/dns-stack.test.ts`
2. Write tests using CDK assertions library
3. Run tests to confirm they fail (stack doesn't exist yet)

Mark "Write failing tests" as completed.

### Step 3: Write Implementation
Mark "Write implementation" as in_progress.

Create `lib/stacks/support/dns-stack.ts` until tests pass.

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
