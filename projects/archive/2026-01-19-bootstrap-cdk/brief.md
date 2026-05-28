# Bootstrap CDK Infrastructure

## Original Request

> ~/workspace/geminisportsai/infrastructure-v2 is old and creates a lot of AWS resources that ~/workspace/your-project/backend doesn't need. In fact, the list of resources we need are here: /Users/cody/workspace/your-project/backend/aws-resources.md
>
> However, I like the way ~/workspace/geminisportsai/infrastructure-v2 is highly configurable with config files and also supports the three stages (dev, staging, production) that we need. However, it seems a bit too hardcoded. The environments should also be configurable where any stage environment with an AWS account ID and a name get created and setup. Now, there might be a difference between a stage environment (dev, pre-prod, build, staging, production) and a support account/environment (like logging, infrastructure, security, etc).

**Additional Requirements:**
- Enterprise-grade CloudWatch observability (alarms, dashboards, metrics)
- Account IDs will be provided later - code must work with placeholder values during development
- No centralized logging account needed
- Domains must be configurable with one designated as "primary", expandable/contractable without breaking deploys
- Cognito triggers handled by backend repo, not infrastructure
- Aurora must be serverless PostgreSQL with IAM auth, configurable capacity per environment

---

## Context

### Required AWS Resources (from aws-resources.md)

| Category | Resources |
|----------|-----------|
| **Database & Caching** | Aurora RDS (cluster, proxy, secrets), Valkey (cache endpoint) |
| **Authentication** | Cognito User Pool (client ID, triggers) |
| **Networking** | VPC (private subnets, security groups), API Gateway v2 (HTTP API, CORS) |
| **Monitoring** | X-Ray (tracing for Lambda and API Gateway) |
| **Security** | IAM Roles (SOC2 compliant statements) |
| **Observability** | CloudWatch (alarms, dashboards, metrics) - Enterprise grade |

### Existing infrastructure-v2 Patterns Worth Keeping

1. **Configuration Factory Pattern**: Type-safe config objects via factory functions
2. **Multi-Stage Pipeline**: Separate stages for network, app, security
3. **Account-per-Environment**: Blast radius isolation
4. **Feature Flags**: Conditional resource creation
5. **Cross-Stage Imports**: Clean dependency management between stages
6. **Aurora Pattern**: Serverless v2, RDS Proxy with IAM auth, read-only endpoint, CloudWatch alarms

### Problems with infrastructure-v2

1. **Hardcoded account IDs** in `shared-config.ts`
2. **Hardcoded environment list** (dev, staging, production only)
3. **Hardcoded Aurora capacity** (min: 2, max: 16 for all environments)
4. **Many unused resources** for your-project (Neptune, OpenSearch, TransferFamily, Amplify, etc.)
5. **No clear separation** between stage vs support account types
6. **Limited observability** - basic alarms only, no dashboards

---

## Proposed Architecture

### 1. Environment Type System

```typescript
type EnvironmentType = "stage" | "support";

interface StageEnvironment {
  type: "stage";
  name: string;                    // e.g., "dev", "staging", "production"
  accountId: string;               // Can be "PLACEHOLDER" during development
  region: string;
  features: StageFeatures;
  aurora: AuroraConfig;
  valkey: ValkeyConfig;
  observability: ObservabilityConfig;
}

interface SupportEnvironment {
  type: "support";
  name: string;                    // e.g., "shared"
  accountId: string;
  region: string;
  purpose: SupportPurpose;
}

interface AuroraConfig {
  minCapacity: number;             // 0.5 for dev, 2 for staging, 4 for prod
  maxCapacity: number;             // 2 for dev, 8 for staging, 64 for prod
  instanceCount: number;           // 1 for dev, 2 for staging/prod
  deletionProtection: boolean;
  backupRetentionDays: number;
  logRetentionDays: number;
}

interface ValkeyConfig {
  nodeType: string;                // "cache.t4g.micro" for dev, larger for prod
  numCacheNodes: number;
}

interface ObservabilityConfig {
  alarmEmailEndpoints: string[];   // SNS email subscribers
  dashboardEnabled: boolean;
  detailedMonitoring: boolean;     // Enhanced monitoring interval
  logRetentionDays: number;
}
```

