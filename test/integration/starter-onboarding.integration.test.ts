/** Helper contracts only; full generated-project smoke runs as an explicit command. */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(__dirname, "../..");
const helperPath = join(root, "scripts/smoke-generated-project.mjs");
interface Helper {
  snapshotSettings(
    paths: Record<string, string>
  ): Record<string, { path: string; sha256: string | null }>;
  assertSettingsUnchanged(
    before: Record<string, { path: string; sha256: string | null }>,
    after: Record<string, { path: string; sha256: string | null }>
  ): void;
  copyTrackedProject(source: string, destination: string): readonly string[];
  offlineEnvironment(
    scratch: string,
    inherited: NodeJS.ProcessEnv
  ): NodeJS.ProcessEnv;
  withGeneratedProject(
    source: string,
    body: (project: string, scratch: string) => void
  ): void;
  runCommands(
    commands: readonly {
      command: string;
      args: readonly string[];
      name: string;
    }[],
    options: { cwd: string; env: NodeJS.ProcessEnv }
  ): void;
  inspectAssembly(
    directory: string,
    mode: string
  ): { templates: number; resources: number; stacks: number };
}
const load = async (): Promise<Helper> => {
  expect(existsSync(helperPath), "Documented smoke helper must exist").toBe(
    true
  );
  return (await import(pathToFileURL(helperPath).href)) as Helper;
};
const directories: string[] = [];
const temporary = () => {
  const result = mkdtempSync(join(tmpdir(), "starter-onboarding-"));
  directories.push(result);
  return result;
};
const put = (
  directory: string,
  file: string,
  contents = "fixture sentinel"
) => {
  const target = join(directory, file);
  mkdirSync(resolve(target, ".."), { recursive: true });
  writeFileSync(target, contents);
};
const sourceFixture = () => {
  const source = temporary();
  put(source, "package.json", '{"name":"onboarding-fixture","private":true}\n');
  put(source, "source.ts", "export const sentinel = 1;\n");
  for (const args of [
    ["init", "-q"],
    ["add", "."],
  ]) {
    const result = spawnSync("git", args, { cwd: source, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  }
  return source;
};
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("starter onboarding contracts", () => {
  it("advertises no nonexistent package executable", () => {
    const manifest = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8")
    );
    const lock = JSON.parse(
      readFileSync(join(root, "package-lock.json"), "utf8")
    );
    expect(manifest.bin).toBeUndefined();
    expect(lock.packages[""].bin).toBeUndefined();
  });

  it("documents an executable smoke command and retains the actual source CDK entrypoint", () => {
    const manifest = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8")
    );
    expect(manifest.scripts["smoke:generated"]).toBe(
      "node scripts/smoke-generated-project.mjs"
    );
    expect(existsSync(helperPath)).toBe(true);
    expect(readFileSync(join(root, "README.md"), "utf8")).toContain(
      "npm run smoke:generated"
    );
  });

  it("retains deterministic source entrypoint and non-emitting build metadata", () => {
    const manifest = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8")
    );
    const cdk = JSON.parse(readFileSync(join(root, "cdk.json"), "utf8"));
    expect(cdk.app).toBe("npx tsx bin/app.ts");
    expect(manifest.scripts.build).toContain("tsc --noEmit");
    expect(existsSync(join(root, "bin/app.ts"))).toBe(true);
  });

  it("copies current tracked bytes without Git, private context, dependencies or output", async () => {
    const helper = await load();
    const source = sourceFixture();
    for (const file of [
      ".lisa/work-item-context.md",
      "node_modules/sentinel",
      "cdk.out/manifest.json",
      "coverage/sentinel",
      ".lisa.config.local.json",
    ])
      put(source, file);
    put(source, ".lisa/lisa-oxlint/base.json", "{}\n");
    put(source, ".lisa/ACCOUNTABILITY.md", "public project knowledge\n");
    put(source, ".codex/config.toml", "# public project configuration\n");
    expect(spawnSync("git", ["add", "-f", "."], { cwd: source }).status).toBe(
      0
    );
    put(source, "source.ts", "export const sentinel = 2;\n");
    put(source, "untracked.txt");
    const target = join(temporary(), "project");
    const copied = helper.copyTrackedProject(source, target);
    expect([...copied].sort()).toEqual([
      ".codex/config.toml",
      ".lisa/ACCOUNTABILITY.md",
      ".lisa/lisa-oxlint/base.json",
      "package.json",
      "source.ts",
    ]);
    expect(readFileSync(join(target, "source.ts"), "utf8")).toBe(
      "export const sentinel = 2;\n"
    );
    for (const file of [
      ".git",
      ".lisa/work-item-context.md",
      "node_modules",
      "cdk.out",
      "coverage",
      ".lisa.config.local.json",
      "untracked.txt",
    ])
      expect(existsSync(join(target, file))).toBe(false);
  });

  it("rejects tracked symlinks without dereferencing an external target", async () => {
    const helper = await load();
    const source = sourceFixture();
    const outside = temporary();
    put(outside, "external.txt", "outside sentinel");
    symlinkSync(join(outside, "external.txt"), join(source, "external-link"));
    expect(
      spawnSync("git", ["add", "external-link"], { cwd: source }).status
    ).toBe(0);
    expect(() =>
      helper.copyTrackedProject(source, join(temporary(), "project"))
    ).toThrow(/symlink/);
    expect(readFileSync(join(outside, "external.txt"), "utf8")).toBe(
      "outside sentinel"
    );
  });

  it("filters child credentials/context and inherited dependency resolution while preserving caller/global locators", async () => {
    const helper = await load();
    const directory = temporary();
    const inherited = {
      ...process.env,
      AWS_PROFILE: "fixture-profile",
      AWS_ACCESS_KEY_ID: "fixture-key",
      CDK_CONTEXT_JSON: "fixture-context",
      AGENT_OPERATIONS_EXTERNAL_ID: "fixture-external-id",
      NODE_PATH: "/fixture/parent-dependencies",
      npm_config_ignore_scripts: "true",
    };
    const before = { ...inherited };
    const environment = helper.offlineEnvironment(directory, inherited);
    const child = spawnSync(
      process.execPath,
      [
        "-e",
        "console.log(JSON.stringify({home:process.env.HOME,codex:process.env.CODEX_HOME,profile:process.env.AWS_PROFILE,context:process.env.CDK_CONTEXT_JSON,nodePath:process.env.NODE_PATH,ignore:process.env.npm_config_ignore_scripts,ci:process.env.CI,metadata:process.env.AWS_EC2_METADATA_DISABLED}))",
      ],
      { cwd: directory, env: environment, encoding: "utf8" }
    );
    expect(child.status, child.stderr).toBe(0);
    expect(JSON.parse(child.stdout)).toEqual({
      home: process.env.HOME,
      codex: process.env.CODEX_HOME,
      ci: "1",
      metadata: "true",
    });
    expect(inherited).toEqual(before);
  });

  it("aborts after a real nonzero child exit rather than running later commands", async () => {
    const helper = await load();
    const directory = temporary();
    expect(() =>
      helper.runCommands(
        [
          {
            name: "first",
            command: process.execPath,
            args: [
              "-e",
              "require('node:fs').writeFileSync('first.txt','first')",
            ],
          },
          {
            name: "failure",
            command: process.execPath,
            args: ["-e", "process.exit(7)"],
          },
          {
            name: "unreachable",
            command: process.execPath,
            args: [
              "-e",
              "require('node:fs').writeFileSync('later.txt','later')",
            ],
          },
        ],
        { cwd: directory, env: process.env }
      )
    ).toThrow(/failure.*7/);
    expect(existsSync(join(directory, "first.txt"))).toBe(true);
    expect(existsSync(join(directory, "later.txt"))).toBe(false);
  });

  it("cleans its generated project after success and failure without changing caller bytes", async () => {
    const helper = await load();
    const source = sourceFixture();
    const before = readFileSync(join(source, "source.ts"), "utf8");
    const generated: string[] = [];
    helper.withGeneratedProject(source, project => {
      generated.push(project);
      put(project, "generated.txt");
    });
    expect(() =>
      helper.withGeneratedProject(source, project => {
        generated.push(project);
        throw new Error("fixture failure");
      })
    ).toThrow("fixture failure");
    expect(generated).toHaveLength(2);
    for (const project of generated) expect(existsSync(project)).toBe(false);
    expect(readFileSync(join(source, "source.ts"), "utf8")).toBe(before);
  });

  it("detects an actual owned child changing a settings file without exposing or restoring contents", async () => {
    const helper = await load();
    const directory = temporary();
    const file = join(directory, "settings.json");
    put(directory, "settings.json", '{"fixture":1}\n');
    const before = helper.snapshotSettings({ settings: file });
    expect(() =>
      helper.assertSettingsUnchanged(
        before,
        helper.snapshotSettings({ settings: file })
      )
    ).not.toThrow();
    const child = spawnSync(
      process.execPath,
      [
        "-e",
        "require('node:fs').writeFileSync(process.argv[1], JSON.stringify({fixture:2}))",
        file,
      ],
      { cwd: directory, env: process.env, encoding: "utf8" }
    );
    expect(child.status, child.stderr).toBe(0);
    const after = helper.snapshotSettings({ settings: file });
    expect(() => helper.assertSettingsUnchanged(before, after)).toThrow(
      /settings/
    );
    expect(Object.keys(after.settings).sort()).toEqual(["path", "sha256"]);
    expect(readFileSync(file, "utf8")).toBe('{"fixture":2}');
  });

  it("rejects zero synth collection and unresolved context, and parses a real nonempty assembly layout", async () => {
    const helper = await load();
    const directory = temporary();
    expect(() => helper.inspectAssembly(directory, "frontend-only")).toThrow(
      /nonempty/
    );
    put(
      directory,
      "nested/manifest.json",
      JSON.stringify({
        artifacts: { Hosting: { type: "aws:cloudformation:stack" } },
        missing: [{ key: "fixture lookup" }],
      })
    );
    put(
      directory,
      "nested/Hosting.template.json",
      JSON.stringify({ Resources: { Hosting: { Type: "AWS::Amplify::App" } } })
    );
    expect(() => helper.inspectAssembly(directory, "frontend-only")).toThrow(
      /lookup/
    );
    put(
      directory,
      "nested/manifest.json",
      JSON.stringify({
        artifacts: { Hosting: { type: "aws:cloudformation:stack" } },
      })
    );
    expect(helper.inspectAssembly(directory, "frontend-only")).toMatchObject({
      templates: 1,
      stacks: 1,
      resources: 1,
    });
  });
});
