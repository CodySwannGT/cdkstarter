/**
 * Configuration Type Definitions for CDK Infrastructure
 *
 * This module defines the type-safe foundation for the entire configuration system.
 * All infrastructure configuration flows through these interfaces, enabling compile-time
 * validation and IDE support across the codebase.
 *
 * The type system distinguishes between two environment types:
 * - Stage environments (dev, staging, production) - where application workloads run
 * - Support environments (shared) - for centralized resources like DNS and pipelines
 *
 * This separation enables account-per-environment isolation (blast radius containment)
 * while maintaining shared infrastructure where appropriate.
 * @see config/environments.ts - Environment configuration instances
 * @see util/config-loader.ts - Runtime configuration loading and validation
 * @module lib/types
 */

/**
 * Discriminator type for environment classification.
 *
 * This enables type narrowing when processing environments, allowing TypeScript
 * to understand which properties are available based on the environment type.
 */
export type EnvironmentType = "stage" | "support";

/**
 * Feature flags controlling which AWS resources are provisioned in a stage environment.
 *
 * These flags enable cost optimization by disabling unused services in development
 * environments while ensuring production has all required features enabled.
 * Each flag corresponds to a CDK stack that will be conditionally created.
 */
export interface StageFeatures {
  /**
   * Enable Aurora PostgreSQL Serverless v2 with RDS Proxy.
   * Required for persistent data storage.
   */
  readonly aurora: boolean;

  /**
   * Enable Valkey (ElastiCache) for caching.
   * Improves API response times and reduces database load.
   */
  readonly valkey: boolean;

  /**
   * Enable Cognito User Pool for authentication.
   * Required for user sign-up/sign-in flows.
   */
  readonly cognito: boolean;

  /**
   * Enable X-Ray tracing for distributed tracing.
   * Helps diagnose performance issues and request flows.
   */
  readonly xray: boolean;

  /**
   * Enable AWS WAF (Web Application Firewall) for API protection.
   * Protects against common web exploits and bots.
   * Note: Incurs additional costs. Disabled by default.
   */
  readonly waf: boolean;

  /**
   * Enable AWS Shield Advanced for DDoS protection.
   * Provides enhanced DDoS protection beyond Shield Standard.
   * Note: Significant cost ($3,000/month + data transfer). Disabled by default.
   * Shield Standard is always enabled at no cost.
   */
  readonly shieldAdvanced: boolean;
}

/**
 * Aurora PostgreSQL Serverless v2 configuration.
 *
 * Capacity is measured in Aurora Capacity Units (ACUs). Each ACU provides
 * approximately 2 GB of memory with corresponding CPU and networking.
 * Serverless v2 scales between min and max capacity based on load.
 *
 * Suggested capacity settings by environment:
 * - Development: min=0.5, max=2 (cost optimized, can scale to zero-ish)
 * - Staging: min=1, max=8 (balance of cost and performance)
 * - Production: min=2, max=64 (performance optimized, always warm)
 */
export interface AuroraConfig {
  /**
   * Minimum Aurora Capacity Units.
   * Lower values save cost but may have cold start latency.
   * Valid values: 0.5 to maxCapacity
   */
  readonly minCapacity: number;

  /**
   * Maximum Aurora Capacity Units.
   * Higher values allow handling traffic spikes.
   * Valid values: minCapacity to 128
   */
  readonly maxCapacity: number;

  /**
   * Number of database instances in the cluster.
   * Use 1 for dev (cost savings), 2+ for staging/production (high availability).
   */
  readonly instanceCount: number;

  /**
   * Prevent accidental database deletion.
   * Should be true for staging and production environments.
   */
  readonly deletionProtection: boolean;

  /**
   * Days to retain automated backups.
   * Minimum 1, maximum 35. Use higher values for production.
   */
  readonly backupRetentionDays: number;

  /**
   * Days to retain database logs in CloudWatch.
   * Balance between debugging capability and storage costs.
   */
  readonly logRetentionDays: number;
}

/**
 * Valkey (ElastiCache) cache cluster configuration.
 *
 * Valkey is AWS's Redis-compatible caching service. Node type determines
 * available memory and network performance.
 */
export interface ValkeyConfig {
  /**
   * ElastiCache node instance type.
   * Examples: "cache.t4g.micro" (dev), "cache.t4g.small" (staging), "cache.r7g.large" (production)
   */
  readonly nodeType: string;

  /**
   * Number of cache nodes in the cluster.
   * Use 1 for development, 2+ for production (replication and failover).
   */
  readonly numCacheNodes: number;
}

