"use strict";

const FAILURE = "Secret copy failed";

/**
 * Restrict SDK classifications to a fixed whitelist; never retain messages.
 * @param {object} error - Potentially sensitive SDK error
 * @returns {string} Safe classification
 */
const safeCategory = error => {
  const allowed = new Set([
    "AccessDeniedException",
    "ParameterNotFound",
    "ResourceNotFoundException",
    "ThrottlingException",
    "InternalServiceError",
    "InvalidRequestException",
    "InvalidParameterException",
  ]);
  return allowed.has(error?.name) ? error.name : "SecretCopyError";
};

/**
 * Create the real handler with injectable transport collaborators.
 * @param {object} dependencies - SDK operations, identifier mappings and logger
 * @param {function(object): Promise<object>} dependencies.getParameter - Exact SSM operation
 * @param {function(object): Promise<object>} dependencies.getSecretValue - Exact destination read
 * @param {function(object): Promise<object>} dependencies.putSecretValue - Exact destination write
 * @param {object[]} dependencies.mappings - Trusted identifier-only mappings
 * @param {string} dependencies.physicalId - Stable scope-derived identifier
 * @param {object} dependencies.logger - Identifier-only logger
 * @returns {function(object): Promise<object>} Lifecycle/change event handler
 */
const createHandler = ({
  getParameter,
  getSecretValue,
  putSecretValue,
  mappings,
  physicalId,
  logger = console,
}) => {
  const copy = async mapping => {
    try {
      const source = await getParameter({
        Name: mapping.parameterName,
        WithDecryption: true,
      });
      const value = source?.Parameter?.Value;
      if (typeof value !== "string" || value.length === 0)
        throw new Error("EmptySource");
      const target = await getSecretValue({ SecretId: mapping.secretArn });
      if (typeof target?.SecretString !== "string")
        throw new Error("InvalidDestination");
      if (target.SecretString !== value) {
        await putSecretValue({
          SecretId: mapping.secretArn,
          SecretString: value,
        });
      }
      logger.info("Secret copy completed", { key: mapping.key });
    } catch (error) {
      logger.error(FAILURE, {
        key: mapping.key,
        category: safeCategory(error),
      });
      throw new Error(FAILURE);
    }
  };
  return async event => {
    if (event?.RequestType === "Delete")
      return { PhysicalResourceId: physicalId };
    if (event?.RequestType === "Create" || event?.RequestType === "Update") {
      for (const mapping of mappings) await copy(mapping);
      return { PhysicalResourceId: physicalId };
    }
    if (
      event?.source === "aws.ssm" &&
      event["detail-type"] === "Parameter Store Change" &&
      ["Create", "Update"].includes(event.detail?.operation)
    ) {
      for (const mapping of mappings.filter(
        candidate => candidate.parameterName === event.detail?.name
      ))
        await copy(mapping);
    }
    return { PhysicalResourceId: physicalId };
  };
};

/**
 * Use the Node Lambda runtime's AWS SDK v3, loading clients only on invocation.
 * @param {object} event - Provider or EventBridge event
 * @returns {Promise<object>} Stable identifier without Data
 */
exports.handler = async event => {
  try {
    const mappings = JSON.parse(process.env.MAPPINGS);
    const physicalId = process.env.PHYSICAL_ID;
    if (
      !Array.isArray(mappings) ||
      mappings.length === 0 ||
      typeof physicalId !== "string" ||
      !physicalId
    )
      throw new Error("InvalidConfiguration");
    if (event?.RequestType === "Delete")
      return { PhysicalResourceId: physicalId };
    const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");
    const {
      SecretsManagerClient,
      GetSecretValueCommand,
      PutSecretValueCommand,
    } = require("@aws-sdk/client-secrets-manager");
    const ssm = new SSMClient({});
    const secrets = new SecretsManagerClient({});
    return await createHandler({
      getParameter: input => ssm.send(new GetParameterCommand(input)),
      getSecretValue: input => secrets.send(new GetSecretValueCommand(input)),
      putSecretValue: input => secrets.send(new PutSecretValueCommand(input)),
      mappings,
      physicalId,
    })(event);
  } catch (error) {
    console.error(FAILURE, { category: safeCategory(error) });
    throw new Error(FAILURE);
  }
};
exports.createHandler = createHandler;
