"use strict";

/** Pure/injected SMS counter evaluation and conditional effect coordination. */

/**
 * Bound a service error without copying potentially sensitive response text.
 * @param {object} error - SDK error
 * @returns {string} Safe known category
 */
const errorCategory = error =>
  [
    "TimeoutError",
    "ThrottledException",
    "Throttled",
    "AuthorizationErrorException",
    "AuthorizationError",
    "InvalidParameterException",
    "InvalidParameter",
    "InternalErrorException",
    "NetworkingError",
  ].includes(error?.name)
    ? error.name
    : "ServiceError";

/**
 * Convert a positive finite amount to a plain decimal without an invented floor.
 * @param {number} value - Currency amount
 * @returns {string} Exact JavaScript decimal representation, without exponent
 */
const decimal = value => {
  if (!Number.isFinite(value) || value <= 0)
    throw new Error("invalid-positive-limit");
  const [digits, exponent] = String(value).toLowerCase().split("e");
  if (exponent === undefined) return digits;
  const [whole, fraction = ""] = digits.split(".");
  const joined = whole + fraction;
  const position = whole.length + Number(exponent);
  if (position <= 0) return `0.${"0".repeat(-position)}${joined}`;
  if (position >= joined.length)
    return joined + "0".repeat(position - joined.length);
  return `${joined.slice(0, position)}.${joined.slice(position)}`;
};

/**
 * Derive bounded estimates from timestamped same-month cumulative readings.
 * @param {object[]} points - CloudWatch cumulative counter points
 * @param {Date} now - Current UTC clock
 * @returns {object} Observed MTD and conservative day/surge estimates
 */
const spendEstimates = (points, now) => {
  const current = now.getTime();
  const day = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const month = now.toISOString().slice(0, 7);
  const ordered = points
    .map(point => ({
      timestamp: new Date(point.timestamp).getTime(),
      value: point.value,
    }))
    .sort((left, right) => left.timestamp - right.timestamp);
  if (
    ordered.length < 2 ||
    ordered.some(
      (point, index) =>
        !Number.isFinite(point.timestamp) ||
        !Number.isFinite(point.value) ||
        point.value < 0 ||
        point.timestamp > current ||
        new Date(point.timestamp).toISOString().slice(0, 7) !== month ||
        (index > 0 &&
          (point.timestamp <= ordered[index - 1].timestamp ||
            point.value < ordered[index - 1].value))
    )
  ) {
    throw new Error("spend-counter-unavailable-or-reset");
  }
  const latest = ordered.at(-1);
  const anchor = ordered.find(
    point => point.timestamp >= day && point.timestamp <= day + 600000
  );
  const preceding = ordered.find(
    point => point.timestamp === latest.timestamp - 300000
  );
  if (
    current - latest.timestamp > 600000 ||
    !anchor ||
    !preceding ||
    latest.timestamp < anchor.timestamp
  ) {
    throw new Error("spend-window-missing-or-stale");
  }
  return {
    mtdUsd: latest.value,
    dailyUsd: latest.value - anchor.value,
    surgeUsd: latest.value - preceding.value,
    sampleAt: new Date(latest.timestamp).toISOString(),
    dayAnchorAt: new Date(anchor.timestamp).toISOString(),
    surgeAnchorAt: new Date(preceding.timestamp).toISOString(),
  };
};

/**
 * Persist a versioned transition; uncertainty never silently clears an operation.
 * @param {object} deps - Injected runtime services
 * @param {object} previous - Prior strongly consistent state
 * @param {object} changes - Next state fields
 * @returns {Promise<object|null>} Saved state, or null on contention
 */
const transition = async (deps, previous, changes) => {
  const next = {
    ...previous,
    ...changes,
    version: (previous?.version ?? 0) + 1,
  };
  try {
    return (await deps.store.compareAndSet(previous, next)) ? next : null;
  } catch {
    throw new Error("state-write-failed; manual-reconciliation-required");
  }
};

/**
 * Read the current preference without treating missing/nonpositive data as zero.
 * @param {object} deps - Injected SNS client adapter
 * @returns {Promise<number>} Observed positive preference
 */
const currentPreference = async deps => {
  try {
    const current = Number(await deps.getPreference());
    if (!Number.isFinite(current) || current <= 0)
      throw new Error("invalid-current-preference");
    return current;
  } catch (error) {
    throw new Error(`preference-read:${errorCategory(error)}`);
  }
};