/**
 * Monitoring and alerting configuration for an environment.
 *
 * Controls CloudWatch dashboards, alarm notification endpoints, and
 * log retention. More aggressive monitoring for production reduces
 * mean time to detection (MTTD) for incidents.
 */
export interface ObservabilityConfig {
  /**
   * Email addresses to receive alarm notifications.
   * Empty array disables email notifications.
   */
  readonly alarmEmailEndpoints: readonly string[];

  /**
   * Enable CloudWatch dashboard for this environment.
   * Provides at-a-glance system health visibility.
   */
  readonly dashboardEnabled: boolean;

  /**
   * Enable enhanced CloudWatch monitoring with 1-second granularity.
   * Increases monitoring costs but provides finer-grained metrics.
   */
  readonly detailedMonitoring: boolean;

  /**
   * Days to retain CloudWatch Logs.
   * Balance between debugging capability and storage costs.
   */
  readonly logRetentionDays: number;
}

/**
 * Deployment pipeline configuration for a stage environment.
 *
 * Controls CI/CD pipeline behavior including approval gates and
 * deployment strategies.
 */
export interface DeploymentConfig {
  /**
   * Require manual approval before deploying to this environment.
   * When true, the pipeline pauses and waits for human approval.
   * Recommended for production environments (SOC 2 CC8.1 compliance).
   */
  readonly requireManualApproval: boolean;
}

/**
 * Disaster recovery configuration for a stage environment.
 *
 * Controls cross-region replication and backup settings.
 * These features have significant cost implications and should only
 * be enabled when business requirements justify the expense.
 */
export interface DisasterRecoveryConfig {
  /**
   * Enable Aurora Global Database for cross-region read replicas.
   * Provides RPO of ~1 second and RTO of ~1 minute for regional failover.
   * Cost: Additional Aurora instance in secondary region + data transfer.
   * Disabled by default due to cost.
   */
  readonly enableCrossRegionReplica: boolean;

  /**
   * Secondary region for cross-region replication.
   * Only used if enableCrossRegionReplica is true.
   * Example: "us-west-2" for us-east-1 primary
   */
  readonly secondaryRegion?: string;

  /**
   * Enable cross-region automated backups for Aurora.
   * Copies automated backups to a secondary region.
   * Cost: Storage costs in secondary region + data transfer.
   * Disabled by default due to cost.
   */
  readonly enableCrossRegionBackup: boolean;
}

/**
 * VPC Endpoint types that can be enabled.
 *
 * ## Free Gateway Endpoints (recommended for all environments)
 * - `s3` - S3 access without NAT
 * - `dynamodb` - DynamoDB access without NAT
 *
 * ## Paid Interface Endpoints (~$7/month each + data transfer)
 * Only enable if needed for security compliance or private connectivity:
 * - `secretsmanager` - Secrets Manager
 * - `rds` - RDS API
 * - `logs` - CloudWatch Logs
 * - `monitoring` - CloudWatch Metrics
 * - `ecr.api` - ECR API
 * - `ecr.dkr` - ECR Docker registry
 * - `kms` - Key Management Service
 * - `ssm` - Systems Manager
 * - `ssmmessages` - SSM Session Manager
 * - `ec2messages` - SSM EC2 messages
 */
export type VpcEndpointType =
  // Gateway endpoints (FREE)
  | "s3"
  | "dynamodb"
  // Interface endpoints (PAID ~$7/month each)
  | "secretsmanager"
  | "rds"
  | "logs"
  | "monitoring"
  | "ecr.api"
  | "ecr.dkr"
  | "kms"
  | "ssm"
  | "ssmmessages"
  | "ec2messages";

/**
 * VPC network configuration.
 *
 * IMPORTANT: Each environment MUST have a unique CIDR block to enable
 * VPC peering if needed in the future. Overlapping CIDRs prevent peering.
 *
 * Suggested CIDR allocation pattern (10.{env}.0.0/16):
 * - dev: 10.0.0.0/16
 * - staging: 10.1.0.0/16
 * - production: 10.2.0.0/16
 * - additional envs: 10.3.0.0/16, 10.4.0.0/16, etc.
 */
export interface NetworkConfig {
  /**
   * VPC CIDR block in notation like "10.0.0.0/16".
   * Must be unique across all environments to enable future VPC peering.
   */
  readonly vpcCidr: string;

