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
   * Enable the VPC, security groups, and network-dependent helper stacks.
   *
   * Defaults to enabled when omitted for backward compatibility. Set false
   * for frontend-only stages that do not need any private networking.
   */
  readonly network?: boolean;

  /**
   * Enable SNS topics, CloudWatch alarms, and dashboards.
   *
   * Defaults to enabled when omitted for backward compatibility. Set false
   * when the stage has no backend resources to monitor.
   */
  readonly observability?: boolean;

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
   * Front this stage's HTTP API with CloudFront + an AWS WAF WebACL.
   *
   * This flag is only consulted for NON-production stages, and only has an
   * effect when a domain is also configured for the stage (see
   * config/domains.ts): it opts a non-prod stage (typically staging) into the
   * same CloudFront + WAF edge as production, so the ruleset can be rehearsed
   * before launch. Production ALWAYS gets the edge when its domain is
   * configured — the protection arrives with the production domain and is not
   * flag-gated, so it cannot be forgotten at launch.
   *
   * With no domain configured the flag is inert (the whole feature is a
   * no-op); `util/config-loader.validateConfiguration` rejects a non-prod
   * `waf: true` with no domain mapping so the flag never rots into a
   * decorative no-op.
   * @see util/cdn.ts - shouldFrontApiWithCloudFront (the trigger predicate)
   * @see lib/stacks/edge/cdn-stack.ts - the edge the flag switches on
   */
  readonly waf: boolean;

  /**
   * Enable AWS Shield Advanced for DDoS protection.
   * Provides enhanced DDoS protection beyond Shield Standard.
   * Note: Significant cost ($3,000/month + data transfer). Disabled by default.
   * Shield Standard is always enabled at no cost.
   */
  readonly shieldAdvanced: boolean;

  /**
   * Enable AWS Backup plan with tag-based resource selection.
   * Resources tagged `backup=yes` are backed up daily/weekly/monthly with
   * point-in-time recovery and cold storage archival.
   */
  readonly backup: boolean;

  /**
   * Enable the SSM Session Manager port-forwarding relay.
   * A t4g.nano instance in a private subnet that lets developers tunnel to
   * Aurora (5432) and Valkey (6379) without a Client VPN.
   * @see scripts/connect-db.sh - Tunnel helper using this relay
   */
  readonly ssmRelay: boolean;

  /**
   * Enable the GitHub Actions OIDC deploy role (DeployServiceRole) and
   * CDK bootstrap role trust-policy management for this account.
   * Lets application repos deploy from GitHub Actions without long-lived keys.
   * @see lib/stacks/cicd/iam-deploy-role-stack.ts
   */
  readonly githubOidcDeploy: boolean;

  /**
   * Enable the CodeBuild-hosted GitHub Actions runner for database migrations.
   * Runs workflow jobs inside the VPC so migrations reach Aurora directly
   * (the CI-side alternative to a VPN). Requires a CodeConnections connection
   * shared into this account.
   * @see lib/stacks/cicd/migration-runner-stack.ts
   */
  readonly migrationRunner: boolean;

  /**
   * Host a static frontend on AWS Amplify Hosting for this stage.
   *
   * When true, the stage must also provide an `amplifyHosting` configuration
   * block describing the source repository and build.
   */
  readonly amplifyHosting?: boolean;
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

  /**
   * RDS Enhanced Monitoring interval in seconds (1, 5, 10, 15, 30, or 60).
   *
   * Provides OS-level CPU/memory/IO metrics per instance — the first thing
   * needed in a database incident. Omit to disable (no monitoring role is
   * created). 15 is a good production value.
   */
  readonly enhancedMonitoringIntervalSeconds?: number;

  /**
   * Enable RDS Performance Insights on every cluster instance.
   *
   * Per-query load analysis ("which query is making the database busy") —
   * free at the default 7-day retention. Defaults to false.
   */
  readonly performanceInsights?: boolean;
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

  /**
   * Sentry DSN for this environment's alert forwarding.
   *
   * When set, a forwarder Lambda subscribes to every alarm topic and sends
   * each notification to Sentry as a structured event tagged `triage:ready`,
   * making incidents machine-readable for agent triage. The DSN is a
   * publishable, write-only client key (the same value Sentry ships in
   * frontend bundles) — safe to keep in config. Omit to disable.
   */
  readonly sentryDsn?: string;

  /**
   * Public URLs a synthetic canary probes on a schedule.
   *
   * When non-empty, a canary Lambda fetches each URL every
   * `canaryIntervalMinutes` and a critical alarm fires on any failure —
   * catching "site down" regardless of cause. Omit to disable.
   */
  readonly canaryUrls?: readonly string[];

  /**
   * Minutes between synthetic canary runs (default 5).
   * Only meaningful when `canaryUrls` is set.
   */
  readonly canaryIntervalMinutes?: number;

  /**
   * Roll every alarm in this environment into one
   * `<stage>-environment-unhealthy` composite alarm.
   *
   * Pages and dashboards get a single root signal while the child alarms
   * carry the detail. Defaults to false.
   */
  readonly compositeAlarmEnabled?: boolean;

  /**
   * Forward failed/aborted/expired AWS Backup jobs to Sentry.
   *
   * Requires `sentryDsn` — the events ride the same forwarder Lambda.
   * Defaults to false.
   */
  readonly backupFailureAlerts?: boolean;

  /**
   * Enable AWS Cost Anomaly Detection with a daily email digest to the
   * alarm endpoints; anomalies below this USD impact are not reported.
   *
   * Catches runaway spend (retry storms, forgotten resources) within a
   * day. Omit to disable.
   */
  readonly costAnomalyThresholdUsd?: number;
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
 * Tuning for the CloudFront-fronted AWS WAF WebACL created for a stage.
 *
 * All fields are optional; the CdnStack applies safe defaults. This block
 * only matters when the stage actually gets the edge (production with a
 * domain, or a non-prod stage with `features.waf` and a domain).
 * @see lib/stacks/edge/cdn-stack.ts - CdnStack (consumer)
 */
