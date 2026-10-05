/** Offline contracts for opt-in standard queues and imported workers. */
import type {
  QueueDefinition,
  QueuesConfig,
  QueueWorkerConfig,
} from "../lib/types";

/** Deployment identity used to reject unsupported cross-environment bindings. */
export interface QueueScope {
  /** Owning stage name used in default queue names. */
  readonly stageName: string;
  /** Concrete owning account for bound workers. */
  readonly account: string;
  /** Concrete owning region for bound workers. */
  readonly region: string;
}

/**
 * Resolve a source queue's explicit or default physical name.
 * @param definition - Keyed queue settings
 * @param stageName - Environment name
 * @returns Source queue name
 */
export const queueName = (
  definition: QueueDefinition,
  stageName: string
): string => definition.queueName ?? `${stageName}-${definition.key}`;

/**
 * Fail with a field-specific integer service constraint.
 * @param name - Qualified field name
 * @param value - Configured or default value
 * @param min - Inclusive minimum
 * @param max - Inclusive maximum
 */
const integerRange = (
  name: string,
  value: number,
  min: number,
  max: number
): void => {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}.`);
  }
};

/**
 * Validate the literal function/role identity and timing contract.
 * @param definition - Queue configuration
 * @param worker - Explicit existing worker
 * @param scope - Owning deployment identity
 */
const validateWorker = (
  definition: QueueDefinition,
  worker: QueueWorkerConfig,
  scope: QueueScope
): void => {
  const partition = scope.region.startsWith("cn-")
    ? "aws-cn"
    : scope.region.startsWith("us-gov-")
      ? "aws-us-gov"
      : "aws";
  const fn =
    /^arn:(aws|aws-cn|aws-us-gov):lambda:([a-z0-9-]+):(\d{12}):function:([A-Za-z0-9_-]{1,64})$/.exec(
      worker.functionArn
    );
  const minimum = 6 * worker.timeoutSeconds;
  const flags = [worker.alarms?.errors, worker.alarms?.throttles];
  const role =
    /^arn:(aws|aws-cn|aws-us-gov):iam::(\d{12}):role\/([A-Za-z0-9_+=,.@/-]+)$/.exec(
      worker.executionRoleArn
    );
  if (
    !fn ||
    !role ||
    fn[1] !== partition ||
    role[1] !== partition ||
    fn[2] !== scope.region ||
    fn[3] !== scope.account ||
    role[2] !== scope.account
  ) {
    throw new Error(
      `queues.${definition.key}.worker requires an unqualified function ARN and execution role ARN in the owning account, region and partition.`
    );
  }
  integerRange(
    `queues.${definition.key}.worker.timeoutSeconds`,
    worker.timeoutSeconds,
    1,
    900
  );
  if ((definition.visibilityTimeoutSeconds ?? 180) < minimum) {
    throw new Error(
      `queues.${definition.key}.visibilityTimeoutSeconds must be at least ${minimum} seconds (six worker timeouts).`
    );
  }
  if (flags.some(flag => flag !== undefined && typeof flag !== "boolean")) {
    throw new Error(
      `queues.${definition.key}.worker.alarms flags must be booleans.`
    );
  }
};

/**
 * Validate a single queue's supported service ranges and destinations.
 * @param definition - Queue configuration
 * @param scope - Owning deployment identity
 */
const validateDefinition = (
  definition: QueueDefinition,
  scope: QueueScope
): void => {
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(definition.key)) {
    throw new Error(
      "queues definitions require stable ASCII keys starting with a letter (maximum 64 characters)."
    );
  }
  const name = queueName(definition, scope.stageName);
  if (!/^[A-Za-z0-9_-]{1,76}$/.test(name)) {
    throw new Error(
      `queues.${definition.key}.queueName must be a standard queue name of 1..76 ASCII letters, digits, underscores or hyphens, leaving room for -dlq.`
    );
  }
  integerRange(
    `queues.${definition.key}.visibilityTimeoutSeconds`,
    definition.visibilityTimeoutSeconds ?? 180,
    0,
    43200
  );
  integerRange(
    `queues.${definition.key}.retentionSeconds`,
    definition.retentionSeconds ?? 345600,
    60,
    1209600
  );
  integerRange(
    `queues.${definition.key}.deadLetterRetentionSeconds`,
    definition.deadLetterRetentionSeconds ?? 1209600,
    60,
    1209600
  );
  integerRange(
    `queues.${definition.key}.maxReceiveCount`,
    definition.maxReceiveCount ?? 3,
    1,
    1000
  );
  integerRange(
    `queues.${definition.key}.backlogAgeThresholdSeconds`,
    definition.backlogAgeThresholdSeconds ?? 300,
    1,
    Number.MAX_SAFE_INTEGER
  );
  if (
    definition.notificationTopicArns &&
    (!Array.isArray(definition.notificationTopicArns) ||
      !definition.notificationTopicArns.every(arn =>
        /^arn:(aws|aws-cn|aws-us-gov):sns:[a-z0-9-]+:\d{12}:[A-Za-z0-9_-]{1,256}$/.test(
          arn
        )
      ))
  ) {
    throw new Error(
      `queues.${definition.key}.notificationTopicArns must contain existing standard SNS topic ARNs.`
    );
  }
  if (definition.worker) validateWorker(definition, definition.worker, scope);
};

/**
 * Validate at both loader and owning constructor before producing resources.
 * @param config - Optional module configuration
 * @param scope - Owning deployment identity
 */
export const validateQueues = (
  config: QueuesConfig | undefined,
  scope: QueueScope
): void => {
  if (config === undefined) return;
  if (typeof config.enabled !== "boolean")
    throw new Error("queues.enabled must be a boolean.");
  if (!config.enabled) return;
  const definitions = config.definitions;
  if (!Array.isArray(definitions) || definitions.length === 0) {
    throw new Error("queues.enabled requires nonempty definitions.");
  }
  const keys = definitions.map(definition => definition.key);
  const names = definitions.flatMap(definition => {
    const name = queueName(definition, scope.stageName);
    return [name, `${name}-dlq`];
  });
  definitions.forEach(definition => validateDefinition(definition, scope));
  if (
    new Set(keys).size !== keys.length ||
    new Set(names).size !== names.length
  ) {
    throw new Error(
      "queues definitions must have unique keys and unique source/DLQ physical names."
    );
  }
};
