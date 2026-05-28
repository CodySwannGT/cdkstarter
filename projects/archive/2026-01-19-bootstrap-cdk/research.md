---
date: 2026-01-19T13:48:36Z
status: complete
last_updated: 2026-01-19
---

# Research: Bootstrap CDK Infrastructure

## Integration

`~/workspace/cdkstarter/backend/docker-compose.yml` will consume the exports from this project. Make sure to review the import/export names expected and match them in this repo.

## Summary

This research documents the existing codebase patterns and external resources needed to implement a configurable CDK infrastructure for the cdkstarter project. The implementation will create a new infrastructure setup inspired by `geminisportsai/infrastructure-v2` patterns but with JSON-based configuration, dynamic environment support, and enterprise-grade observability.

**Key findings:**
- The cdkstarter/infrastructure project exists but is mostly empty (only a placeholder entry point)
- The geminisportsai/infrastructure-v2 project provides comprehensive patterns for Aurora, ElastiCache, Cognito, VPC, security groups, pipeline stages, and cross-stage imports
- AWS CDK supports Aurora Serverless v2 via `DatabaseCluster` (not `ServerlessCluster`)
- ElastiCache Valkey support is available via L1 constructs (`CfnReplicationGroup`) or newer L2 alpha constructs
- Enterprise observability with CloudWatch dashboards and composite alarms is well-supported in CDK

## Detailed Findings

### Current State of cdkstarter/infrastructure

The target codebase is essentially empty with only infrastructure scaffolding:

- **Entry point**: `bin/infrastructure.ts:1-16` - A placeholder file with comments pointing to the spec
- **No lib directory**: No stacks, stages, or utilities exist yet
- **Dependencies**: `aws-cdk-lib 2.235.0`, `constructs ^10.4.5`, `aws-cdk-github-oidc ^2.4.1`, `@aws-cdk/aws-amplify-alpha`
- **Testing**: Jest is configured in `package.json` but no test files exist (tests would go in a `test/` directory)

### Reference Architecture in geminisportsai/infrastructure-v2

The reference project provides proven patterns for multi-account AWS infrastructure:

#### Configuration Pattern (`util/shared-config.ts:1-98`)
- Configuration factory function returning a typed object
- Contains account IDs, domain configs, feature flags, and GitHub connection details
- **Problem identified in brief**: Account IDs are hardcoded, not configurable via JSON

#### Environment Configuration (`util/environment-config.ts:1-158`)
- Per-environment settings including VPC IDs, certificate ARNs, database settings
- Supports feature toggles per environment (transferFamily, mcp)
- **Problem identified in brief**: Environment list is hardcoded (dev, staging, production only)

#### Cross-Stage Imports (`util/cross-stage-imports.ts:1-57`)
- Uses `cdk.Fn.importValue()` for cross-stack references
- Imports VPC, security groups from network stacks for use in app stacks
- Pattern can be reused directly

#### Pipeline Structure (`lib/pipeline-stack.ts:1-199`)
- Uses `CodePipeline` from `aws-cdk-lib/pipelines`
- `CodePipelineSource.connection()` for GitHub integration via AWS CodeConnections
- Stages deployed in order: TrustPolicy -> Shared -> (Network -> App -> Security per env)
- Cross-account deployment with `crossAccountKeys: true`

### Stack Patterns to Reuse

#### VPC Stack (`lib/infrastructure-stack.ts:1-149`)
- Creates VPC with configurable CIDR per environment
- Subnet configuration: public (ingress), private with egress (application), private isolated (data)
- NAT gateways: 2 for production, 1 for non-prod
- Flow logs enabled for production/staging
- Outputs: vpcId, subnet IDs, route table IDs, availability zones

#### Security Groups (`lib/security-group-stack.ts:1-161`)
- Creates: cluster SG, lambda SG, VPN SG, Redis SG, transfer family SG, codebuild SG
- Ingress rules configured for database access, VPN connectivity
- Outputs security group IDs for cross-stack reference

