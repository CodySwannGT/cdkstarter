import type { AuroraConfig } from "../lib/types";

/**
 * Identify dedicated, non-administrative PostgreSQL runtime users.
 * @param username - Database role name used by runtime grants
 * @returns Whether the name is a supported runtime identifier
 */
export const isRuntimeDatabaseUsername = (username: string): boolean =>
  /^[a-z][a-z0-9_]{0,62}$/.test(username) &&
  username !== "clusteradmin" &&
  !username.startsWith("pg_") &&
  !username.startsWith("rds_");

/**
 * Validate optional runtime users before a cluster or runtime role is created.
 * @param aurora - Configured application and optional read-only usernames
 */
const validateAuroraUsernames = (aurora: AuroraConfig): void => {
  const users = [
    aurora.applicationUsername ?? "application",
    ...(aurora.readOnlyUsername !== undefined ? [aurora.readOnlyUsername] : []),
  ];
  if (
    !users.every(isRuntimeDatabaseUsername) ||
    new Set(users).size !== users.length
  ) {
    throw new Error(
      "Aurora application/read-only usernames must be distinct non-administrative PostgreSQL identifiers."
    );
  }
};

/**
 * Validate the starter's supported Aurora settings before creating resources.
 * @param aurora - Aurora capacity, instance and retention settings
 */
export const validateAuroraConfig = (aurora: AuroraConfig): void => {
  const { minCapacity, maxCapacity } = aurora;
  validateAuroraUsernames(aurora);
  if (!Number.isInteger(aurora.instanceCount) || aurora.instanceCount < 1) {
    throw new Error("Aurora instanceCount must be an integer of at least 1.");
  }
  if (
    ![minCapacity, maxCapacity].every(
      value => Number.isFinite(value) && value * 2 === Math.trunc(value * 2)
    ) ||
    minCapacity < 0.5 ||
    maxCapacity < 1 ||
    maxCapacity > 128 ||
    minCapacity > maxCapacity
  ) {
    throw new Error(
      "Aurora capacity must use half-ACU increments with 0.5 <= minCapacity <= maxCapacity and 1 <= maxCapacity <= 128."
    );
  }
  if (
    !Number.isInteger(aurora.backupRetentionDays) ||
    aurora.backupRetentionDays < 1 ||
    aurora.backupRetentionDays > 35
  ) {
    throw new Error(
      "Aurora backupRetentionDays must be an integer from 1 to 35."
    );
  }
  if (![1, 3, 7, 14, 30, 90, 180, 365].includes(aurora.logRetentionDays)) {
    throw new Error(
      "Aurora logRetentionDays must be one of 1, 3, 7, 14, 30, 90, 180, 365."
    );
  }
  if (
    aurora.engineVersion !== undefined &&
    !/^[1-9]\d*\.\d+$/.test(aurora.engineVersion)
  ) {
    throw new Error(
      "Aurora engineVersion must be a PostgreSQL major.minor version such as 16.6; verify region support before deployment."
    );
  }
};
