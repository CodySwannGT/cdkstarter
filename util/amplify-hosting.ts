/** Pure validation/rendering for explicit optional Amplify hosting settings. */
import type { AmplifyCustomRule, AmplifyHostingConfig } from "../lib/types";

/** AWS SPA pattern extended to preserve real exported HTML callbacks. */
export const SPA_FALLBACK_SOURCE = String.raw`</^[^.]+$|\.(?!(css|gif|html|ico|jpg|jpeg|js|json|map|otf|png|svg|ttf|txt|webp|webmanifest|woff2?)$)([^.]+$)/>`;
const statuses = new Set(["200", "301", "302", "404", "404-200"]);
const multiline = /[\r\n\0\u2028\u2029]/;
const headerName = /^[!#$%&'*+.^_`|~\da-z-]+$/i;

/**
 * Require explicit nonempty single-line settings.
 * @param value - Caller value
 * @param field - Actionable field name
 */
function requireSingleLine(value: string, field: string): void {
  if (typeof value !== "string" || !value.trim() || multiline.test(value))
    throw new Error(
      `Invalid Amplify ${field}: expected a nonempty single-line string`
    );
}

/**
 * Validate notification settings without creating any resource.
 * @param hosting - Hosting configuration
 */
function validateNotifications(hosting: AmplifyHostingConfig): void {
  const options = hosting.buildFailureNotifications;
  if (!options?.enabled) return;
  if (
    !options.topicArn ||
    !/^arn:aws(?:-cn|-us-gov)?:sns:[a-z\d-]+:\d{12}:[a-z\d_-]{1,256}$/i.test(
      options.topicArn
    )
  )
    throw new Error(
      "Enabled Amplify build failure notifications require an explicit standard SNS topic ARN"
    );
  const branches = options.branches ?? [hosting.branch];
  if (!branches.length)
    throw new Error(
      "Amplify build failure notification branches must not be empty"
    );
  branches.forEach(branch => requireSingleLine(branch, "notification branch"));
}

/**
 * Validate both config loading and direct stack construction.
 * @param hosting - Hosting configuration
 */
export function validateAmplifyHosting(hosting: AmplifyHostingConfig): void {
  for (const flag of [
    hosting.spaFallback?.enabled,
    hosting.buildFailureNotifications?.enabled,
  ]) {
    if (flag !== undefined && typeof flag !== "boolean")
      throw new Error("Amplify optional enabled flags must be boolean");
  }
  hosting.customRules?.forEach(rule => {
    requireSingleLine(rule.source, "rule source");
    requireSingleLine(rule.target, "rule target");
    if (!statuses.has(rule.status))
      throw new Error(
        "Invalid Amplify rule status: use 200, 301, 302, 404 or 404-200"
      );
    if (rule.condition !== undefined)
      requireSingleLine(rule.condition, "rule condition");
  });
  hosting.customHeaders?.forEach(group => {
    requireSingleLine(group.pattern, "header path pattern");
    Object.entries(group.headers).forEach(([name, value]) => {
      if (
        !headerName.test(name) ||
        typeof value !== "string" ||
        multiline.test(value)
      )
        throw new Error(
          "Invalid Amplify header name/value: use a valid token name and single-line value"
        );
    });
  });
  validateNotifications(hosting);
}

/**
 * Keep caller precedence, append at most one equivalent default-off fallback.
 * @param hosting - Validated hosting configuration
 * @returns Ordered Amplify rules
 */
export function amplifyCustomRules(
  hosting: AmplifyHostingConfig
): readonly AmplifyCustomRule[] {
  const rules = [...(hosting.customRules ?? [])];
  const equivalent = rules.some(
    rule =>
      rule.source === SPA_FALLBACK_SOURCE &&
      rule.target === "/index.html" &&
      rule.status === "200" &&
      rule.condition === undefined
  );
  return hosting.spaFallback?.enabled && !equivalent
    ? [
        ...rules,
        { source: SPA_FALLBACK_SOURCE, target: "/index.html", status: "200" },
      ]
    : rules;
}
