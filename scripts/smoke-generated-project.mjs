#!/usr/bin/env node
/** Generate, install and verify an offline project without borrowing dependencies. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { invokedAsScript } from "./lib/invoked-as-script.mjs";

const excluded = new Set([
  ".git",
  ".lisa.config.local.json",
  "node_modules",
  "coverage",
  "cdk.out",
  "dist",
  "build",
  ".cache",
  ".eslintcache",
  ".cdk.context.json",
]);
const privateFiles = new Set([
  ".lisa/work-item-context.md",
  ".lisa/verification-status.json",
  ".lisa/apply-receipt.json",
  ".lisa/reconciliation-report.json",
  ".lisa/readiness.json",
  ".lisa/health/latest.json",
  ".lisa/standards/latest.json",
]);
const frontendMode = "frontend-only";
const modes = ["direct", "pipeline", frontendMode];
const gates = [
  "typecheck",
  "build",
  "lint",
  "lint:slow",
  "format:check",
  "knip:check",
  "sg:scan",
  "test:cov",
  "test:integration",
  "test:node",
];

/** Decide which tracked files belong in a generated source project.
 * @param {string} file Git-relative path
 * @returns {boolean} Whether the file is a portable source input
 */
function sourceInput(file) {
  return (
    !privateFiles.has(file) &&
    !file.split("/").some(part => excluded.has(part)) &&
    !file
      .split("/")
      .some(
        part =>
          part === ".env" ||
          (part.startsWith(".env.") &&
            ![".env.example", ".env.sample"].includes(part))
      ) &&
    !file.endsWith(".log") &&
    !file.endsWith(".tsbuildinfo")
  );
}

/** Copy current tracked bytes, failing closed on symlinks and path escapes.
 * @param {string} source Caller checkout
 * @param {string} destination New project directory
 * @returns {string[]} Copied Git-relative paths
 */
export function copyTrackedProject(source, destination) {
  const listing = spawnSync("git", ["ls-files", "-z"], {
    cwd: source,
    encoding: "utf8",
  });
  if (listing.error || listing.status !== 0)
    throw new Error("Cannot enumerate tracked source files");
  const files = [...new Set(listing.stdout.split("\0").filter(Boolean))].filter(
    sourceInput
  );
  if (!files.includes("package.json"))
    throw new Error("Generated project requires tracked package.json");
  const base = realpathSync(source);
  mkdirSync(destination, { recursive: true });
  for (const file of files) {
    const input = join(base, file);
    if (lstatSync(input).isSymbolicLink())
      throw new Error(`Refusing tracked symlink: ${file}`);
    const inside = relative(base, realpathSync(input));
    if (inside.startsWith("..") || isAbsolute(inside))
      throw new Error(`Source path escapes checkout: ${file}`);
    const output = resolve(destination, file);
    const suffix = relative(resolve(destination), output);
    if (suffix.startsWith("..") || isAbsolute(suffix))
      throw new Error(`Invalid tracked path: ${file}`);
    mkdirSync(dirname(output), { recursive: true });
    copyFileSync(input, output);
  }
  return files;
}

/** Filter only child state; preserve HOME, CODEX_HOME and other caller locators.
 * @param {string} scratch Owned temporary directory
 * @param {NodeJS.ProcessEnv} [inherited] Caller environment
 * @returns {NodeJS.ProcessEnv} Offline child environment
 */
export function offlineEnvironment(scratch, inherited = process.env) {
  return {
    ...Object.fromEntries(
      Object.entries(inherited).filter(
        ([key]) =>
          !key.startsWith("AWS_") &&
          !key.startsWith("CDK_") &&
          !key.startsWith("GITHUB_") &&
          !key.startsWith("GH_") &&
          !key.startsWith("LISA_TEST_") &&
          ![
            "AGENT_OPERATIONS_EXTERNAL_ID",
            "NODE_PATH",
            "NODE_OPTIONS",
            "npm_config_ignore_scripts",
            "LISA_WORK_ITEM_CONTEXT",
          ].includes(key)
      )
    ),
    CI: "1",
    AWS_EC2_METADATA_DISABLED: "true",
    AWS_CONFIG_FILE: join(scratch, "no-aws-config"),
    AWS_SHARED_CREDENTIALS_FILE: join(scratch, "no-aws-credentials"),
    TMPDIR: scratch,
    TMP: scratch,
    TEMP: scratch,
    npm_config_cache: join(scratch, "npm-cache"),
    NODE_COMPILE_CACHE: join(scratch, "node-cache"),
    PATH: `${dirname(process.execPath)}:${inherited.PATH ?? ""}`,
  };
}