### 2. Domain Configuration (Expandable/Contractable)

```typescript
interface DomainConfig {
  domains: Domain[];
}

interface Domain {
  name: string;                    // e.g., "example.com"
  isPrimary: boolean;              // Only one can be true
  environments: {
    [envName: string]: {           // "dev", "staging", "production"
      subdomain?: string;          // e.g., "dev" -> dev.example.com
      useApex?: boolean;           // true for production -> example.com
    };
  };
}
```

**Example domains.json:**
```json
{
  "domains": [
    {
      "name": "example.com",
      "isPrimary": true,
      "environments": {
        "dev": { "subdomain": "dev" },
        "staging": { "subdomain": "staging" },
        "production": { "useApex": true }
      }
    },
    {
      "name": "your-project.dev",
      "isPrimary": false,
      "environments": {
        "dev": { "useApex": true }
      }
    }
  ]
}
```

**Key Design**: Domains are optional. If no domains configured, stacks that depend on domains are skipped. Adding/removing domains doesn't break deploys - the pipeline adapts.

### 3. Configuration File Structure

```
infrastructure/
├── config/
│   ├── environments.json          # All environment definitions
│   ├── domains.json               # Domain configuration (optional)
│   ├── observability.json         # Alarm thresholds, dashboard config
│   └── README.md                  # Config documentation
├── lib/
│   ├── stacks/
│   │   ├── network/
│   │   │   ├── vpc-stack.ts
│   │   │   └── security-groups-stack.ts
│   │   ├── database/
│   │   │   ├── aurora-stack.ts
│   │   │   └── valkey-stack.ts
│   │   ├── auth/
│   │   │   └── cognito-stack.ts
│   │   ├── api/
│   │   │   └── api-gateway-stack.ts
│   │   ├── observability/
│   │   │   ├── alarms-stack.ts
│   │   │   ├── dashboard-stack.ts
│   │   │   └── sns-stack.ts
│   │   └── support/
│   │       └── dns-stack.ts
│   ├── stages/
│   │   ├── network-stage.ts
│   │   ├── app-stage.ts
│   │   ├── observability-stage.ts
│   │   └── support-stage.ts
│   ├── pipeline-stack.ts
│   └── types.ts
├── util/
│   ├── config-loader.ts
│   ├── cross-stage-imports.ts
│   └── validators.ts
└── bin/
    └── infrastructure.ts
```

### 4. environments.json Schema

```json
{
  "$schema": "./schemas/environments.schema.json",
  "stages": [
    {
      "name": "dev",
      "accountId": "PLACEHOLDER",
      "region": "us-east-1",
      "features": {
        "aurora": true,
        "valkey": true,
        "cognito": true,
        "apiGateway": true,
        "xray": true
      },
      "aurora": {
        "minCapacity": 0.5,
        "maxCapacity": 2,
        "instanceCount": 1,
        "deletionProtection": false,
        "backupRetentionDays": 1,
        "logRetentionDays": 3
      },
      "valkey": {
        "nodeType": "cache.t4g.micro",
        "numCacheNodes": 1
      },
      "observability": {
        "alarmEmailEndpoints": [],
        "dashboardEnabled": false,
        "detailedMonitoring": false,
        "logRetentionDays": 3
      }
    },
    {
      "name": "staging",
      "accountId": "PLACEHOLDER",
      "region": "us-east-1",
      "features": {
        "aurora": true,
        "valkey": true,
        "cognito": true,
        "apiGateway": true,
        "xray": true
      },
      "aurora": {
        "minCapacity": 1,
        "maxCapacity": 8,
        "instanceCount": 2,
        "deletionProtection": true,
        "backupRetentionDays": 7,
        "logRetentionDays": 30
      },
      "valkey": {
        "nodeType": "cache.t4g.small",
        "numCacheNodes": 2
      },
      "observability": {
        "alarmEmailEndpoints": ["alerts@example.com"],
        "dashboardEnabled": true,
        "detailedMonitoring": true,
        "logRetentionDays": 30
      }
    },
    {
      "name": "production",
      "accountId": "PLACEHOLDER",
      "region": "us-east-1",
      "features": {
        "aurora": true,
        "valkey": true,
        "cognito": true,
        "apiGateway": true,
        "xray": true
      },
      "aurora": {
        "minCapacity": 2,
        "maxCapacity": 64,
        "instanceCount": 2,
        "deletionProtection": true,
        "backupRetentionDays": 35,
        "logRetentionDays": 365
      },
      "valkey": {
        "nodeType": "cache.r7g.large",
        "numCacheNodes": 2
      },
      "observability": {
        "alarmEmailEndpoints": ["alerts@example.com", "oncall@example.com"],
        "dashboardEnabled": true,
        "detailedMonitoring": true,
        "logRetentionDays": 365
      }
    }
  ],
  "support": [
    {
      "name": "shared",
      "accountId": "PLACEHOLDER",
      "region": "us-east-1",
      "purpose": {
        "pipeline": true,
        "dns": true,
        "codeConnections": true
      }
    }
  ]
}
```

