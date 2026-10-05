/** Pure validation and normalized identities for opt-in DNS delegation. */
import { createHash } from "node:crypto";
import type {
  DnsDelegationEntry,
  DomainConfig,
  StageEnvironment,
} from "../lib/types";

/**
 * Normalize ASCII DNS names for exact Route53 IAM conditions.
 * @param name - Configured DNS name
 * @returns Lowercase name without a trailing dot
 */
export const normalizeDnsName = (name: string): string =>
  name.toLowerCase().replace(/\.$/, "");

/**
 * Stable construct identity for new delegation resources.
 * @param entry - Normalized delegation entry
 * @returns Collision-resistant identity independent of array order
 */
export const dnsDelegationId = (entry: DnsDelegationEntry): string =>
  createHash("sha256").update(entry.childZoneName).digest("hex").slice(0, 16);

const validName = (name: string): boolean =>
  name.length <= 253 &&
  name
    .split(".")
    .every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));

/**
 * Validate enabled delegation before constructing resources. Disabled entries are inert.
 * @param config - Full domain configuration
 * @param stages - Optional complete stage inventory, to reject duplicate zone ownership
 * @returns Validated normalized entries
 */
export const getDnsDelegations = (
  config: DomainConfig,
  stages: readonly StageEnvironment[] = []
): readonly DnsDelegationEntry[] => {
  if (config.dnsDelegation?.enabled !== true) return [];
  const entries = config.dnsDelegation.entries;
  return entries.map((entry, index) => {
    const parentDomain = normalizeDnsName(entry.parentDomain);
    const childZoneName = normalizeDnsName(entry.childZoneName);
    if (
      !validName(parentDomain) ||
      !validName(childZoneName) ||
      !childZoneName.endsWith(`.${parentDomain}`)
    ) {
      throw new Error(
        `DNS delegation childZoneName '${entry.childZoneName}' must be a valid DNS name strictly below parentDomain '${entry.parentDomain}'.`
      );
    }
    if (!/^\d{12}$/.test(entry.parentAccountId))
      throw new Error(
        "DNS delegation parentAccountId must contain exactly 12 decimal digits."
      );
    if (!/^Z[A-Z0-9]+$/.test(entry.parentHostedZoneId))
      throw new Error(
        "DNS delegation parentHostedZoneId must be an explicit hosted zone ID beginning with Z."
      );
    if (!/^[A-Za-z0-9+=,.@_-]{1,64}$/.test(entry.delegationRoleName))
      throw new Error(
        "DNS delegation delegationRoleName must be a valid IAM role name (1-64 characters, no path)."
      );
    if (
      entry.trustedChildAccountIds.length === 0 ||
      entry.trustedChildAccountIds.some(account => !/^\d{12}$/.test(account)) ||
      new Set(entry.trustedChildAccountIds).size !==
        entry.trustedChildAccountIds.length
    ) {
      throw new Error(
        "DNS delegation trustedChildAccountIds must contain unique 12-digit account IDs."
      );
    }
    if (
      entries
        .slice(0, index)
        .some(
          previous => normalizeDnsName(previous.childZoneName) === childZoneName
        )
    )
      throw new Error(
        `Duplicate DNS delegation childZoneName '${childZoneName}'.`
      );
    const role = `${entry.parentAccountId}/${entry.delegationRoleName}`;
    if (
      entries
        .slice(0, index)
        .some(
          previous =>
            `${previous.parentAccountId}/${previous.delegationRoleName}` ===
            role
        )
    )
      throw new Error(
        `Duplicate DNS delegation role '${role}'; use a separate role for each child zone.`
      );
    if (
      stages.filter(stage =>
        entry.trustedChildAccountIds.includes(stage.accountId)
      ).length > 1
    )
      throw new Error(
        `DNS delegation '${childZoneName}' matches multiple stages; configure only one child-zone owner.`
      );
    return { ...entry, parentDomain, childZoneName };
  });
};
