/**
 * Agent Operations Configuration
 *
 * Configures the headless remote-agent IAM kit: a scoped role deployed into
 * every deployable account plus a dedicated assume-only IAM user in the
 * shared account.
 *
 * ## How It Works
 *
 * A headless agent (for example a Claude Code remote routine) is given the
 * dedicated user's access key as `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.
 * That user holds NO permissions except `sts:AssumeRole` on the per-account
 * agent role, so the agent's real permissions always arrive as short-lived
 * STS credentials — and a leaked key only grants "assume one scoped role".
 *
 * ## Enabling
 *
 * 1. Set `enabled: true` below
 * 2. Export `AGENT_OPERATIONS_EXTERNAL_ID` with a random string (for example
 *    `openssl rand -hex 16`) — this ExternalId is required on every
 *    `sts:AssumeRole` call (confused-deputy protection)
 * 3. Deploy; the access key lands in Secrets Manager in the shared account
 *
 * The permission document lives verbatim in
 * `lib/stacks/agent-operations/agent-operations-policy.json`. Adjust it to
 * match the services your agents operate on.
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
  userName: "remote-agent",
  secretName: "remote-agent-credentials",
} as const;