#### Aurora Stack (`lib/aurora-stack.ts:1-246`)
- Uses `rds.DatabaseCluster` with `instanceType: new ec2.InstanceType("serverless")`
- Serverless v2 configuration via L1 escape hatch:
  ```typescript
  const clusterCfnConfig = cluster.node.findChild("Resource") as rds.CfnDBCluster;
  clusterCfnConfig.serverlessV2ScalingConfiguration = {
    minCapacity: 2,
    maxCapacity: 16,
  };
  ```
- RDS Proxy with IAM authentication: `cluster.addProxy({ iamAuth: true })`
- Read-only proxy endpoint via `rds.CfnDBProxyEndpoint`
- CloudWatch alarms: CPU, memory, IOPS, storage
- **Note**: Capacity values are hardcoded (2-16) - need to be configurable per environment

#### ElastiCache Stack (`lib/elasticache-stack.ts:1-52`)
- Uses `elasticache.CfnCacheCluster` L1 construct
- Engine: redis, version 6.2
- Node type and count hardcoded - need to be configurable
- **For Valkey**: Change engine to "valkey", use `CfnReplicationGroup` for clustering

#### Cognito Stack (`lib/cognito-stack.ts:1-159`)
- Creates user pool with MFA, email/phone sign-in
- Custom attributes for org_id, user_id, sport_id
- **Note**: Triggers are NOT configured here - matches requirement that backend owns triggers
- Token validity configurable per client

#### DNS Stack (`lib/dns-stack.ts:1-122`)
- Creates Route53 hosted zones per environment
- Creates ACM certificates with DNS validation
- Supports CNAME, A, TXT, MX, NS records
- Outputs zone ID and certificate ARN for cross-stack use

#### SNS Stack (`lib/sns-stack.ts:1-34`)
- Creates SNS topics for error notifications
- Email subscriptions with environment-specific addresses
- **For observability**: Will need critical/warning/info topics

### Stage Orchestration Patterns

#### Network Stage (`lib/network-stage.ts:1-99`)
- Extracts stage name from props (dev/staging/production)
- Instantiates: InfrastructureStack, SecurityGroupStack, DnsStack, VpnStack, PeeringStack
- Conditionally creates stacks based on configuration (e.g., VPN only if vpcId exists)

#### App Stage (`lib/app-stage.ts:1-264`)
- Imports values from network stage via Fn.importValue
- Instantiates: SesStack, CognitoStack, AuroraStack, S3Stack, ElasticacheStack, etc.
- Conditional creation based on feature flags and vpcId existence

#### Trust Policy Stage (`lib/trust-policy-stage.ts:1-61`)
- Manages CDK bootstrap role trust policies
- Iterates over environments to create CdkTrustPolicyStack per environment
- Uses dynamic role ID lookup for trust policy configuration

#### Shared Stage (`lib/shared-stage.ts:1-54`)
- Runs in shared account
- Creates: ParentDnsStack, SnsRoleStack, IamDeployRoleStack, CodeConnectionsShareStack

### Type Definitions (`lib/types.ts:1-31`)
- `Stage`: Union type of "dev" | "staging" | "production"
- `DomainConfig`: Domain name, NS records, TLD usage, CNAME/A/TXT records
- `DnsResult`: Domain name, certificate, zone references

## Code References

| File | Lines | Description |
|------|-------|-------------|
| `geminisportsai/infrastructure-v2/util/shared-config.ts` | 1-98 | Configuration factory pattern |
| `geminisportsai/infrastructure-v2/util/environment-config.ts` | 1-158 | Environment-specific settings |
| `geminisportsai/infrastructure-v2/util/cross-stage-imports.ts` | 1-57 | Cross-stack import utilities |
| `geminisportsai/infrastructure-v2/lib/pipeline-stack.ts` | 1-199 | Pipeline definition with stages |
| `geminisportsai/infrastructure-v2/lib/infrastructure-stack.ts` | 1-149 | VPC creation pattern |
| `geminisportsai/infrastructure-v2/lib/security-group-stack.ts` | 1-161 | Security group definitions |
| `geminisportsai/infrastructure-v2/lib/aurora-stack.ts` | 1-246 | Aurora Serverless v2 with RDS Proxy |
| `geminisportsai/infrastructure-v2/lib/elasticache-stack.ts` | 1-52 | ElastiCache Redis pattern |
| `geminisportsai/infrastructure-v2/lib/cognito-stack.ts` | 1-159 | Cognito user pool |
| `geminisportsai/infrastructure-v2/lib/dns-stack.ts` | 1-122 | Route53 and ACM |
| `geminisportsai/infrastructure-v2/lib/network-stage.ts` | 1-99 | Network stage orchestration |
| `geminisportsai/infrastructure-v2/lib/app-stage.ts` | 1-264 | Application stage orchestration |
| `geminisportsai/infrastructure-v2/lib/trust-policy-stage.ts` | 1-61 | Trust policy management |
| `geminisportsai/infrastructure-v2/lib/cdk-trust-policy-stack.ts` | 1-207 | CDK bootstrap role trust |
| `cdkstarter/infrastructure/bin/infrastructure.ts` | 1-16 | Empty entry point placeholder |

