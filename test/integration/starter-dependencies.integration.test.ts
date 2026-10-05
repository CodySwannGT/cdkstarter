/** Installed dependency controls and offline synthesis of the actual app. */
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

interface PackageMetadata {
  readonly version: string;
  readonly peerDependencies?: Readonly<Record<string, string>>;
}

const root = resolve(__dirname, "../..");
const installed = (name: string): PackageMetadata =>
  JSON.parse(
    readFileSync(join(root, "node_modules", name, "package.json"), "utf8")
  );

/** Check actual declared peers and the reviewed CLI compatibility floor. */
const requireCompatibility = (
  library: PackageMetadata,
  alpha: PackageMetadata,
  cli: PackageMetadata
): void => {
  if (
    alpha.version.split("-")[0] !== library.version ||
    alpha.peerDependencies?.["aws-cdk-lib"] !== `^${library.version}` ||
    alpha.peerDependencies?.constructs !== library.peerDependencies?.constructs
  ) {
    throw new Error("Amplify alpha/CDK peers do not align");
  }
  const [major, minor] = cli.version.split(".").map(Number);
  if (major !== 2 || minor < 1144) {
    throw new Error("CDK CLI is below the reviewed compatibility floor");
  }
};

const filesBelow = (directory: string): readonly string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });

