# Configuration Guide

This directory contains all configuration for the cdkstarter infrastructure.

## Quick Start

1. Update account IDs in `environments.ts` (or leave as PLACEHOLDER for development)
2. Run `npm run build` to verify TypeScript compilation
3. Run `npx cdk synth` to verify configuration and generate CloudFormation
4. Run `npx cdk deploy` when ready to deploy

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
  type: "stage",
  name: "qa",
  accountId: "PLACEHOLDER", // Replace with real account ID
  region: "us-east-1",
  features: {
    aurora: true,
    valkey: true,
    cognito: true,
    xray: true,
  },
  aurora: {
    minCapacity: 0.5,
    maxCapacity: 4,
    instanceCount: 1,
    deletionProtection: false,
    backupRetentionDays: 3,
    logRetentionDays: 7,
  },
  valkey: {
    nodeType: "cache.t4g.small",
    numCacheNodes: 1,
  },
  network: {
    vpcCidr: "10.3.0.0/16", // Must be unique!
  },
  observability: {
    alarmEmailEndpoints: ["qa-alerts@yourcompany.com"],
    dashboardEnabled: true,
    detailedMonitoring: false,
    logRetentionDays: 7,
  },
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

- Enables VPC peering between environments if needed
- Prevents routing conflicts
- Required for certain AWS networking features

The configuration loader validates CIDR uniqueness and will fail synth if duplicates are found.

## Domain Configuration

Domains are optional. If no domains are configured, DNS stacks are skipped entirely.

### Adding a Domain

1. Add entry to `domains` array in `domains.ts`
2. Set `isPrimary: true` for exactly one domain
3. Configure environment mappings (subdomain or apex)

### Example

```typescript
{
  name: "example.com",
  isPrimary: true,
  environments: {
    dev: { subdomain: "dev" },      // dev.example.com
    staging: { subdomain: "staging" }, // staging.example.com
    production: { useApex: true },   // example.com (root domain)
  },
}
```

### Multiple Domains

You can configure multiple domains (e.g., for vanity URLs):

```typescript
domains: [
  {
    name: "example.com",
    isPrimary: true,
    environments: { ... },
  },
  {
    name: "cdkstarter.com",
    isPrimary: false, // Only one domain can be primary
    environments: { ... },
  },
]
```

## PLACEHOLDER Account IDs

During development, use "PLACEHOLDER" for account IDs:

- `cdk synth` works with PLACEHOLDER values (for template verification)
- `cdk deploy` filters out PLACEHOLDER environments (won't attempt deployment)
- Warnings are shown for environments with PLACEHOLDER values

### Workflow

1. Start with all PLACEHOLDERs for development
2. Create AWS accounts using AWS Organizations
3. Bootstrap each account: `cdk bootstrap aws://{accountId}/{region}`
4. Replace PLACEHOLDERs with real account IDs
5. For cross-account deployment, bootstrap with trust:
   ```bash
   cdk bootstrap aws://{targetAccountId}/{region} \
     --trust {pipelineAccountId} \
     --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
   ```
6. Deploy

## Observability Configuration

Configure alarm thresholds in `observability.ts`.

### Aurora Thresholds

| Metric | Warning | Critical | Notes |
|--------|---------|----------|-------|
| CPU | 80% | 95% | Consider scaling at warning |
| Freeable Memory | 1000 MB | 500 MB | OOM risk at critical |
| Connections | 80% | N/A | Connection pooling issue |
| Replication Lag | 100 ms | 1000 ms | Data consistency at risk |
| Free Storage | N/A | 10 GB | Write failures imminent |

### Valkey Thresholds

| Metric | Warning | Notes |
|--------|---------|-------|
| CPU | 70% | Cache performance degrading |
| Cache Hit Rate | 80% | Ineffective caching |
| Evictions | 1 | Memory pressure detected |

### Dashboard Widgets

Configure which widgets appear on the CloudWatch dashboard in the `dashboardWidgets` section:

```typescript
dashboardWidgets: {
  aurora: ["connections", "cpu", "memory", "iops", "latency"],
  valkey: ["hitRate", "connections", "memory", "cpu"],
  cognito: ["signIns", "signUps", "tokenRefreshes"],
  vpc: ["natGateway", "dataTransfer"],
}
```

## Feature Flags

Each environment has feature flags controlling which resources are created:

| Feature | Description | Cost Impact |
|---------|-------------|-------------|
| `aurora` | Aurora PostgreSQL Serverless v2 | High |
| `valkey` | ElastiCache Valkey cluster | Medium |
| `cognito` | Cognito User Pool | Low |
| `xray` | X-Ray distributed tracing | Low |

Disable features in development to reduce costs:

```typescript
features: {
  aurora: true,
  valkey: false, // Disable cache in dev
  cognito: true,
  xray: false,   // Disable tracing in dev
}
```

## Troubleshooting

### "Duplicate VPC CIDRs found"

Each environment must have a unique CIDR. Check `environments.ts` and update the conflicting CIDRs.

### "No primary domain configured"

When domains are configured, exactly one must have `isPrimary: true`. Update `domains.ts`.

### "Configuration Error: environments.ts"

Check the error message for specific validation failures. Common issues:

- Missing required fields
- Invalid CIDR format
- Invalid account ID format

### Pipeline cannot deploy to target account

1. Verify the target account is bootstrapped
2. Verify the bootstrap includes `--trust {pipelineAccountId}`
3. Check IAM permissions in the target account

## Type Safety

All configuration files are TypeScript for compile-time validation. The types are defined in `lib/types.ts`.

If you add a new field, update the type definition first, then the configuration files.