  /**
   * VPC Endpoints to create for private AWS service access.
   * Keeps traffic within AWS network, improving security and reducing
   * data exfiltration risk (SOC 2 C1.2 compliance).
   *
   * Note: Interface endpoints cost ~$7/month each + data transfer.
   * Gateway endpoints (s3, dynamodb) are free.
   *
   * Empty array or undefined means no VPC endpoints.
   * Recommended for production: ["s3", "secretsmanager", "logs", "kms"]
   */
  readonly vpcEndpoints?: readonly VpcEndpointType[];
}

/**
 * Complete configuration for a stage environment (dev, staging, production).
 *
 * Stage environments run application workloads in isolated AWS accounts.
 * This account-per-environment pattern provides blast radius containment -
 * issues in dev cannot impact production resources.
 */
export interface StageEnvironment {
  /**
   * Discriminator for TypeScript type narrowing.
   */
  readonly type: "stage";

  /**
   * Environment name (e.g., "dev", "staging", "production").
   * Used in resource naming and stack identification.
   */
  readonly name: string;

  /**
   * AWS Account ID for this environment.
   * Use "PLACEHOLDER" during development; deployment requires real ID.
   */
  readonly accountId: string;

  /**
   * AWS region for resource deployment.
   */
  readonly region: string;

  /**
   * Feature flags controlling which resources are created.
   */
  readonly features: StageFeatures;

  /**
   * Aurora database configuration.
   */
  readonly aurora: AuroraConfig;

  /**
   * Valkey cache configuration.
   */
  readonly valkey: ValkeyConfig;

  /**
   * VPC network configuration.
   */
  readonly network: NetworkConfig;

  /**
   * Monitoring and alerting configuration.
   */
  readonly observability: ObservabilityConfig;

  /**
   * Deployment pipeline configuration.
   */
  readonly deployment: DeploymentConfig;

  /**
   * Disaster recovery configuration.
   * Optional - defaults to disabled if not specified.
   */
  readonly disasterRecovery?: DisasterRecoveryConfig;
}

/**
 * Purpose flags for support environments.
 *
 * Support environments host centralized infrastructure that serves
 * multiple stage environments, such as CI/CD pipelines and DNS management.
 */
export interface SupportPurpose {
  /**
   * Host CDK Pipeline for continuous deployment.
   */
  readonly pipeline: boolean;

  /**
   * Host Route53 hosted zones for DNS management.
   */
  readonly dns: boolean;

  /**
   * Host AWS CodeConnections for GitHub integration.
   */
  readonly codeConnections: boolean;
}

/**
 * Configuration for a support environment (shared infrastructure).
 *
 * Support environments provide centralized resources that multiple stage
 * environments depend on. The shared account typically hosts:
 * - CDK Pipeline (deploys to all stage accounts)
 * - DNS hosted zones (manages domain routing)
 * - CodeConnections (GitHub repository access)
 */
export interface SupportEnvironment {
  /**
   * Discriminator for TypeScript type narrowing.
   */
  readonly type: "support";

  /**
   * Environment name (e.g., "shared").
   */
  readonly name: string;

  /**
   * AWS Account ID for this environment.
   */
  readonly accountId: string;

  /**
   * AWS region for resource deployment.
   */
  readonly region: string;

  /**
   * Flags indicating which centralized resources this account hosts.
   */
  readonly purpose: SupportPurpose;
}

/**
 * Environment mapping for a domain, specifying how each environment
 * accesses the domain (subdomain or apex).
 */
export interface DomainEnvironmentMapping {
  /**
   * Subdomain prefix for this environment (e.g., "dev" for dev.example.com).
   * Mutually exclusive with useApex.
   */
  readonly subdomain?: string;

  /**
   * Use the apex domain for this environment (e.g., example.com).
   * Typically used for production. Mutually exclusive with subdomain.
   */
  readonly useApex?: boolean;
}

/**
 * Configuration for a single domain.
 *
 * Domains are optional and can be added/removed without breaking deployments.
 * Each domain can map to multiple environments with different subdomains.
 */
export interface Domain {
  /**
   * Domain name (e.g., "example.com").
   */
  readonly name: string;

  /**
   * Whether this is the primary domain.
   * Exactly one domain must be marked as primary if domains are configured.
   */
  readonly isPrimary: boolean;

  /**
   * Mapping of environment names to their domain configuration.
   */
  readonly environments: Readonly<Record<string, DomainEnvironmentMapping>>;
}

/**
 * Top-level domain configuration wrapper.
 *
 * Domains are optional - infrastructure can deploy without any domains
 * configured. When domains are present, exactly one must be marked primary.
 */
export interface DomainConfig {
  /**
   * List of domains to configure.
   */
  readonly domains: readonly Domain[];
}