export interface WafOptions {
  /**
   * Per-IP request cap over a rolling 5-minute window for the rate-based
   * rule. Requests above the cap from a single IP are blocked (or counted
   * when `countOnly` is set). Defaults to 2000.
   */
  readonly rateLimitPerFiveMinutes?: number;

  /**
   * Put every rule (managed groups + rate limit) into Count mode instead of
   * Block. Nothing is blocked — matches are only counted and surfaced in
   * CloudWatch/sampled requests. Use on staging to rehearse the ruleset and
   * watch for false positives (notably the AWS Common rule group's
   * `SizeRestrictions_BODY`, an 8 KB body cap that trips large request
   * bodies) before production flips to Block. Defaults to false.
   */
  readonly countOnly?: boolean;
}

/**
 * Configuration for a static frontend hosted by AWS Amplify Hosting.
 *
 * The OAuth token itself is never stored in source. Only the name of a
 * Secrets Manager secret is configured; CloudFormation resolves its value at
 * deploy time for the initial GitHub connection handshake.
 */
export interface AmplifyHostingConfig {
  /** GitHub organization or user that owns the frontend repository. */
  readonly owner: string;

  /** GitHub repository containing the frontend. */
  readonly repository: string;

  /** Repository branch that Amplify builds automatically. */
  readonly branch: string;

  /** Secrets Manager secret name holding the GitHub OAuth token. */
  readonly oauthTokenSecretName: string;

  /** Optional custom domain. The Amplify default domain is used when absent. */
  readonly customDomain?: string;

  /** Commands run before the frontend build. */
  readonly preBuildCommands?: readonly string[];

  /** Commands that produce the static frontend output. */
  readonly buildCommands?: readonly string[];

  /** Static artifact directory, relative to the repository root. */
  readonly artifactBaseDirectory?: string;

  /** Environment variables attached to the Amplify branch. */
  readonly environmentVariables?: Readonly<Record<string, string>>;
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

