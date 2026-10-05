#!/usr/bin/env node
/** Explicit recovery command; no local SDK install or account preference side effect on import. */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import controller from "../resources/observability/sms-spend-monitor/controller.cjs";

/**
 * Recover through genuine injected services in offline tests/operator integrations.
 * @param {object} config - Source-owned account ceiling
 * @param {object} request - Explicit identity/limit
 * @param {object} clients - Injected controller services
 * @returns {Promise<object>} Metadata-only recovery receipt
 */
export const recoverSmsSpend = (config, request, clients) =>
  controller.recover(config, request, clients);

/**
 * Invoke the dedicated deployed Lambda through the normal AWS CLI credential chain.
 * @param {string[]} args - Function ARN and explicit account/region/limit, optionally --reconcile
 * @param {typeof execFileSync} run - Optional command client for offline tests
 * @returns {object} Sanitized recovery result
 */
export const invokeRecovery = (args, run = execFileSync) => {
  const [functionArn, account, region, amount, flag] = args;
  const arn =
    /^arn:(aws|aws-cn|aws-us-gov):lambda:([a-z0-9-]+):(\d{12}):function:[A-Za-z0-9_-]+$/.exec(
      functionArn ?? ""
    );
  const limit = Number(amount);
  if (
    !arn ||
    arn[2] !== region ||
    arn[3] !== account ||
    !Number.isFinite(limit) ||
    limit <= 0 ||
    (flag !== undefined && flag !== "--reconcile") ||
    args.length > 5
  )
    throw new Error(
      "Usage: node scripts/recover-sms-spend.mjs FUNCTION_ARN ACCOUNT REGION POSITIVE_USD [--reconcile]"
    );
  const scratch = mkdtempSync(path.join(tmpdir(), "sms-recovery-"));
  const output = path.join(scratch, "result.json");
  try {
    const identity = JSON.parse(
      run(
        "aws",
        ["sts", "get-caller-identity", "--region", region, "--output", "json"],
        { encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] }
      )
    );
    if (identity.Account !== account)
      throw new Error("recovery-caller-account-mismatch");
    const receipt = JSON.parse(
      run(
        "aws",
        [
          "lambda",
          "invoke",
          "--function-name",
          functionArn,
          "--region",
          region,
          "--cli-binary-format",
          "raw-in-base64-out",
          "--payload",
          JSON.stringify({
            action: "recover",
            account,
            region,
            limit,
            reconcile: flag === "--reconcile",
          }),
          output,
        ],
        { encoding: "utf8", timeout: 90000, stdio: ["ignore", "pipe", "pipe"] }
      )
    );
    if (receipt.FunctionError || receipt.StatusCode !== 200)
      throw new Error(
        "recovery-handler-failed; inspect metadata-only Lambda error logs"
      );
    const result = JSON.parse(readFileSync(output, "utf8"));
    if (result.status !== "READY" || typeof result.operationId !== "string")
      throw new Error("recovery-response-not-confirmed");
    return {
      account,
      region,
      status: result.status,
      operationId: result.operationId,
      limit,
    };
  } catch (error) {
    throw new Error(
      error.message?.startsWith("recovery-")
        ? error.message
        : "recovery-command-failed; no clear confirmed"
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
};

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(JSON.stringify(invokeRecovery(process.argv.slice(2))));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
