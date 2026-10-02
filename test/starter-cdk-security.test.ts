/** Installed dependency and real-entrypoint CDK CLI security regressions. */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

interface PackageMetadata {
  readonly version: string;
  readonly peerDependencies?: Readonly<Record<string, string>>;
}

interface CloudFormationTemplate {
  readonly Resources: Readonly<Record<string, { readonly Type: string }>>;
}

interface AssemblyManifest {
  readonly missing?: readonly unknown[];
  readonly artifacts: Readonly<
    Record<
      string,
      {
        readonly type: string;
        readonly properties?: { readonly stackName?: string };
      }
    >
  >;
}

const projectRoot = resolve(__dirname, "..");

/** Read actual installed packages, including the tarball's bundled copy. */
const installedPackage = (path: string): PackageMetadata =>
  JSON.parse(
    readFileSync(
      join(projectRoot, "node_modules", path, "package.json"),
      "utf8"
    )
  ) as PackageMetadata;

/** Enforce the exact alpha/library family and its declared compatible peers. */
const requireAlignedPeers = (
  library: PackageMetadata,
  alpha: PackageMetadata
): void => {
  if (
    alpha.version.split("-")[0] !== library.version ||
    alpha.peerDependencies?.["aws-cdk-lib"] !== `^${library.version}` ||
    alpha.peerDependencies?.constructs !== library.peerDependencies?.constructs
  ) {
    throw new Error("Amplify alpha and CDK package metadata do not align");
  }
};

/** Enumerate nested Stage assemblies, assets and templates. */
const filesBelow = (directory: string): readonly string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(file) : [file];
  });

/** Never inherit operator AWS credentials or CDK context into the CLI. */
const offlineEnvironment = (output: string): NodeJS.ProcessEnv => ({
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !key.startsWith("AWS_") &&
        !key.startsWith("CDK_DEFAULT_") &&
        key !== "CDK_CONTEXT_JSON" &&
        key !== "AGENT_OPERATIONS_EXTERNAL_ID"
    )
  ),
  AWS_EC2_METADATA_DISABLED: "true",
  AWS_CONFIG_FILE: join(output, "no-aws-config"),
  AWS_SHARED_CREDENTIALS_FILE: join(output, "no-aws-credentials"),
});

describe("starter CDK security compatibility", () => {
  it("installs the exact aligned CDK and Amplify update with compatible peers", () => {
    const library = installedPackage("aws-cdk-lib");
    const alpha = installedPackage("@aws-cdk/aws-amplify-alpha");
    expect(library.version).toBe("2.272.0");
    expect(alpha.version).toBe("2.272.0-alpha.0");
    expect(library.peerDependencies?.constructs).toBe("^10.5.0");
    expect(["10.6.0", "10.8.1"]).toContain(
      installedPackage("constructs").version
    );
    expect(["2.1132.0", "2.1144.0"]).toContain(
      installedPackage("aws-cdk").version
    );
    expect(() => requireAlignedPeers(library, alpha)).not.toThrow();
  });

  it("uses the actual patched bundled brace-expansion rather than the root override", () => {
    expect(
      installedPackage("aws-cdk-lib/node_modules/brace-expansion").version
    ).toBe("5.0.9");
  });

  it("rejects deliberately mismatched alpha/CDK metadata without changing installed packages", () => {
    const library = installedPackage("aws-cdk-lib");
    const alpha = installedPackage("@aws-cdk/aws-amplify-alpha");
    expect(() => requireAlignedPeers(library, alpha)).not.toThrow();
    expect(() =>
      requireAlignedPeers(library, { ...alpha, version: "2.1.0-alpha.0" })
    ).toThrow("Amplify alpha and CDK package metadata do not align");
  });

  it.each(["pipeline", "frontend-only"])(
    "%s runs the installed CDK CLI on the real app without credentials or lookups",
    mode => {
      const output = mkdtempSync(join(tmpdir(), `cdk-security-${mode}-`));
      try {
        const result = spawnSync(
          process.execPath,
          [
            "node_modules/aws-cdk/bin/cdk",
            "synth",
            "--no-lookups",
            "--app",
            `node --import tsx test/fixtures/cdk-security-entrypoint.cjs ${mode}`,
            "--output",
            output,
          ],
          {
            cwd: projectRoot,
            env: offlineEnvironment(output),
            encoding: "utf8",
            timeout: 60_000,
            maxBuffer: 8 * 1024 * 1024,
          }
        );
        expect(result.error).toBeUndefined();
        expect(result.status, result.stderr + result.stdout).toBe(0);

        const files = filesBelow(output);
        const templates = files
          .filter(file => file.endsWith(".template.json"))
          .map(
            file =>
              JSON.parse(readFileSync(file, "utf8")) as CloudFormationTemplate
          );
        const manifests = files
          .filter(file => file.endsWith("/manifest.json"))
          .map(
            file => JSON.parse(readFileSync(file, "utf8")) as AssemblyManifest
          );
        const resourceTypes = templates.flatMap(template =>
          Object.values(template.Resources).map(resource => resource.Type)
        );
        const stackNames = manifests.flatMap(manifest =>
          Object.entries(manifest.artifacts)
            .filter(
              ([, artifact]) => artifact.type === "aws:cloudformation:stack"
            )
            .map(([id, artifact]) => artifact.properties?.stackName ?? id)
        );

        expect(templates.length).toBeGreaterThan(0);
        templates.forEach(template =>
          expect(Object.keys(template.Resources).length).toBeGreaterThan(0)
        );
        manifests.forEach(manifest =>
          expect(manifest.missing ?? []).toEqual([])
        );

        if (mode === "frontend-only") {
          expect(stackNames).toEqual(["dev-amplify-hosting"]);
          expect(resourceTypes).toContain("AWS::Amplify::App");
          expect(resourceTypes).not.toContain("AWS::EC2::VPC");
          expect(resourceTypes).not.toContain("AWS::RDS::DBCluster");
        } else {
          expect([...stackNames].sort()).toEqual(
            [
              "PipelineStack",
              "dev-vpc",
              "dev-security-groups",
              "dev-ssm-relay",
              "dev-cognito",
              "dev-aurora",
              "dev-valkey",
              "dev-iam",
              "dev-sns",
              "dev-aurora-alarms",
              "dev-valkey-alarms",
              "dev-iam-deploy-role",
              "dev-cdk-trust-policy",
              "shared-trust-dev",
            ].sort()
          );
          expect(resourceTypes).toContain("AWS::EC2::VPC");
          expect(resourceTypes).toContain("AWS::RDS::DBCluster");
          expect(resourceTypes).toContain("AWS::CodePipeline::Pipeline");
          [
            "AWS::WAFv2::WebACL",
            "AWS::Shield::Protection",
            "AWS::Backup::BackupPlan",
            "AWS::Amplify::App",
            "AWS::CloudFront::Distribution",
          ].forEach(type => expect(resourceTypes).not.toContain(type));
        }
        console.info(
          `CDK CLI ${mode}: ${templates.length} nonempty templates, ${resourceTypes.length} resources, no missing context`
        );
      } finally {
        rmSync(output, { recursive: true, force: true });
      }
    },
    70_000
  );
});