### 5. Enterprise Observability Architecture

```text
┌─────────────────────────────────────────────────────────────────────┐
│                    CloudWatch Observability Stack                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  SNS Topics                                                          │
│  ├── {stage}-critical-alarms     → PagerDuty/Email                  │
│  ├── {stage}-warning-alarms      → Email/Slack                      │
│  └── {stage}-info-alarms         → CloudWatch Logs                  │
│                                                                      │
│  CloudWatch Alarms                                                   │
│  ├── Aurora                                                          │
│  │   ├── CPUUtilization > 80% (warning), > 95% (critical)           │
│  │   ├── FreeableMemory < 1GB (warning), < 500MB (critical)         │
│  │   ├── DatabaseConnections > 80% max (warning)                    │
│  │   ├── ReadIOPS/WriteIOPS anomaly detection                       │
│  │   ├── ReplicationLag > 100ms (warning), > 1s (critical)          │
│  │   └── FreeLocalStorage < 10GB (critical)                         │
│  ├── Valkey                                                          │
│  │   ├── CPUUtilization > 80%                                       │
│  │   ├── CacheHitRate < 80%                                         │
│  │   ├── Evictions > 0 (warning)                                    │
│  │   ├── CurrConnections approaching max                            │
│  │   └── ReplicationLag > 100ms                                     │
│  ├── API Gateway                                                     │
│  │   ├── 5XXError rate > 1%                                         │
│  │   ├── 4XXError rate > 10%                                        │
│  │   ├── Latency p99 > 5s                                           │
│  │   ├── Count anomaly detection (traffic spike/drop)               │
│  │   └── IntegrationLatency > 10s                                   │
│  ├── Cognito                                                         │
│  │   ├── SignInSuccesses anomaly                                    │
│  │   ├── SignUpSuccesses anomaly                                    │
│  │   └── TokenRefreshSuccesses anomaly                              │
│  └── VPC                                                             │
│      ├── NAT Gateway ErrorPortAllocation                            │
│      └── NAT Gateway PacketsDropCount                               │
│                                                                      │
│  CloudWatch Dashboards                                               │
│  └── {stage}-infrastructure-dashboard                               │
│      ├── Aurora: Connections, CPU, Memory, IOPS, Latency            │
│      ├── Valkey: Hit Rate, Connections, Memory, CPU                 │
│      ├── API Gateway: Requests, Errors, Latency (p50/p95/p99)       │
│      ├── Cognito: Sign-ins, Sign-ups, Token Refreshes               │
│      └── VPC: NAT Gateway metrics, Data transfer                    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 6. observability.json Schema

```json
{
  "$schema": "./schemas/observability.schema.json",
  "alarmThresholds": {
    "aurora": {
      "cpuWarning": 80,
      "cpuCritical": 95,
      "memoryWarningMB": 1000,
      "memoryCriticalMB": 500,
      "connectionWarningPercent": 80,
      "replicationLagWarningMs": 100,
      "replicationLagCriticalMs": 1000,
      "freeStorageCriticalGB": 10
    },
    "valkey": {
      "cpuWarning": 80,
      "cacheHitRateWarning": 80,
      "evictionsWarning": 0
    },
    "apiGateway": {
      "error5xxPercent": 1,
      "error4xxPercent": 10,
      "latencyP99Ms": 5000,
      "integrationLatencyMs": 10000
    }
  },
  "dashboardWidgets": {
    "aurora": ["connections", "cpu", "memory", "iops", "latency"],
    "valkey": ["hitRate", "connections", "memory", "cpu"],
    "apiGateway": ["requests", "errors", "latency"],
    "cognito": ["signIns", "signUps", "tokenRefreshes"],
    "vpc": ["natGateway", "dataTransfer"]
  }
}
```

### 7. Pipeline Flow

```text
┌─────────────────────────────────────────────────────────────────┐
│                     Shared Account Pipeline                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Validation                                                   │
│     └── Validate config files, check account ID format           │
│                                                                  │
│  2. TrustPolicyStage (all accounts with valid IDs)              │
│     └── Configure CDK bootstrap trust relationships              │
│                                                                  │
│  3. SupportStage (shared account)                               │
│     ├── DnsStack (if domains configured)                        │
│     ├── CodeConnectionsStack                                     │
│     └── PipelineIamStack                                        │
│                                                                  │
│  4. For each stage environment (in order defined):              │
│     │                                                            │
│     ├── NetworkStage                                            │
│     │   ├── VpcStack                                            │
│     │   └── SecurityGroupsStack                                 │
│     │                                                            │
│     ├── AppStage                                                │
│     │   ├── AuroraStack (if features.aurora)                    │
│     │   │   └── Serverless v2, IAM auth, RDS Proxy              │
│     │   ├── ValkeyStack (if features.valkey)                    │
│     │   ├── CognitoStack (if features.cognito)                  │
│     │   │   └── User pool only, triggers handled by backend     │
│     │   ├── ApiGatewayStack (if features.apiGateway)            │
│     │   └── IamStack                                            │
│     │                                                            │
│     └── ObservabilityStage                                      │
│         ├── SnsStack (alarm topics)                             │
│         ├── AlarmsStack (all resource alarms)                   │
│         └── DashboardStack (if observability.dashboardEnabled)  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Tasks