/**
 * Issue at most one mutation attempt; the SNS API has no idempotency token.
 * @param {object} deps - Injected services
 * @param {object} intent - Persisted operation intent
 * @returns {Promise<void>} Successful API acknowledgement
 */
const applyPreference = async (deps, intent) => {
  try {
    await deps.setPreference(intent.targetLimit);
  } catch (error) {
    await transition(deps, intent, {
      status: "NEEDS_RECONCILIATION",
      failureCategory: errorCategory(error),
    });
    throw new Error(
      `preference-update:${errorCategory(error)}; manual-reconciliation-required`
    );
  }
};

/**
 * Deliver pending metadata-only notification; effect state remains on failure.
 * @param {object} config - Explicit account settings
 * @param {object} deps - Injected services
 * @param {object} state - Persisted trip
 * @returns {Promise<object>} Current state
 */
const notifyTrip = async (config, deps, state) => {
  if (!state.notificationPending) return state;
  try {
    await deps.notify({
      kind: "sms-breaker-tripped",
      account: config.account,
      region: config.region,
      operationId: state.operationId,
      targetLimit: state.targetLimit,
      configuredCeiling: state.configuredCeiling,
      sampleAt: state.sampleAt,
    });
  } catch {
    throw new Error("notification-failed; trip-retained");
  }
  const saved = await transition(deps, state, { notificationPending: false });
  if (!saved) throw new Error("notification-state-contended; trip-retained");
  return saved;
};

/**
 * Reconcile uncertain effects by exact readback, never by repeating Set.
 * @param {object} config - Explicit account settings
 * @param {object} deps - Injected services
 * @param {object} state - Persisted operation
 * @returns {Promise<object>} Retained/reconciled effect state
 */
const reconcile = async (config, deps, state) => {
  if (state.status === "TRIPPED") return notifyTrip(config, deps, state);
  if (state.status === "RECOVERING")
    throw new Error(
      "manual-reconciliation-required; explicit-recovery-readback-needed"
    );
  const current = await currentPreference(deps);
  if (current !== state.targetLimit)
    throw new Error(
      "manual-reconciliation-required; preference-does-not-match-intent"
    );
  const saved = await transition(deps, state, { status: "TRIPPED" });
  if (!saved) throw new Error("reconciliation-contended");
  return saved.status === "TRIPPED" ? notifyTrip(config, deps, saved) : saved;
};

/**
 * Complete a claimed trip without a second independent preference attempt.
 * @param {object} deps - Injected services
 * @param {object} intent - Claimed immutable target
 * @param {number} current - Observed preference
 * @returns {Promise<object|null>} Persisted completion
 */
const completeTrip = async (deps, intent, current) => {
  if (intent.targetLimit < current) await applyPreference(deps, intent);
  return transition(deps, intent, { status: "TRIPPED" });
};

/**
 * Read and validate retained state before any effect or reset.
 * @param {object} config - Owning identity
 * @param {object} deps - Injected strongly consistent store
 * @returns {Promise<object|undefined>} Valid persisted state
 */
const readState = async (config, deps) => {
  const state = await deps.store.read().catch(error => {
    throw new Error(`state-read:${errorCategory(error)}`);
  });
  if (
    state &&
    (!Number.isInteger(state.version) ||
      state.version < 1 ||
      ![
        "READY",
        "TRIPPING",
        "TRIPPED",
        "NEEDS_RECONCILIATION",
        "RECOVERING",
      ].includes(state.status) ||
      state.account !== config.account ||
      state.region !== config.region ||
      ![state.targetLimit, state.previousLimit, state.configuredCeiling].every(
        value => Number.isFinite(value) && value > 0
      ))
  )
    throw new Error("state-invalid; manual-reconciliation-required");
  return state;
};

/**
 * Claim a daily breach before touching the account preference.
 * @param {object} config - Explicit account settings
 * @param {object} deps - Injected services
 * @param {object} state - Previous state
 * @param {object} estimates - Fresh same-month estimates
 * @returns {Promise<object>} Persisted trip or contention receipt
 */
