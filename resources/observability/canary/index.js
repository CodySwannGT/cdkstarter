"use strict";

/**
 * Synthetic canary — fetches every configured public endpoint and throws if
 * any is unreachable or returns a non-2xx/3xx status. The Lambda Errors
 * metric (and its alarm) is the signal; the thrown message carries the
 * per-URL failure detail into CloudWatch Logs for diagnosis.
 */

exports.handler = async () => {
  const urls = JSON.parse(process.env.CANARY_URLS || "[]");
  const failures = [];

  await Promise.all(
    urls.map(async url => {
      try {
        const res = await fetch(url, {
          redirect: "follow",
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) {
          failures.push(`${url} -> HTTP ${res.status}`);
        }
      } catch (err) {
        failures.push(`${url} -> ${err.name}: ${err.message}`);
      }
    })
  );

  if (failures.length > 0) {
    throw new Error(`Canary failures: ${failures.join("; ")}`);
  }
  return { ok: true, checked: urls.length };
};
