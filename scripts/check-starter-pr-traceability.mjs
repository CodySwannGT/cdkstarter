#!/usr/bin/env node
// Host-owned composition for a starter whose tracked repository is generic.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { invokedAsScript } from "./lib/invoked-as-script.mjs";

/** Adapt only the starter placeholders; preserve real scope and queue policy. */
export function repositoryTrackingConfig(configuration, repository) {
  if (
    typeof repository !== "string" ||
    repository.trim() !== repository ||
    !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(repository) ||
    [".", ".."].includes(repository.split("/")[1])
  ) {
    throw new Error(
      "GITHUB_REPOSITORY must identify an actual owner/repository"
    );
  }
  const github = configuration.github;
  if (github?.queueRepo) return configuration;
  const placeholderOrg = github?.org === "your-org";
  const placeholderRepo = github?.repo === "your-project";
  if (placeholderOrg !== placeholderRepo) {
    throw new Error("Starter tracker identity is only partly configured");
  }
  if (!placeholderOrg) return configuration;
  const [org, repo] = repository.split("/");
  return { ...configuration, github: { ...github, org, repo } };
}

/** Match the canonical validator's option semantics, including flag fallback. */
export function comparisonBase(args, environment) {
  const index = args.indexOf("--base");
  const value = index < 0 ? undefined : args[index + 1];
  return value !== undefined && !value.startsWith("-")
    ? value
    : environment.LISA_PR_BASE_SHA;
}

/** A HEAD edit cannot declare itself protected through the temporary override. */
export function withBaseDeployBranches(configuration, base) {
  const result = base
    ? spawnSync("git", ["show", `${base}:.lisa.config.json`], {
        encoding: "utf8",
      })
    : undefined;
  let branches = {};
  if (result?.status === 0) {
    try {
      branches = JSON.parse(result.stdout)?.deploy?.branches ?? {};
    } catch {
      // Unreadable baseline policy grants no protected-chain exemptions.
    }
  }
  return {
    ...configuration,
    deploy: { ...configuration.deploy, branches },
  };
}

/** Invoke the unchanged validator with the workflow's exact range and policy. */
export function main(args = process.argv.slice(2)) {
  const configuration = JSON.parse(readFileSync(".lisa.config.json", "utf8"));
  const effective = withBaseDeployBranches(
    repositoryTrackingConfig(configuration, process.env.GITHUB_REPOSITORY),
    comparisonBase(args, process.env)
  );
  const directory = mkdtempSync(join(tmpdir(), "starter-pr-tracking-"));
  try {
    const file = join(directory, "config.json");
    writeFileSync(file, `${JSON.stringify(effective)}\n`, { mode: 0o600 });
    const child = spawnSync(
      process.execPath,
      ["scripts/lisa-work-item.mjs", "validate-pr", ...args],
      {
        stdio: "inherit",
        env: { ...process.env, LISA_TRACKING_CONFIG_FILE: file },
      }
    );
    if (child.error) console.error(child.error);
    return typeof child.status === "number" ? child.status : 1;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (invokedAsScript(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