  /**
   * Optional tuning for the CloudFront-fronted WAF WebACL. Ignored unless
   * the stage gets the edge (see {@link StageFeatures.waf}).
   */
  readonly wafOptions?: WafOptions;

  /**
   * Amplify Hosting configuration. Required when
   * {@link StageFeatures.amplifyHosting} is enabled.
   */
  readonly amplifyHosting?: AmplifyHostingConfig;
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

  /**
   * Host the central S3 bucket receiving VPC flow logs from all
   * stage accounts.
   */
  readonly flowLogs: boolean;
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
 * GitHub integration configuration for CI/CD.
 *
 * Drives the CDK Pipeline source, the GitHub Actions OIDC deploy role,
 * and the CodeBuild-hosted migration runner. The CodeConnections connection
 * must be created manually in the AWS Console (shared account) and authorized
 * against the GitHub organization before pipeline mode can be enabled.
 */
export interface GitHubConfig {
  /**
   * GitHub organization or username owning the repositories.
   * Example: "your-org"
   */
  readonly owner: string;

  /**
   * Repository containing this CDK infrastructure code.
   * Used as the CDK Pipeline source.
   */
  readonly infrastructureRepo: string;

  /**
   * Branch the CDK Pipeline deploys from.
   * Example: "main"
   */
  readonly branch: string;

  /**
   * ARN of the AWS CodeConnections connection to GitHub.
   * Use "PLACEHOLDER" until the connection is created; pipeline mode,
   * the migration runner, and the RAM share are skipped while it is
   * a placeholder.
   */
  readonly codeConnectionArn: string;

  /**
   * Name of the GitHub Actions OIDC deploy role created in each stage
   * account. Application repo workflows assume this role via
   * `aws-actions/configure-aws-credentials`.
   */
  readonly deployRoleName: string;

  /**
   * Repository pattern allowed to assume the deploy role.
   * "*" allows every repo in the organization; narrow to a specific
   * repo name to restrict.
   */
  readonly deployRepoPattern: string;

  /**
   * Optional pre-existing IAM user used by GitHub Actions (legacy
   * access-key based deploys). When set, a managed policy granting
   * sts:AssumeRole on the CDK bootstrap roles is attached to the user
   * and the user is added to the bootstrap role trust policies.
   * Prefer the OIDC deploy role; leave undefined for new projects.
   */
  readonly deployUserName?: string;

  /**
   * Repository whose GitHub Actions workflows use the in-VPC CodeBuild
   * migration runner (typically the application/backend repo, which needs
   * network access to Aurora for schema migrations).
   */
  readonly migrationRunnerRepo: string;

  /**
   * Email address subscribed to pipeline security notifications
   * (permissions-broadening checks). Optional.
   */
  readonly notificationEmail?: string;
}

/**
 * Configuration for the headless remote-agent IAM kit.
 *
 * Provisions a scoped role in every deployable account plus a dedicated
 * assume-only IAM user in the shared account. A headless agent (for example
 * a Claude Code remote routine) authenticates with the user's access key and
 * assumes the per-account role, receiving short-lived STS credentials.
 * A leaked key grants nothing beyond "assume one scoped role".
 */
export interface AgentOperationsConfig {
  /**
   * Master switch. When false, no agent-operations resources are created.
   * Enabling also requires the AGENT_OPERATIONS_EXTERNAL_ID environment
   * variable (confused-deputy protection on sts:AssumeRole).
   */
  readonly enabled: boolean;

  /**
   * Role name deployed identically into every member account, so agent
   * AWS profiles vary only by account ID.
   */
  readonly roleName: string;

  /**
   * Name of the managed policy attached to the role in each account.
   */
  readonly policyName: string;

  /**
   * Name of the dedicated assume-only IAM user in the shared account.
   */
  readonly userName: string;

  /**
   * Secrets Manager secret name holding the user's access key in the
   * shared account.
   */
  readonly secretName: string;
}

/**
 * Union type for any environment.
 */
export type Environment = StageEnvironment | SupportEnvironment;
