/**
 * Agent Operations Configuration
 *
 * Configures the headless remote-agent IAM kit: a scoped role deployed into
 * every deployable account plus a dedicated assume-only IAM user in the
 * shared account.
 *
 * ## How It Works
 *
 * A remote coding environment is given the Secrets Manager SecretString as one
 * `LISA_AWS_BOOTSTRAP_JSON` value. Lisa writes the contained access key into a
 * named source profile and generates per-account assume-role profiles. The
 * dedicated user holds NO permissions except `sts:AssumeRole`, so the agent's
 * real permissions always arrive as short-lived STS credentials.
 *
 * ## Enabling
 *
 * 1. Set `enabled: true` below
 * 2. Export `AGENT_OPERATIONS_EXTERNAL_ID` with a random string (for example
 *    `openssl rand -hex 16`) — this ExternalId is required on every
 *    `sts:AssumeRole` call (confused-deputy protection)
 * 3. Deploy; the complete bootstrap bundle lands in Secrets Manager in shared
 *
 * Standing observer permissions live in
 * `lib/stacks/agent-operations/agent-operations-policy.json`. Direct repair
 * permissions live separately in `agent-operations-repair-policy.json` and
 * are attached only to the environments listed in `repairEnvironmentNames`.
 *
 * ## Profile Names
 *
 * Generated profiles are prefixed (`agent-dev`, `agent-staging`, …) because
 * they are written into a human operator's own `~/.aws/config`. A bare `dev`
 * would sit beside — and could overwrite — that person's SSO profile for the
 * same environment, which would silently hand every unqualified agent command
 * a human identity carrying human permissions.
 *
 * Keeping the sets disjoint makes the agent's scoped role the default and
 * escalation an explicit `--profile <human>`. It also makes the boundary
 * legible in CloudTrail: an `agent-*` session is attributable to the agent
 * role, not to whoever happened to be logged in.
 * @see lib/stacks/agent-operations/agent-operations-stack.ts - Per-account role
 * @see lib/stacks/agent-operations/agent-operations-user-stack.ts - Shared user
 * @module config/agent-operations
 */
import type { AgentOperationsConfig } from "../lib/types";

/**
 * Agent operations settings.
 *
 * Names are stable across accounts so agent AWS profiles vary only by
 * account ID. Disabled by default; see the module docs for enabling steps.
 */
export const agentOperationsConfig: AgentOperationsConfig = {
  enabled: false,
  roleName: "RemoteAgent",
  policyName: "AgentOperationsPolicy",
  repairPolicyName: "AgentOperationsRepairPolicy",
  repairEnvironmentNames: ["dev", "staging"],
  userName: "remote-agent",
  secretName: "remote-agent-credentials",
  profilePrefix: "agent-",
} as const;
