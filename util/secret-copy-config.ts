/** Validate metadata-only mappings before creating any secret-copy resources. */
import type { SecretCopyConfig } from "../lib/types";

/**
 * Reject ambiguous mappings and anything that could widen exact IAM resources.
 * @param config - Optional secret-copy configuration
 */
export const validateSecretCopyConfig = (config?: SecretCopyConfig): void => {
  if (!config) return;
  if (!Array.isArray(config.mappings) || config.mappings.length === 0) {
    throw new Error("Secret copy requires nonempty mappings.");
  }
  for (const [index, mapping] of config.mappings.entries()) {
    if (
      !mapping ||
      Object.keys(mapping).some(
        key =>
          ![
            "key",
            "parameterName",
            "secretArn",
            "sourceKeyArn",
            "targetKeyArn",
          ].includes(key)
      ) ||
      typeof mapping.key !== "string" ||
      typeof mapping.parameterName !== "string" ||
      typeof mapping.secretArn !== "string" ||
      !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(mapping.key) ||
      config.mappings
        .slice(0, index)
        .some(
          previous =>
            previous.key === mapping.key ||
            previous.secretArn === mapping.secretArn
        ) ||
      mapping.parameterName.length > 1011 ||
      mapping.parameterName.split("/").length > 16 ||
      !/^\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+$/.test(
        mapping.parameterName
      ) ||
      /^\/(aws|ssm)/i.test(mapping.parameterName) ||
      !/^arn:(aws|aws-cn|aws-us-gov):secretsmanager:[a-z0-9-]+:\d{12}:secret:[A-Za-z0-9/_+=.@-]+-[A-Za-z0-9]{6}$/.test(
        mapping.secretArn
      )
    ) {
      throw new Error(
        "Secret copy requires unique mapping keys/destinations, absolute parameter names and complete secret ARNs."
      );
    }
    for (const keyArn of [mapping.sourceKeyArn, mapping.targetKeyArn]) {
      if (keyArn !== undefined && typeof keyArn !== "string")
        throw new Error(
          "Secret copy requires exact customer-managed KMS key ARNs."
        );
      const keyParts = keyArn?.split(":");
      const keyId = keyParts?.[5]?.replace(/^key\//, "");
      if (
        keyArn !== undefined &&
        (!/^arn:(aws|aws-cn|aws-us-gov):kms:[a-z0-9-]+:\d{12}:key\//.test(
          keyArn
        ) ||
          keyParts?.length !== 6 ||
          !keyId ||
          (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
            keyId
          ) &&
            !/^mrk-[a-f0-9]{32}$/.test(keyId)))
      ) {
        throw new Error(
          "Secret copy requires exact customer-managed KMS key ARNs."
        );
      }
    }
    if (
      config.synchronizeChanges !== undefined &&
      typeof config.synchronizeChanges !== "boolean"
    ) {
      throw new Error("Secret copy synchronizeChanges must be boolean.");
    }
  }
};
