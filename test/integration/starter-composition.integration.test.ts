/** Actual CDK CLI regressions for direct, pipeline and frontend composition. */
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
        readonly displayName?: string;
        readonly properties?: { readonly stackName?: string };
      }
    >
  >;
}

/** Enumerate nested CDK Stage assemblies as well as the root assembly. */
const filesBelow = (directory: string): readonly string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(file) : [file];
  });

/** Keep subprocesses independent of the operator's live AWS configuration. */
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
  TMPDIR: join(output, "tmp"),
  TMP: join(output, "tmp"),
  TEMP: join(output, "tmp"),
  npm_config_cache: join(output, "npm-cache"),
});

describe("starter entrypoint composition", () => {
  it.each(["direct", "pipeline", "frontend-only"])(
    "%s synthesizes actual nonempty stacks without lookups",
    mode => {
      const output = mkdtempSync(join(tmpdir(), `starter-${mode}-`));
      try {
        mkdirSync(join(output, "tmp"), { recursive: true });
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
            cwd: resolve(__dirname, "../.."),
            env: offlineEnvironment(output),
            encoding: "utf8",
            timeout: 60_000,
            maxBuffer: 8 * 1024 * 1024,
          }
        );

        expect(result.error).toBeUndefined();
        expect(result.stderr + result.stdout).not.toContain("CannotDependency");
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
        expect(resourceTypes.length).toBeGreaterThan(0);
        manifests.forEach(manifest =>
          expect(manifest.missing ?? []).toEqual([])
        );

        if (mode === "frontend-only") {
          expect(stackNames).toEqual(["dev-amplify-hosting"]);
          expect(resourceTypes).toContain("AWS::Amplify::App");
          expect(resourceTypes).not.toContain("AWS::EC2::VPC");
          expect(resourceTypes).not.toContain("AWS::RDS::DBCluster");
        } else {
          const environmentStacks = [
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
          ];
          expect([...stackNames].sort()).toEqual(
            [
              ...environmentStacks,
              ...(mode === "pipeline" ? ["PipelineStack"] : []),
            ].sort()
          );
          // Opt-in services must remain absent from the starter's default setup.
          [
            "AWS::WAFv2::WebACL",
            "AWS::Shield::Protection",
            "AWS::Backup::BackupPlan",
            "AWS::Amplify::App",
            "AWS::CloudFront::Distribution",
          ].forEach(type => expect(resourceTypes).not.toContain(type));
          expect(resourceTypes).toContain("AWS::EC2::VPC");
          expect(resourceTypes).toContain("AWS::RDS::DBCluster");
          const stagePrefix =
            mode === "pipeline" ? "PipelineStack/Env-dev" : "Env-dev";
          const stackPaths = manifests.flatMap(manifest =>
            Object.values(manifest.artifacts).map(
              artifact => artifact.displayName
            )
          );
          expect(stackPaths).toEqual(
            expect.arrayContaining([
              `${stagePrefix}/VpcStack`,
              `${stagePrefix}/AuroraStack`,
            ])
          );
          expect(resourceTypes.includes("AWS::CodePipeline::Pipeline")).toBe(
            mode === "pipeline"
          );
        }
      } finally {
        rmSync(output, { recursive: true, force: true });
      }
    },
    70_000
  );
});