const trip = async (config, deps, state, estimates) => {
  const current = await currentPreference(deps);
  const target = Math.min(
    current,
    config.monthlyPreferenceUsd,
    estimates.mtdUsd
  );
  if (!Number.isFinite(target) || target <= 0)
    throw new Error("invalid-positive-limit");
  const intent = await transition(deps, state, {
    status: "TRIPPING",
    account: config.account,
    region: config.region,
    operationId: deps.operationId(),
    targetLimit: target,
    previousLimit: current,
    configuredCeiling: config.monthlyPreferenceUsd,
    sampleAt: estimates.sampleAt,
    notificationPending: true,
  });
  if (!intent) return { status: "CONTENDED" };
  const saved = await completeTrip(deps, intent, current);
  if (!saved)
    throw new Error("trip-state-contended; manual-reconciliation-required");
  return notifyTrip(config, deps, saved);
};

/**
 * Evaluate monitoring or perform a single conditionally owned daily-cap reduction.
 * @param {object} config - Explicit account/region/limit configuration
 * @param {object} deps - Injected clock, counter, state and SNS adapters
 * @returns {Promise<object>} Metadata-only observation/effect receipt
 */
const evaluate = async (config, deps) => {
  const state =
    config.mode === "enforce" ? await readState(config, deps) : undefined;
  const retained =
    state?.status === "TRIPPED"
      ? await notifyTrip(config, deps, state)
      : undefined;
  if (state && state.status !== "READY" && state.status !== "TRIPPED")
    return reconcile(config, deps, state);
  const points = await deps.readSpend().catch(error => {
    throw new Error(`counter-read:${errorCategory(error)}`);
  });
  const estimates = spendEstimates(points, deps.now());
  await deps.writeMetrics(estimates).catch(error => {
    throw new Error(`metric-write:${errorCategory(error)}`);
  });
  if (retained) return { ...retained, ...estimates };
  if (config.mode === "enforce" && estimates.dailyUsd > config.dailyCapUsd)
    return trip(config, deps, state, estimates);
  if (
    estimates.dailyUsd > config.dailyCapUsd ||
    estimates.surgeUsd > config.fiveMinuteSurgeUsd ||
    estimates.mtdUsd >
      config.monthlyPreferenceUsd * (config.warningPercent / 100)
  ) {
    try {
      await deps.notify({
        kind: "sms-spend-observed",
        account: config.account,
        region: config.region,
        ...estimates,
      });
    } catch {
      throw new Error("notification-failed; no-preference-change");
    }
  }
  return { status: "OBSERVED", ...estimates };
};

/**
 * Explicit recovery shares the same conditional operation ownership.
 * @param {object} config - Configured account ceiling
 * @param {object} request - Operator-selected identity and positive restore limit
 * @param {object} deps - Injected services
 * @returns {Promise<object>} Successful clear, only after acknowledged update
 */
const recover = async (config, request, deps) => {
  if (
    config.mode !== "enforce" ||
    request.account !== config.account ||
    request.region !== config.region
  )
    throw new Error("recovery-identity-or-ceiling-invalid");
  const state = await readState(config, deps);
  const limit = request.limit;
  if (
    config.mode !== "enforce" ||
    request.account !== config.account ||
    request.region !== config.region ||
    !Number.isFinite(limit) ||
    limit <= 0 ||
    limit > config.monthlyPreferenceUsd ||
    !state ||
    limit > state.previousLimit ||
    limit > state.configuredCeiling
  ) {
    throw new Error("recovery-identity-or-ceiling-invalid");
  }
  const current = await currentPreference(deps);
  if (request.reconcile === true) {
    if (
      state.status !== "RECOVERING" ||
      state.targetLimit !== limit ||
      current !== limit
    )
      throw new Error(
        "manual-reconciliation-required; recovery-readback-mismatch"
      );
    const saved = await transition(deps, state, {
      status: "READY",
      notificationPending: false,
    });
    if (!saved) throw new Error("recovery-reconciliation-contended");
    return saved;
  }
  if (state.status !== "TRIPPED")
    throw new Error(
      "manual-reconciliation-required; recovery-needs-confirmed-trip"
    );
  const intent = await transition(deps, state, {
    status: "RECOVERING",
    operationId: deps.operationId(),
    targetLimit: limit,
    notificationPending: false,
  });
  if (!intent) throw new Error("recovery-contended");
  try {
    await deps.setPreference(limit);
  } catch (error) {
    // Retain RECOVERING so exact readback can reconcile recovery, not mislabel it as a trip.
    throw new Error(
      `preference-update:${errorCategory(error)}; recovery-intent-retained`
    );
  }
  const saved = await transition(deps, intent, { status: "READY" });
  if (!saved)
    throw new Error("recovery-state-contended; manual-reconciliation-required");
  return saved;
};

module.exports = { decimal, spendEstimates, evaluate, recover };
