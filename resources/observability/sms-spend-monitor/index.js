"use strict";
/** Managed Node22 runtime adapters; no local SDK dependency or preference retry. */
const { randomUUID } = require("node:crypto");
const { evaluate, recover, decimal } = require("./controller.cjs");

/**
 * Construct region-bound SDK adapters only in the actual Lambda runtime.
 * @param {object} config - Validated account settings
 * @param {string|undefined} tableName - Retained enforcement table
 * @param {object|undefined} modules - Optional SDK modules for command-shape tests
 * @returns {object} Injected controller services
 */
const runtimeDependencies = (config, tableName, modules) => {
  const {
    SNSClient,
    GetSMSAttributesCommand,
    SetSMSAttributesCommand,
    PublishCommand,
  } = modules?.sns ?? require("@aws-sdk/client-sns");
  const { CloudWatchClient, GetMetricStatisticsCommand, PutMetricDataCommand } =
    modules?.cloudwatch ?? require("@aws-sdk/client-cloudwatch");
  const { DynamoDBClient, GetItemCommand, UpdateItemCommand } =
    modules?.dynamodb ?? require("@aws-sdk/client-dynamodb");
  const sns = new SNSClient({ region: config.region, maxAttempts: 1 });
  const metrics = new CloudWatchClient({
    region: config.region,
    maxAttempts: 2,
  });
  const state = new DynamoDBClient({ region: config.region, maxAttempts: 1 });
  const key = { controller: { S: `sms#${config.account}#${config.region}` } };
  return {
    now: () => new Date(),
    operationId: () => randomUUID(),
    readSpend: async () => {
      const now = new Date();
      const start = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      );
      const result = await metrics.send(
        new GetMetricStatisticsCommand({
          Namespace: "AWS/SNS",
          MetricName: "SMSMonthToDateSpentUSD",
          StartTime: start,
          EndTime: now,
          Period: 300,
          Statistics: ["Maximum"],
        })
      );
      return (result.Datapoints ?? []).map(point => ({
        timestamp: point.Timestamp,
        value: point.Maximum,
      }));
    },
    writeMetrics: async estimates => {
      await metrics.send(
        new PutMetricDataCommand({
          Namespace: "Starter/SmsSpend",
          MetricData: [
            {
              MetricName: "DailyEstimateUsd",
              Value: estimates.dailyUsd,
              Timestamp: new Date(estimates.sampleAt),
              Unit: "None",
              Dimensions: [
                { Name: "Controller", Value: config.controllerName },
              ],
            },
            {
              MetricName: "SurgeEstimateUsd",
              Value: estimates.surgeUsd,
              Timestamp: new Date(estimates.sampleAt),
              Unit: "None",
              Dimensions: [
                { Name: "Controller", Value: config.controllerName },
              ],
            },
          ],
        })
      );
    },
    getPreference: async () => {
      const result = await sns.send(
        new GetSMSAttributesCommand({ attributes: ["MonthlySpendLimit"] })
      );
      return result.attributes?.MonthlySpendLimit;
    },
    setPreference: async value => {
      await sns.send(
        new SetSMSAttributesCommand({
          attributes: { MonthlySpendLimit: decimal(value) },
        })
      );
    },
    notify: async metadata => {
      await sns.send(
        new PublishCommand({
          TopicArn: config.notificationTopicArn,
          Message: JSON.stringify(metadata),
        })
      );
    },
    store: {
      read: async () => {
        const result = await state.send(
          new GetItemCommand({
            TableName: tableName,
            Key: key,
            ConsistentRead: true,
          })
        );
        if (!result.Item) return undefined;
        if (!result.Item.stateJson?.S || !result.Item.version?.N)
          throw new Error("state-record-invalid");
        const parsed = JSON.parse(result.Item.stateJson.S);
        if (Number(result.Item.version.N) !== parsed.version)
          throw new Error("state-record-version-mismatch");
        return parsed;
      },
      compareAndSet: async (previous, next) => {
        try {
          await state.send(
            new UpdateItemCommand({
              TableName: tableName,
              Key: key,
              UpdateExpression: "SET #version = :next, #state = :state",
              ConditionExpression: previous
                ? "#version = :previous"
                : "attribute_not_exists(#version)",
              ExpressionAttributeNames: {
                "#version": "version",
                "#state": "stateJson",
              },
              ExpressionAttributeValues: {
                ":next": { N: String(next.version) },
                ":state": { S: JSON.stringify(next) },
                ...(previous
                  ? { ":previous": { N: String(previous.version) } }
                  : {}),
              },
            })
          );
          return true;
        } catch (error) {
          if (error.name === "ConditionalCheckFailedException") return false;
          throw new Error("state-service-failed");
        }
      },
    },
  };
};

/**
 * Build a genuine handler with replaceable services for offline tests.
 * @param {object} config - Environment-owned configuration
 * @param {() => object} dependencies - Factory of injected clients
 * @returns {(event: object, context: object) => Promise<object>} Lambda handler
 */
const createHandler = (config, dependencies) => async (event, context) => {
  const identity = context.invokedFunctionArn?.split(":");
  if (identity?.[3] !== config.region || identity?.[4] !== config.account)
    throw new Error("sms-controller-invocation-identity-invalid");
  const deps = dependencies();
  if (event.action === "recover") return recover(config, event, deps);
  if (event.action !== "evaluate")
    throw new Error("sms-controller-action-invalid");
  return evaluate(config, deps);
};

/**
 * Run a source-owned controller using the runtime SDK and immutable config.
 * @param {object} event - Scheduled evaluation or explicit recovery request
 * @param {object} context - Actual Lambda invocation identity
 * @returns {Promise<object>} Metadata-only result
 */
exports.handler = async (event, context) => {
  const config = JSON.parse(process.env.SMS_CONFIG);
  return createHandler(config, () =>
    runtimeDependencies(config, process.env.STATE_TABLE)
  )(event, context);
};
exports.createHandler = createHandler;
exports.runtimeDependencies = runtimeDependencies;