describe("starter dependency refresh", () => {
  it("installs the coordinated CDK, constructs and Lisa refresh", () => {
    expect(installed("aws-cdk-lib").version).toBe("2.272.0");
    expect(installed("@aws-cdk/aws-amplify-alpha").version).toBe(
      "2.272.0-alpha.0"
    );
    expect(installed("constructs").version).toBe("10.8.1");
    expect(installed("@codyswann/lisa").version).toBe("4.69.4");
    expect(() =>
      requireCompatibility(
        installed("aws-cdk-lib"),
        installed("@aws-cdk/aws-amplify-alpha"),
        installed("aws-cdk")
      )
    ).not.toThrow();
  });

  it("rejects mismatched alpha peers and a stale CLI without altering the installed graph", () => {
    const library = installed("aws-cdk-lib");
    const alpha = installed("@aws-cdk/aws-amplify-alpha");
    const cli = { version: "2.1144.0" };
    expect(() => requireCompatibility(library, alpha, cli)).not.toThrow();
    expect(() =>
      requireCompatibility(library, { ...alpha, version: "2.1.0-alpha.0" }, cli)
    ).toThrow(/peers/);
    expect(() =>
      requireCompatibility(
        library,
        {
          ...alpha,
          peerDependencies: {
            ...alpha.peerDependencies,
            "aws-cdk-lib": "^2.1.0",
          },
        },
        cli
      )
    ).toThrow(/peers/);
    expect(() =>
      requireCompatibility(library, alpha, { version: "2.1132.0" })
    ).toThrow(/CLI/);
  });

  it("retains supported tooling families and the documented npm/Node contract", () => {
    for (const [name, major] of Object.entries({
      typescript: "6",
      eslint: "9",
      knip: "5",
      husky: "8",
      vitest: "4",
      "@vitest/coverage-v8": "4",
      vite: "8",
    })) {
      expect(installed(name).version.split(".")[0], name).toBe(major);
    }
    const host = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(host.engines.node).toBe("22.23.3");
    expect(host.engines.npm).toBe(">= 10.9.4");
    expect(installed("vitest").version).toBe(
      installed("@vitest/coverage-v8").version
    );
    expect(installed("deepmerge-ts").version.split(".")[0]).toBe("8");
    expect(host.overrides["eslint-plugin-functional"]["deepmerge-ts"]).toBe(
      "^8.0.1"
    );
  });

  it("removes obsolete advisory exceptions while keeping the exact unresolved dispositions", () => {
    const policy = JSON.parse(
      readFileSync(join(root, "audit.ignore.local.json"), "utf8")
    );
    expect(
      policy.exclusions.map((entry: { id: string }) => entry.id).sort()
    ).toEqual(
      [
        "GHSA-q2hr-2g5m-vwhr",
        "GHSA-qhr7-859c-m2p7",
        "GHSA-6j4f-fj2g-mc7p",
        "GHSA-vfj7-8cjw-p6xm",
      ].sort()
    );
    expect(installed("aws-cdk-lib/node_modules/brace-expansion").version).toBe(
      "5.0.9"
    );
    expect(installed("braces").version).toBe("3.0.3");
    for (const entry of policy.exclusions) {
      expect(entry.reason).toContain("CodySwannGT");
      expect(entry.reason).toContain("2026-10-16T23:59:59Z");
      expect(entry.reason).toContain(
        "https://github.com/CodySwannGT/cdkstarter/issues/39"
      );
    }
  });

  it.each(["direct", "pipeline", "frontend-only"])(
    "%s executes the installed CLI against the same offline app fixture",
    mode => {
      const output = mkdtempSync(join(tmpdir(), `cdk-dependencies-${mode}-`));
      try {
        mkdirSync(join(output, ".tmp"));
        const env = Object.fromEntries(
          Object.entries(process.env).filter(
            ([key]) =>
              !key.startsWith("AWS_") &&
              !key.startsWith("CDK_DEFAULT_") &&
              key !== "CDK_CONTEXT_JSON" &&
              key !== "AGENT_OPERATIONS_EXTERNAL_ID"
          )
        );
        const result = spawnSync(
          process.execPath,
          [
            "node_modules/aws-cdk/bin/cdk",
            "synth",
            "--no-lookups",
            "--app",
            `node --import tsx test/fixtures/starter-entrypoint.cjs ${mode}`,
            "--output",
            output,
          ],
          {
            cwd: root,
            env: {
              ...env,
              TMPDIR: join(output, ".tmp"),
              TMP: join(output, ".tmp"),
              TEMP: join(output, ".tmp"),
              NODE_DISABLE_COMPILE_CACHE: "1",
              CDK_HOME: join(output, ".tmp/cdk-home"),
              AWS_EC2_METADATA_DISABLED: "true",
              AWS_CONFIG_FILE: join(output, "absent-config"),
              AWS_SHARED_CREDENTIALS_FILE: join(output, "absent-credentials"),
            },
            encoding: "utf8",
            timeout: 60_000,
            maxBuffer: 8 * 1024 * 1024,
          }
        );
        expect(result.error).toBeUndefined();
        expect(result.status, result.stderr + result.stdout).toBe(0);
        const files = filesBelow(output);
        const templates = files
          .filter(path => path.endsWith(".template.json"))
          .map(path => JSON.parse(readFileSync(path, "utf8")));
        const manifests = files
          .filter(path => path.endsWith("/manifest.json"))
          .map(path => JSON.parse(readFileSync(path, "utf8")));
        expect(templates.length).toBe(
          mode === "frontend-only" ? 1 : mode === "pipeline" ? 14 : 13
        );
        for (const template of templates)
          expect(Object.keys(template.Resources).length).toBeGreaterThan(0);
        for (const manifest of manifests)
          expect(manifest.missing ?? []).toEqual([]);
        const types = templates.flatMap(template =>
          Object.values(template.Resources).map(
            resource => (resource as { Type: string }).Type
          )
        );
        expect(types.includes("AWS::CodePipeline::Pipeline")).toBe(
          mode === "pipeline"
        );
        expect(types.includes("AWS::RDS::DBCluster")).toBe(
          mode !== "frontend-only"
        );
        expect(types.includes("AWS::Amplify::App")).toBe(
          mode === "frontend-only"
        );
        for (const type of [
          "AWS::WAFv2::WebACL",
          "AWS::Shield::Protection",
          "AWS::Backup::BackupPlan",
          "AWS::CloudFront::Distribution",
        ])
          expect(types).not.toContain(type);
        console.info(
          `Dependency CLI ${mode}: ${templates.length} nonempty templates, ${types.length} resources, no missing context`
        );
      } finally {
        rmSync(output, { recursive: true, force: true });
      }
    },
    70_000
  );
});
