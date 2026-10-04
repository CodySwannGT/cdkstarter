/** Exercise the published tooling boundary without recursing this suite. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const root = resolve(__dirname, "../..");
const lisa = join(root, "node_modules/@codyswann/lisa");
interface Manifest {
  version: string;
  engines: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  overrides: Record<string, string>;
  scripts: Record<string, string>;
}
const json = (file: string): Manifest =>
  JSON.parse(readFileSync(file, "utf8")) as Manifest;

/** All fixture changes, temporary caches and child output stay disposable. */
const fixture = (body: (directory: string) => void): void => {
  const directory = mkdtempSync(join(tmpdir(), "starter-lisa-adoption-"));
  try {
    body(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const put = (directory: string, file: string, contents: string): void => {
  const path = join(directory, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
};

/** Bound child lifetime and keep operator credentials out of fixture applies. */
const run = (directory: string, args: string[], command = process.execPath) => {
  const temporary = join(directory, ".fixture-tmp");
  mkdirSync(temporary, { recursive: true });
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !key.startsWith("AWS_") &&
        !key.startsWith("CDK_") &&
        !key.startsWith("GITHUB_") &&
        !key.startsWith("GH_") &&
        key !== "CLAUDE_CONFIG_DIR" &&
        key !== "LISA_WORK_ITEM_CONTEXT"
    )
  );
  const result = spawnSync(command, args, {
    cwd: directory,
    env: {
      ...environment,
      TMPDIR: temporary,
      TMP: temporary,
      TEMP: temporary,
      NODE_COMPILE_CACHE: join(temporary, "node-compile-cache"),
      CI: "1",
      LISA_BOOTSTRAP: "1",
      LISA_AUTO_UPDATE: "0",
      // Codex emits only project files. Exclude user-installed Claude commands;
      // this selects executables and does not claim a filesystem sandbox.
      PATH: `${join(directory, ".fixture-bin")}:${dirname(process.execPath)}:/usr/bin:/bin`,
    },
    encoding: "utf8",
    timeout: 240_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  expect(result.error, result.stderr + result.stdout).toBeUndefined();
  return result;
};

/** Receipts and backups are intentionally nondeterministic apply products. */
const snapshot = (directory: string, prefix = ""): Record<string, string> =>
  Object.fromEntries(
    readdirSync(join(directory, prefix), { withFileTypes: true }).flatMap(
      entry => {
        const path = join(prefix, entry.name);
        if (
          [
            ".git",
            "node_modules",
            ".fixture-bin",
            ".fixture-tmp",
            ".lisabak",
            ".lisa-backups",
          ].includes(entry.name) ||
          path === ".lisa/apply-receipt.json"
        ) {
          return [];
        }
        return entry.isDirectory()
          ? Object.entries(snapshot(directory, path))
          : [
              [
                path,
                createHash("sha256")
                  .update(readFileSync(join(directory, path)))
                  .digest("hex"),
              ],
            ];
      }
    )
  );

describe("starter Lisa adoption", () => {
  it("routes required host tests through managed executors and retains CDK security", () => {
    const manifest = json(join(root, "package.json"));
    expect(manifest.engines.node).toBe("22.23.3");
    expect(manifest.dependencies["aws-cdk-lib"]).toBe("2.272.0");
    expect(manifest.dependencies["@aws-cdk/aws-amplify-alpha"]).toBe(
      "2.272.0-alpha.0"
    );
    expect(manifest.scripts["test:unit"]).toContain("test:unit:lisa");
    expect(manifest.scripts["test:cov"]).toContain("test:cov:lisa");
    expect(manifest.scripts["test:integration"]).toBe(
      "node scripts/test-integration.mjs"
    );
    expect(manifest.scripts["test:integration:lisa"]).not.toContain(
      "passWithNoTests"
    );
    expect(
      readFileSync(join(root, ".github/workflows/ci.yml"), "utf8")
    ).toContain("quality.yml@995f533b00d9b8a60256096bf6d28940164cd893");
    expect(existsSync(join(root, ".github/workflows/lisa-update.yml"))).toBe(
      false
    );
  });

  it("applies the public release twice while preserving host defaults and customizations", () => {
    expect(json(join(lisa, "package.json")).version).toBe("4.69.1");
    fixture(directory => {
      put(
        directory,
        "package.json",
        JSON.stringify(
          {
            name: "starter-adoption-fixture",
            version: "1.0.0",
            private: true,
            engines: { node: "22.21.1" },
            scripts: { "host:sentinel": "node -e 'process.exit(0)'" },
            dependencies: {
              "aws-cdk-lib": "2.272.0",
              "@aws-cdk/aws-amplify-alpha": "2.272.0-alpha.0",
              constructs: "^10.4.5",
            },
            devDependencies: {
              "@codyswann/lisa": "4.69.1",
              "aws-cdk": "^2.1132.0",
            },
            overrides: {
              "brace-expansion@^1.0.0": "1.1.21",
              "brace-expansion@^2.0.0": "2.1.7",
              "brace-expansion@^5.0.0": "5.0.12",
            },
          },
          null,
          2
        )
      );
      put(directory, "cdk.json", '{"app":"node app.js"}\n');
      put(directory, "AGENTS.md", "Host customization sentinel.\n");
      put(
        directory,
        "vitest.config.local.ts",
        "export default { test: { name: 'host-sentinel' } };\n"
      );
      put(
        directory,
        ".claude/rules/host-sentinel.md",
        "Preserve the host rule.\n"
      );
      put(
        directory,
        ".lisa.config.json",
        '{"harness":"codex","tracker":"github","github":{"org":"example","repo":"fixture"}}\n'
      );
      put(
        directory,
        ".gitignore",
        "node_modules/\n.fixture-tmp/\n.fixture-bin/\n.lisabak/\n.lisa-backups/\n.lisa/apply-receipt.json\n"
      );
      put(
        directory,
        ".fixture-bin/gh",
        "#!/bin/sh\necho 'Unexpected GitHub command in offline fixture' >&2\nexit 97\n"
      );
      chmodSync(join(directory, ".fixture-bin/gh"), 0o755);
      symlinkSync(
        join(root, "node_modules"),
        join(directory, "node_modules"),
        "dir"
      );
      for (const args of [
        ["init", "-q"],
        ["config", "user.email", "fixture@example.invalid"],
        ["config", "user.name", "Fixture"],
        ["add", "."],
        ["commit", "-qm", "Fixture baseline"],
      ]) {
        expect(run(directory, args, "git").status).toBe(0);
      }
      const applyArgs = [
        join(lisa, "dist/index.js"),
        "apply",
        directory,
        "--yes",
        "--no-update-check",
        "--harness=codex",
      ];
      expect(existsSync(join(root, "node_modules/.bin/claude"))).toBe(false);
      const selection = run(directory, ["-c", "command -v claude"], "/bin/sh");
      expect(
        selection.status,
        "Real Claude must be unavailable in fixture PATH"
      ).not.toBe(0);
      const first = run(directory, applyArgs);
      expect(first.status, first.stdout + first.stderr).toBe(0);
      const manifest = json(join(directory, "package.json"));
      expect(manifest.engines.node).toBe("22.21.1");
      expect(manifest.dependencies["aws-cdk-lib"]).toBe("2.272.0");
      expect(manifest.dependencies["@aws-cdk/aws-amplify-alpha"]).toBe(
        "2.272.0-alpha.0"
      );
      expect(manifest.devDependencies["aws-cdk"]).toBe("^2.1132.0");
      expect(manifest.overrides["brace-expansion@^5.0.0"]).toBe("5.0.12");
      expect(manifest.scripts["host:sentinel"]).toBe(
        "node -e 'process.exit(0)'"
      );
      expect(readFileSync(join(directory, "AGENTS.md"), "utf8")).toContain(
        "Host customization sentinel."
      );
      expect(
        readFileSync(join(directory, ".claude/rules/host-sentinel.md"), "utf8")
      ).toBe("Preserve the host rule.\n");
      expect(
        readFileSync(join(directory, "vitest.config.local.ts"), "utf8")
      ).toContain("host-sentinel");
      expect(
        existsSync(join(directory, "scripts/check-conflict-markers.mjs"))
      ).toBe(true);
      expect(
        existsSync(join(directory, ".github/workflows/lisa-update.yml"))
      ).toBe(false);
      // Fixture-only checkpoints do not execute the source project's hooks.
      expect(run(directory, ["add", "."], "git").status).toBe(0);
      expect(
        run(
          directory,
          ["-c", "core.hooksPath=/dev/null", "commit", "-qm", "First adoption"],
          "git"
        ).status
      ).toBe(0);
      expect(run(directory, ["status", "--porcelain"], "git").stdout).toBe("");
      const before = snapshot(directory);
      const second = run(directory, applyArgs);
      expect(second.status, second.stdout + second.stderr).toBe(0);
      expect(snapshot(directory)).toEqual(before);
    });
  }, 600_000);

  it("fails closed on empty integration and executes populated passing and failing suites", () => {
    expect(existsSync(join(root, "scripts/test-integration.mjs"))).toBe(true);
    fixture(directory => {
      symlinkSync(
        join(root, "node_modules"),
        join(directory, "node_modules"),
        "dir"
      );
      put(
        directory,
        "package.json",
        JSON.stringify({
          scripts: {
            "test:integration:lisa":
              "lisa-test-run --profile cdk --adapter vitest -- vitest run '.integration.' 'integration/'",
          },
        })
      );
      put(
        directory,
        "vitest.config.mjs",
        "export default { test: { globals: true, include: ['test/**/*.test.ts'] } };\n"
      );
      const args = [join(root, "scripts/test-integration.mjs")];
      const empty = run(directory, args);
      expect(empty.status, empty.stdout + empty.stderr).toBe(1);
      expect(empty.stdout + empty.stderr).toContain(
        "FAIL: integration collection is empty (0 files)"
      );
      expect(empty.stdout).not.toContain("Tests  ");
      put(
        directory,
        "test/integration/canary.integration.test.ts",
        "it('integration canary executes', () => expect(2 + 2).toBe(4));\n"
      );
      const passing = run(directory, args);
      expect(passing.status, passing.stdout + passing.stderr).toBe(0);
      expect(passing.stdout).toContain("1 passed");
      put(
        directory,
        "test/integration/canary.integration.test.ts",
        "it('integration canary fails', () => expect(2 + 2).toBe(5));\n"
      );
      const failing = run(directory, args);
      expect(failing.status, failing.stdout + failing.stderr).not.toBe(0);
      expect(failing.stdout + failing.stderr).toContain(
        "integration canary fails"
      );
    });
  }, 600_000);
});