/** Own the scratch directory and remove it on success or failure.
 * @param {string} source Caller checkout
 * @param {(project: string, scratch: string) => void} body Work to execute
 * @returns {void}
 */
export function withGeneratedProject(source, body) {
  const scratch = mkdtempSync(join(tmpdir(), "starter-generated-project-"));
  try {
    const project = join(scratch, "project");
    copyTrackedProject(source, project);
    body(project, scratch);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** Run actual commands in order and abort at the first failed command.
 * @param {readonly {name: string, command: string, args: readonly string[], timeout?: number}[]} commands Commands
 * @param {{cwd: string, env: NodeJS.ProcessEnv}} options Child scope
 * @returns {void}
 */
export function runCommands(commands, options) {
  for (const command of commands) {
    console.log(`RUN ${command.name}`);
    const result = spawnSync(command.command, [...command.args], {
      ...options,
      encoding: "utf8",
      timeout: command.timeout ?? 600_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    if (result.error || result.status !== 0) {
      const failure = new Error(
        `${command.name} failed: ${result.error?.message ?? result.status ?? result.signal}`
      );
      console.error(failure.message);
      throw failure;
    }
    console.log(`PASS ${command.name}`);
  }
}

/** Enumerate actual nested assemblies, without following symlinks.
 * @param {string} directory Output directory
 * @returns {string[]} Regular files
 */
function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = join(directory, entry.name);
    return entry.isDirectory()
      ? filesBelow(file)
      : entry.isFile()
        ? [file]
        : [];
  });
}

/** Parse nonempty templates/manifests and require each mode's actual resources.
 * @param {string} directory CDK output
 * @param {string} mode Supported fixture mode
 * @returns {{templates: number, stacks: number, resources: number}} Actual counts
 */
export function inspectAssembly(directory, mode) {
  const files = filesBelow(directory);
  const parse = file => JSON.parse(readFileSync(file, "utf8"));
  const templates = files
    .filter(file => file.endsWith(".template.json"))
    .map(parse);
  const manifests = files
    .filter(file => file.endsWith("/manifest.json"))
    .map(parse);
  const resources = templates.flatMap(template =>
    Object.values(template.Resources ?? {})
  );
  const stacks = manifests.flatMap(manifest =>
    Object.values(manifest.artifacts ?? {}).filter(
      artifact => artifact.type === "aws:cloudformation:stack"
    )
  );
  if (
    !templates.length ||
    !manifests.length ||
    !stacks.length ||
    !resources.length
  )
    throw new Error(
      `${mode} requires nonempty templates, manifests, stacks and resources`
    );
  if (manifests.some(manifest => manifest.missing?.length))
    throw new Error(`${mode} contains unresolved lookup context`);
  const types = resources.map(resource => resource.Type);
  const required =
    mode === frontendMode
      ? ["AWS::Amplify::App"]
      : ["AWS::EC2::VPC", "AWS::RDS::DBCluster"];
  if (
    !required.every(type => types.includes(type)) ||
    types.includes("AWS::CodePipeline::Pipeline") !== (mode === "pipeline") ||
    (mode === frontendMode &&
      types.some(type =>
        ["AWS::EC2::VPC", "AWS::RDS::DBCluster"].includes(type)
      ))
  )
    throw new Error(`${mode} resource contract failed`);
  return {
    templates: templates.length,
    stacks: stacks.length,
    resources: resources.length,
  };
}

/** Snapshot only declared global settings files; never restore or write them.
 * @returns {Record<string, {path: string, sha256: string|null}>} Paths and hashes, not secret contents
 */
function globalSettings() {
  const home = process.env.HOME;
  if (!home) throw new Error("HOME is required and must remain inherited");
  const codex = process.env.CODEX_HOME ?? join(home, ".codex");
  const claude = process.env.CLAUDE_CONFIG_DIR ?? join(home, ".claude");
  const paths = {
    codexConfig: join(codex, "config.toml"),
    codexHooks: join(codex, "hooks.json"),
    claudeSettings: join(claude, "settings.json"),
    claudeRoot: join(home, ".claude.json"),
    claudePlugins: join(claude, "plugins/installed_plugins.json"),
    claudeMarketplaces: join(claude, "plugins/known_marketplaces.json"),
  };
  return snapshotSettings(paths);
}

/** Capture explicit settings paths without storing their contents.
 * @param {Record<string, string>} paths Declared paths
 * @returns {Record<string, {path: string, sha256: string|null}>} Path/hash observations
 */
export function snapshotSettings(paths) {
  return Object.fromEntries(
    Object.entries(paths).map(([key, file]) => [
      key,
      {
        path: file,
        sha256: existsSync(file)
          ? createHash("sha256").update(readFileSync(file)).digest("hex")
          : null,
      },
    ])
  );
}

/** Reject observed drift when the caller can establish exclusive child ownership.
 * @param {Record<string, {path: string, sha256: string|null}>} before Before observation
 * @param {Record<string, {path: string, sha256: string|null}>} after After observation
 * @returns {void}
 */
export function assertSettingsUnchanged(before, after) {
  const changed = Object.keys(before).filter(
    key => before[key].sha256 !== after[key]?.sha256
  );
  if (changed.length)
    throw new Error(
      `Observed settings drift: ${changed.join(", ")}; inspect without blind restoration`
    );
}

/** Execute the real generated-project install, gates and three offline modes.
 * @returns {void}
 */
function main() {
  const source = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const expected = JSON.parse(
    readFileSync(join(source, "package.json"), "utf8")
  ).engines.node;
  if (process.versions.node !== expected)
    throw new Error(
      `Use documented Node ${expected}; got ${process.versions.node}`
    );
  const before = globalSettings();
  console.log(JSON.stringify({ globalSettingsBefore: before }));
  try {
    withGeneratedProject(source, (project, scratch) => {
      const env = offlineEnvironment(scratch);
      const npm = join(dirname(process.execPath), "npm");
      runCommands(
        [
          {
            name: "fresh npm ci (lifecycle scripts enabled)",
            command: npm,
            args: ["ci", "--foreground-scripts"],
          },
        ],
        { cwd: project, env }
      );
      if (
        lstatSync(join(project, "node_modules")).isSymbolicLink() ||
        realpathSync(join(project, "node_modules")) !==
          join(realpathSync(project), "node_modules")
      )
        throw new Error(
          "Generated project must own its installed node_modules"
        );
      runCommands(
        gates.map(name => ({ name, command: npm, args: ["run", name] })),
        { cwd: project, env }
      );
      for (const mode of modes) {
        const output = join(scratch, `cdk-${mode}`);
        runCommands(
          [
            {
              name: `offline synth ${mode}`,
              command: process.execPath,
              args: [
                "node_modules/aws-cdk/bin/cdk",
                "synth",
                "--no-lookups",
                "--quiet",
                "--app",
                `node --import tsx test/fixtures/starter-entrypoint.cjs ${mode}`,
                "--output",
                output,
              ],
              timeout: 60_000,
            },
          ],
          { cwd: project, env }
        );
        console.log(JSON.stringify({ mode, ...inspectAssembly(output, mode) }));
      }
    });
  } finally {
    const after = globalSettings();
    console.log(JSON.stringify({ globalSettingsAfter: after }));
    try {
      assertSettingsUnchanged(before, after);
      console.log("Declared global settings hashes unchanged during smoke");
    } catch (error) {
      // Other active applications share these files. Hashes cannot attribute a write.
      console.warn(
        `${error.message}; writer unattributed, global preservation not established`
      );
    }
  }
  console.log(
    "PASS generated-project install, gates and synth; owned scratch removed; see global observations above"
  );
}

if (invokedAsScript(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