## Architecture Documentation

### CDK Version and Dependencies
- AWS CDK: `2.235.0`
- Constructs: `^10.4.5`
- TypeScript: `~5.9.2`

### Aurora Serverless v2 with IAM Auth
Per AWS documentation and existing patterns:
1. Use `rds.DatabaseCluster` (NOT `ServerlessCluster`)
2. Set `instanceType: new ec2.InstanceType("serverless")`
3. Configure scaling via L1 escape hatch (`serverlessV2ScalingConfiguration`)
4. Add RDS Proxy with `iamAuth: true`
5. RDS Proxy must be in same VPC, cannot be public
6. IAM auth has 200 connections/second limit

### ElastiCache Valkey Support
Per AWS CDK documentation and community resources:
- L1 constructs: `CfnReplicationGroup` with `engine: "valkey"`, `cacheParameterGroupFamily: "valkey7"`
- L2 alpha constructs: `@aws-cdk/aws-elasticache-alpha` (as of September 2025)
- open-constructs library provides `ServerlessCache` with Valkey support

### CloudWatch Observability
Per AWS CDK documentation:
- `cloudwatch.Alarm` for metric-based alarms
- `cloudwatch.CompositeAlarm` with `AlarmRule.anyOf()`, `AlarmRule.allOf()`, `AlarmRule.not()`
- `cloudwatch.Dashboard` with `GraphWidget`, `AlarmWidget`, `TextWidget`
- Known issue: Metric widgets cannot display composite alarms (workaround: use alarm widget type)

## Testing Patterns

### Unit Test Patterns
- **Location**: `test/*.test.ts` (in geminisportsai/infrastructure-v2)
- **Framework**: Jest with `aws-cdk-lib/assertions`
- **Example to follow**: `geminisportsai/infrastructure-v2/test/pipeline-stack.test.ts`
- **Conventions**:
  - Use `Template.fromStack(stack)` for snapshot testing
  - Use `template.hasResourceProperties()` for property assertions
  - Use `template.findResources()` for resource enumeration
  - Mock environment variables in `beforeAll`/`afterAll`
  - Group tests with `describe()` blocks

### Integration Test Patterns
- **Location**: `test/*.integration.test.ts`
- **Example**: `geminisportsai/infrastructure-v2/test/pipeline-integration.test.ts`
- **Conventions**: Tests that synthesize actual stacks (may be skipped if they conflict)

### CDK Test Best Practices (from existing tests)
```typescript
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";

describe("StackName", () => {
  beforeAll(() => {
    process.env.CDK_DEFAULT_ACCOUNT = "123456789012";
    process.env.CDK_DEFAULT_REGION = "us-east-1";
  });

  test("creates expected resources", () => {
    const app = new cdk.App();
    const stack = new MyStack(app, "TestStack", { /* props */ });
    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::RDS::DBCluster", {
      Engine: "aurora-postgresql",
    });
  });
});
```

## Documentation Patterns

### JSDoc Conventions
- **Style**: Brief description, `@see` for references, `@remarks` for implementation notes
- **Example**: `geminisportsai/infrastructure-v2/lib/pipeline-stack.ts:23-40`
- **Required tags**: File-level description, `@see` for external docs

