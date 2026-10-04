/** The CI composition changes repository placeholders, never proof policy. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  comparisonBase,
  repositoryTrackingConfig,
  withBaseDeployBranches,
} from "../scripts/check-starter-pr-traceability.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generic = {
  tracker: "github",
  github: {
    org: "your-org",
    repo: "your-project",
    labels: { done: "status:done" },
  },
  workItem: { verify: "full" },
  deploy: { branches: { production: "main" } },
};

test("CI repository replaces both placeholders without changing verification policy", () => {
  const original = JSON.stringify(generic);
  const actual = repositoryTrackingConfig(generic, "example/fixture");
  assert.deepEqual(actual, {
    ...generic,
    github: { ...generic.github, org: "example", repo: "fixture" },
  });
  assert.equal(JSON.stringify(generic), original);
  assert.equal(actual.workItem.verify, "full");
});

test("real configured scope and explicit queue repository remain authoritative", () => {
  const scoped = {
    ...generic,
    github: { org: "real-owner", repo: "real-project" },
  };
  assert.equal(repositoryTrackingConfig(scoped, "example/fixture"), scoped);
  const queued = {
    ...generic,
    github: { ...generic.github, queueRepo: "real-owner/queue" },
  };
  assert.equal(repositoryTrackingConfig(queued, "example/fixture"), queued);
});

test("missing or malformed CI repository and partial placeholder identity fail closed", () => {
  for (const value of [
    undefined,
    "",
    "owner",
    "owner/repo/extra",
    "owner/..",
    "owner/repo\n",
  ]) {
    assert.throws(
      () => repositoryTrackingConfig(generic, value),
      /GITHUB_REPOSITORY/
    );
  }
  assert.throws(
    () =>
      repositoryTrackingConfig(
        { ...generic, github: { org: "real-owner", repo: "your-project" } },
        "example/fixture"
      ),
    /partly configured/
  );
});

test("base selection matches canonical argv and environment fallback", () => {
  const environment = { LISA_PR_BASE_SHA: "environment-base" };
  assert.equal(comparisonBase([], environment), "environment-base");
  assert.equal(
    comparisonBase(["--base", "argv-base"], environment),
    "argv-base"
  );
  assert.equal(
    comparisonBase(["--base", "--head", "head"], environment),
    "environment-base"
  );
  assert.equal(comparisonBase(["--base"], environment), "environment-base");
  assert.equal(
    comparisonBase(["--base=unsupported"], environment),
    "environment-base"
  );
  assert.equal(
    comparisonBase(["--base", "first", "--base", "second"], environment),
    "first"
  );
});

test("an unreadable baseline grants no chain while preserving HEAD verification policy", () => {
  const configuration = {
    ...generic,
    deploy: { branches: { feature: "self-exemption" }, custom: true },
  };
  const actual = withBaseDeployBranches(configuration, "does-not-exist");
  assert.deepEqual(actual.deploy, { branches: {}, custom: true });
  assert.deepEqual(actual.workItem, generic.workItem);
  assert.deepEqual(configuration.deploy.branches, {
    feature: "self-exemption",
  });
});

for (const status of [0, 7]) {
  test(`real child exit ${status} propagates with exact CI range and cleaned private config`, () => {
    const directory = mkdtempSync(join(tmpdir(), "node-starter-traceability-"));
    try {
      mkdirSync(join(directory, "scripts"));
      writeFileSync(
        join(directory, ".lisa.config.json"),
        JSON.stringify(generic)
      );
      for (const args of [
        ["init", "-q"],
        ["add", ".lisa.config.json"],
        [
          "-c",
          "user.name=Fixture",
          "-c",
          "user.email=fixture@example.invalid",
          "-c",
          "core.hooksPath=/dev/null",
          "commit",
          "-qm",
          "fixture baseline",
        ],
      ]) {
        assert.equal(spawnSync("git", args, { cwd: directory }).status, 0);
      }
      const base = spawnSync("git", ["rev-parse", "HEAD"], {
        cwd: directory,
        encoding: "utf8",
      }).stdout.trim();
      const headConfiguration = {
        ...generic,
        deploy: { branches: { production: "main", feature: "self-exemption" } },
      };
      writeFileSync(
        join(directory, ".lisa.config.json"),
        JSON.stringify(headConfiguration)
      );
      // This fixture child observes the composition protocol, not tracker validity.
      writeFileSync(
        join(directory, "scripts/lisa-work-item.mjs"),
        `
import { readFileSync, statSync, writeFileSync } from 'node:fs';
const file = process.env.LISA_TRACKING_CONFIG_FILE;
writeFileSync('observed.json', JSON.stringify({
  args: process.argv.slice(2), file, mode: statSync(file).mode & 0o777,
  config: JSON.parse(readFileSync(file, 'utf8')),
  base: process.env.LISA_PR_BASE_SHA, head: process.env.LISA_PR_HEAD_SHA,
  pr: process.env.LISA_PR_NUMBER,
}));
process.exit(${status});
`
      );
      const child = spawnSync(
        process.execPath,
        [
          join(root, "scripts/check-starter-pr-traceability.mjs"),
          "--body-file",
          "fixture-body.md",
          ...(status === 0 ? ["--base", base] : []),
        ],
        {
          cwd: directory,
          env: {
            ...process.env,
            GITHUB_REPOSITORY: "example/fixture",
            LISA_PR_BASE_SHA:
              status === 0 ? "unreadable-environment-base" : base,
            LISA_PR_HEAD_SHA: "b".repeat(40),
            LISA_PR_NUMBER: "123",
          },
          encoding: "utf8",
          timeout: 30_000,
        }
      );
      assert.equal(child.error, undefined);
      assert.equal(child.status, status, child.stderr);
      const observed = JSON.parse(
        readFileSync(join(directory, "observed.json"), "utf8")
      );
      assert.deepEqual(observed.args, [
        "validate-pr",
        "--body-file",
        "fixture-body.md",
        ...(status === 0 ? ["--base", base] : []),
      ]);
      assert.equal(observed.mode, 0o600);
      assert.equal(
        observed.base,
        status === 0 ? "unreadable-environment-base" : base
      );
      assert.deepEqual(observed.config.deploy.branches, { production: "main" });
      assert.equal(observed.head, "b".repeat(40));
      assert.equal(observed.pr, "123");
      assert.equal(observed.config.workItem.verify, "full");
      assert.equal(observed.config.github.repo, "fixture");
      assert.equal(existsSync(observed.file), false);
      assert.deepEqual(
        JSON.parse(readFileSync(join(directory, ".lisa.config.json"), "utf8")),
        headConfiguration
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