### Phase 1: Configuration System

- [ ] Create `config/` directory structure
- [ ] Define TypeScript interfaces for all config types (`lib/types.ts`)
- [ ] Create JSON schemas for config validation (`config/schemas/`)
- [ ] Create `util/config-loader.ts` with runtime validation
- [ ] Create example config files with PLACEHOLDER account IDs
- [ ] Add config validation that allows PLACEHOLDER during synth but errors on deploy

### Phase 2: Network Stacks

- [ ] **VpcStack**: VPC with configurable CIDR, private/public subnets, NAT gateway
- [ ] **SecurityGroupsStack**: Security groups for Aurora, Valkey, Lambda, API Gateway

### Phase 3: Database Stacks

- [ ] **AuroraStack**:
  - Serverless v2 PostgreSQL with configurable min/max capacity
  - RDS Proxy with IAM authentication
  - Read-only proxy endpoint
  - Configurable deletion protection, backup retention
  - CloudWatch log exports with configurable retention
  - Basic alarms (CPU, memory, storage) - detailed alarms in ObservabilityStage
- [ ] **ValkeyStack**:
  - ElastiCache Valkey cluster with configurable node type/count
  - Subnet group, parameter group
  - Basic alarms

### Phase 4: Application Stacks

- [ ] **CognitoStack**: User pool with configurable settings (NO triggers - backend handles)
- [ ] **ApiGatewayStack**: HTTP API with CORS, X-Ray tracing, configurable throttling
- [ ] **IamStack**: SOC2-compliant IAM roles for Lambda with least-privilege policies