### Code Comment Conventions
- Inline comments for non-obvious configuration choices
- IMPORTANT/TODO/NOTE prefixes for critical information
- Example from aurora-stack.ts:
  ```typescript
  // IMPORTANT: When AWS Backup is managing the cluster (envConfig.backup === true),
  // we must NOT set any backup-related properties in CloudFormation.
  ```

## External Resources

### AWS CDK Documentation
- [RDS Proxy for Aurora](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/rds-proxy.html)
- [Aurora Serverless v2](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2.html)
- [CDK CompositeAlarm](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cloudwatch.CompositeAlarm.html)
- [CDK CloudWatch Alarm Guide](https://docs.aws.amazon.com/cdk/v2/guide/how-to-set-cw-alarm.html)

### Community Resources
- [AWS RDS Proxy with IAM Auth to Aurora Serverless V2](https://www.sls.guru/blog/how-to-set-up-aws-rds-proxy-with-iam-authentication-enabled-to-aurora-serverless-v2-cluster)
- [AWS CDK: VPC, RDS, RDS Proxy, Lambda](https://levelup.gitconnected.com/aws-cdk-create-vpc-rds-aurora-serverless-v2-rds-proxy-and-lambda-747a859fc431)
- [ElastiCache Serverless L2 Construct](https://dev.to/aws-builders/elasticache-serverless-l2-cdk-construct-released-in-open-constructs-fpe)
- [Creating CloudWatch Dashboards and Alarms with CDK](https://codegenie.codes/blog/creating-aws-cloudwatch-dashboards-and-alarms-with-cdk/)
- [CloudWatch Composite Alarms](https://blog.serverlessadvocate.com/amazon-cloudwatch-composite-alarms-bae9fa422e85)

### GitHub Issues
- [CDK Aurora Serverless V2 Support](https://github.com/aws/aws-cdk/issues/20197)
- [Valkey in ElastiCache CDK](https://github.com/aws/aws-cdk/discussions/31884)

## Open Questions

### Q1: JSON Schema Validation Library
**Question**: Should JSON schemas for `environments.json` and `domains.json` use ajv, zod, or another validation library?
**Context**: The brief proposes JSON schemas in `config/schemas/` but doesn't specify the validation approach.
**Impact**: Affects config loader implementation and type generation approach.
**Answer**: No. but could we make them `.ts` files so we can type them?

### Q2: PLACEHOLDER Account ID Behavior
**Question**: How should the code behave when PLACEHOLDER account IDs are present? Just log warnings during synth, or fail fast?
**Context**: The brief mentions "PLACEHOLDER allowed for synth, required for deploy" but doesn't specify exact behavior.
**Impact**: Affects config validation logic and developer experience.
**Answer**: The app should only deploy accounts that are configured. For example, if the dev environment doesn't exist, or doesn't have an account id, it should not be deployed. I understand this isn't going to be deployable until the shared account id is added as it will be needed to do the initial deploy and the bootstraping for trust of the other accounts, but we can worry about that later.

### Q3: Observability SNS Integration
**Question**: What external systems (PagerDuty, Slack) should the SNS topics integrate with, and how should these be configured?
**Context**: The brief mentions "Optional Slack/PagerDuty integration hooks" but doesn't detail configuration.
**Impact**: Affects SNS stack design and configuration schema.
**Answer**: Ignore this.

### Q4: VPC CIDR Allocation Strategy
**Question**: Should VPC CIDRs be configurable per environment or follow a fixed pattern (like 10.53.0.0/16 for dev)?
**Context**: The reference project hardcodes CIDRs per stage. The brief doesn't specify CIDR configuration.
**Impact**: Affects network stack design and environments.json schema.
**Answer**: configurable, but they need to be different. Meaning, two environments cannot have the same CIDR block. And you should put some suggestions in the code docs as to what CIDR should be used.

### Q5: API Gateway Configuration
**Question**: What specific API Gateway v2 configurations are needed (throttling limits, CORS origins, stage variables)?
**Context**: The brief mentions HTTP API with CORS and X-Ray but doesn't detail specific settings.
**Impact**: Affects API Gateway stack design and configuration schema.
**Answer**: This was a mistake. API Gateway will be setup and configured in the backend repo.
