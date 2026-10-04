/** Non-vacuous CLI controls for the tooling adopted from Lisa. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Fixture-owned files are swept on success and failure. */
function fixture(body) {
  const directory = mkdtempSync(join(tmpdir(), "node-starter-provers-"));
  try {
    body(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function run(directory, command, args) {
  const result = spawnSync(command, args, {
    cwd: directory,
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.error, undefined, result.stderr + result.stdout);
  return result;
}

function prover(directory, name, args = []) {
  return run(directory, process.execPath, [
    join(root, "scripts", name),
    ...args,
  ]);
}

function put(directory, file, contents) {
  const path = join(directory, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function git(directory, args) {
  const result = run(directory, "git", args);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function repository(directory) {
  git(directory, ["init", "-q"]);
  git(directory, ["config", "user.name", "Fixture"]);
  git(directory, ["config", "user.email", "fixture@example.invalid"]);
}

test("conflict prover accepts tracked source and rejects a real conflict block", () => {
  fixture(directory => {
    repository(directory);
    put(directory, "canary.ts", "export const answer = 42;\n");
    git(directory, ["add", "."]);
    const clean = prover(directory, "check-conflict-markers.mjs", [
      "--root",
      directory,
      "--json",
    ]);
    assert.equal(clean.status, 0, clean.stdout + clean.stderr);
    put(
      directory,
      "canary.ts",
      [
        "<<<<<<< HEAD",
        "export const answer = 42;",
        "=======",
        "export const answer = 0;",
        ">>>>>>> other",
        "",
      ].join("\n")
    );
    git(directory, ["add", "canary.ts"]);
    const conflict = prover(directory, "check-conflict-markers.mjs", [
      "--root",
      directory,
      "--json",
    ]);
    assert.equal(conflict.status, 1, conflict.stdout + conflict.stderr);
    assert.match(conflict.stdout, /canary\.ts/);
  });
});

test("conflict prover refuses an empty tracked collection", () => {
  fixture(directory => {
    repository(directory);
    const empty = prover(directory, "check-conflict-markers.mjs", [
      "--root",
      directory,
      "--json",
    ]);
    assert.equal(empty.status, 2, empty.stdout + empty.stderr);
  });
});

test("floor collision prover accepts a compatible floor and rejects a weaker direct pin", () => {
  fixture(directory => {
    const manifest = join(directory, "package.json");
    writeFileSync(
      manifest,
      JSON.stringify({
        dependencies: { axios: "^1.20.0" },
        overrides: { axios: ">=1.20.0" },
      })
    );
    const clean = prover(directory, "lisa-floor-collisions.mjs", [
      "--manifest",
      manifest,
      "--json",
    ]);
    assert.equal(clean.status, 0, clean.stdout + clean.stderr);
    writeFileSync(
      manifest,
      JSON.stringify({
        dependencies: { axios: "1.18.0" },
        overrides: { axios: ">=1.20.0" },
      })
    );
    const weak = prover(directory, "lisa-floor-collisions.mjs", [
      "--manifest",
      manifest,
      "--json",
    ]);
    assert.equal(weak.status, 1, weak.stdout + weak.stderr);
    assert.match(weak.stdout, /axios/);
  });
});

test("threshold ratchet compares real Git revisions and rejects a lowered coverage floor", () => {
  fixture(directory => {
    repository(directory);
    put(
      directory,
      "vitest.thresholds.json",
      '{"global":{"branches":70,"functions":70,"lines":70,"statements":70}}\n'
    );
    git(directory, ["add", "."]);
    git(directory, ["commit", "-qm", "Coverage baseline"]);
    const base = git(directory, ["rev-parse", "HEAD"]);
    const clean = prover(directory, "check-threshold-ratchet.mjs", [
      "--base",
      base,
      "--head",
      "HEAD",
    ]);
    assert.equal(clean.status, 0, clean.stdout + clean.stderr);
    put(
      directory,
      "vitest.thresholds.json",
      '{"global":{"branches":69,"functions":70,"lines":70,"statements":70}}\n'
    );
    git(directory, ["add", "."]);
    git(directory, ["commit", "-qm", "Deliberately lower fixture floor"]);
    const lowered = prover(directory, "check-threshold-ratchet.mjs", [
      "--base",
      base,
      "--head",
      "HEAD",
    ]);
    assert.equal(lowered.status, 1, lowered.stdout + lowered.stderr);
  });
});

test("required-check guard rejects a caller configured to skip required integration", () => {
  fixture(directory => {
    const declaration = JSON.parse(
      readFileSync(join(root, ".github/required-checks.json"), "utf8")
    );
    put(directory, ".github/required-checks.json", JSON.stringify(declaration));
    put(
      directory,
      ".github/workflows/ci.yml",
      "name: CI\non: pull_request\njobs:\n  quality:\n    name: 🔍 Quality Checks\n    uses: CodySwannGT/lisa/.github/workflows/quality.yml@995f533b00d9b8a60256096bf6d28940164cd893\n    with:\n      skip_jobs: 'test:integration'\n"
    );
    const skipped = prover(directory, "check-skipped-required-checks.mjs", [
      directory,
      "--json",
    ]);
    assert.equal(skipped.status, 1, skipped.stdout + skipped.stderr);
    assert.match(skipped.stdout, /integration/);
  });
});

test("native runner refuses to report success with zero collected suites", () => {
  fixture(directory => {
    const empty = prover(directory, "lisa-test-node.mjs");
    assert.equal(empty.status, 1, empty.stdout + empty.stderr);
    assert.match(empty.stdout, /collected 0/);
  });
});