/**
 * Aurora-specific CloudWatch alarm thresholds.
 *
 * These thresholds define when alarms trigger for Aurora database metrics.
 * Warning thresholds indicate potential issues; critical thresholds indicate
 * immediate action required.
 */
export interface AuroraAlarmThresholds {
  /**
   * CPU utilization warning threshold (percentage).
   * Triggers when CPU consistently exceeds this value.
   */
  readonly cpuWarning: number;

  /**
   * CPU utilization critical threshold (percentage).
   * Requires immediate investigation.
   */
  readonly cpuCritical: number;

  /**
   * Freeable memory warning threshold (megabytes).
   * Low memory may cause query slowdowns.
   */
  readonly memoryWarningMB: number;

  /**
   * Freeable memory critical threshold (megabytes).
   * Very low memory may cause failures.
   */
  readonly memoryCriticalMB: number;

  /**
   * Database connection warning threshold (absolute count).
   * Triggers warning when connections exceed this value.
   */
  readonly connectionsWarning: number;

  /**
   * Database connection critical threshold (absolute count).
   * Triggers critical alarm when connections exceed this value.
   */
  readonly connectionsCritical: number;

  /**
   * Replication lag warning threshold (milliseconds).
   * High lag may cause stale reads from replicas.
   */
  readonly replicationLagWarningMs: number;

  /**
   * Replication lag critical threshold (milliseconds).
   * Very high lag indicates replication problems.
   */
  readonly replicationLagCriticalMs: number;

  /**
   * Free storage critical threshold (gigabytes).
   * Low storage may cause write failures.
   */
  readonly freeStorageCriticalGB: number;
}

/**
 * Valkey-specific CloudWatch alarm thresholds.
 */
export interface ValkeyAlarmThresholds {
  /**
   * CPU utilization warning threshold (percentage).
   */
  readonly cpuWarning: number;

  /**
   * CPU utilization critical threshold (percentage).
   * Requires immediate investigation.
   */
  readonly cpuCritical: number;

  /**
   * Cache hit rate warning threshold (percentage).
   * Low hit rate indicates ineffective caching.
   */
  readonly cacheHitRateWarning: number;

  /**
   * Cache hit rate critical threshold (percentage).
   * Very low hit rate indicates cache is not functioning properly.
   */
  readonly cacheHitRateCritical: number;

  /**
   * Evictions warning threshold (count).
   * Any evictions indicate memory pressure.
   */
  readonly evictionsWarning: number;

  /**
   * Evictions critical threshold (count).
   * High evictions indicate severe memory pressure.
   */
  readonly evictionsCritical: number;
}

/**
 * Combined alarm thresholds for all monitored resources.
 */
export interface AlarmThresholds {
  /**
   * Aurora database alarm thresholds.
   */
  readonly aurora: AuroraAlarmThresholds;

  /**
   * Valkey cache alarm thresholds.
   */
  readonly valkey: ValkeyAlarmThresholds;
}

/**
 * CloudWatch dashboard widget configuration.
 *
 * Specifies which metrics to display on the environment dashboard.
 * Each array contains metric identifiers for that resource type.
 */
export interface DashboardWidgets {
  /**
   * Aurora metrics to display (e.g., "connections", "cpu", "memory", "iops", "latency").
   */
  readonly aurora: readonly string[];

  /**
   * Valkey metrics to display (e.g., "hitRate", "connections", "memory", "cpu").
   */
  readonly valkey: readonly string[];

  /**
   * Cognito metrics to display (e.g., "signIns", "signUps", "tokenRefreshes").
   */
  readonly cognito: readonly string[];

  /**
   * VPC metrics to display (e.g., "natGateway", "dataTransfer").
   */
  readonly vpc: readonly string[];
}

/**
 * Complete observability configuration combining thresholds and dashboard settings.
 */
export interface ObservabilityConfigFile {
  /**
   * Alarm threshold configuration for all resources.
   */
  readonly alarmThresholds: AlarmThresholds;

  /**
   * Dashboard widget configuration.
   */
  readonly dashboardWidgets: DashboardWidgets;
}

/**
 * Complete environments configuration file structure.
 */
export interface EnvironmentsConfig {
  /**
   * Stage environments (dev, staging, production, etc.).
   */
  readonly stages: readonly StageEnvironment[];

  /**
   * Support environments (shared infrastructure).
   */
  readonly support: readonly SupportEnvironment[];
}

/**
 * Union type for any environment.
 */
export type Environment = StageEnvironment | SupportEnvironment;