### Phase 5: Observability Stacks (Enterprise Grade)

- [ ] **SnsStack**:
  - Critical/warning/info alarm topics
  - Email subscriptions from config
  - Optional Slack/PagerDuty integration hooks
- [ ] **AlarmsStack**:
  - Comprehensive alarms for all resources (Aurora, Valkey, API Gateway, Cognito, VPC)
  - Configurable thresholds from `observability.json`
  - Anomaly detection for traffic patterns
  - Composite alarms for complex conditions
- [ ] **DashboardStack**:
  - Comprehensive CloudWatch dashboard per environment
  - Configurable widget selection
  - Auto-updating with stack outputs

### Phase 6: Support Infrastructure

- [ ] **DnsStack**: Route53 hosted zones for configured domains (in shared account)
- [ ] **PipelineStack**: CDK Pipeline with CodeConnections
- [ ] **TrustPolicyStack**: Bootstrap role trust relationships

### Phase 7: Stage Orchestration

- [ ] Create `NetworkStage` to orchestrate network stacks
- [ ] Create `AppStage` to orchestrate application stacks
- [ ] Create `ObservabilityStage` for monitoring resources
- [ ] Create `SupportStage` for shared account resources
- [ ] Wire up cross-stage imports utility
- [ ] Add feature flag conditionals to all stacks

### Phase 8: Entry Point and Validation

- [ ] Update `bin/infrastructure.ts` to use config loader
- [ ] Add environment validation (PLACEHOLDER allowed for synth, required for deploy)
- [ ] Add domain configuration validation (exactly one primary if domains exist)
- [ ] Create deployment documentation

---

## Key Design Decisions

### 1. JSON Configuration (not TypeScript)

**Rationale**: JSON files are easier to validate with schemas, can be generated by other tools, and don't require recompilation to change. TypeScript types are generated from JSON schemas.

### 2. PLACEHOLDER Account IDs

**Rationale**: Allows code to be written and `cdk synth` to run before real account IDs exist. Deployment will fail with clear error if PLACEHOLDERs remain.

### 3. Explicit Resource Configuration per Environment

**Rationale**: Rather than inferring Aurora capacity or Valkey size, each environment explicitly declares its configuration. This makes costs predictable and prevents over-provisioning dev environments.

### 4. Domains as Optional, Expandable Configuration

**Rationale**: Infrastructure should deploy without domains (for initial setup). Adding domains later should be a configuration change, not a code change. Removing a domain should not break other deployments.

### 5. Observability as Separate Stage

**Rationale**:
- Allows dashboard to reference all resource outputs
- Alarm configuration can be updated without redeploying app resources
- Clear separation of concerns

### 6. Backend Owns Cognito Triggers

**Rationale**: Lambda triggers are application logic, not infrastructure. Infrastructure provides the Cognito User Pool; backend deploys and configures trigger functions.

### 7. Aurora Serverless v2 with IAM Auth

**Rationale**:
- Serverless v2 scales to zero (cost savings for dev)
- IAM auth eliminates password rotation concerns
- RDS Proxy improves Lambda connection management
- Read-only endpoint enables read scaling

### 8. Enterprise Observability

**Rationale**:
- Critical for enterprise software - must know when things break before users report
- Tiered alerting (info/warning/critical) prevents alert fatigue
- Dashboards provide at-a-glance system health
- Anomaly detection catches issues that threshold alarms miss

---

## Success Criteria

1. **Configurable**: Adding a new environment requires only editing `environments.json`
2. **Type-Safe**: All configuration is validated at synth time
3. **Minimal**: Only resources in `aws-resources.md` are deployed
4. **Isolated**: Each stage environment is in its own AWS account
5. **Observable**: Comprehensive alarms and dashboards for all resources
6. **Flexible Domains**: Domains can be added/removed without breaking deploys
7. **Developable**: Code works with PLACEHOLDER account IDs during development
8. **Documented**: Clear documentation for adding environments, features, and domains
