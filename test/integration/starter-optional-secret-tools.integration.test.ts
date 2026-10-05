/** Offline contracts for opt-in secret delivery and exact executable pins. */
import {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  chmodSync,
  mkdirSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { AmplifyHostingStack } from "../../lib/stacks/edge/amplify-hosting-stack";

const outputs: string[] = [];
const app = () => {
  const outdir = mkdtempSync(join(tmpdir(), "starter-secret-tools-"));
  outputs.push(outdir);
  return new cdk.App({ outdir });
};
afterEach(() => {
  outputs
    .splice(0)
    .forEach(output => rmSync(output, { recursive: true, force: true }));
  vi.restoreAllMocks();
});
const requireAsset = createRequire(resolve(__dirname, "../../package.json"));
const mapping = {
  key: "api",
  parameterName: "/test/api",
  secretArn:
    "arn:aws:secretsmanager:us-east-1:123456789012:secret:fixture-aaaaaa",
  sourceKeyArn:
    "arn:aws:kms:us-east-1:123456789012:key/11111111-1111-1111-1111-111111111111",
  targetKeyArn:
    "arn:aws:kms:us-east-1:123456789012:key/22222222-2222-2222-2222-222222222222",
};
const copier = async (
  synchronizeChanges = false,
  region = "us-east-1",
  partition = "aws"
) => {
  const { SecretCopier } = await import("../../lib/constructs/secret-copier");
  const stack = new cdk.Stack(app(), "Secrets", {
    env: { account: "123456789012", region },
  });
  const mappings = [
    {
      ...mapping,
      secretArn: mapping.secretArn
        .replace("arn:aws:", `arn:${partition}:`)
        .replace("us-east-1", region),
      sourceKeyArn: mapping.sourceKeyArn
        .replace("arn:aws:", `arn:${partition}:`)
        .replace("us-east-1", region),
      targetKeyArn: mapping.targetKeyArn
        .replace("arn:aws:", `arn:${partition}:`)
        .replace("us-east-1", region),
    },
  ];
  const construct = new SecretCopier(stack, "Copy", {
    mappings,
    synchronizeChanges,
  });
  return { template: Template.fromStack(stack).toJSON(), construct, mappings };
};
const asset = () => {
  const path = resolve(__dirname, "../../resources/secret-copier/index.js");
  expect(existsSync(path)).toBe(true);
  return requireAsset(path);
};
const fakeValue = "DISTINCTIVE-SECRET-VALUE-DO-NOT-LOG";
const harness = (source: unknown = fakeValue, target: unknown = "old") => {
  const collaborators = {
    getParameter: vi.fn().mockResolvedValue({ Parameter: { Value: source } }),
    getSecretValue: vi.fn().mockResolvedValue({ SecretString: target }),
    putSecretValue: vi.fn().mockResolvedValue({}),
    logger: { info: vi.fn(), error: vi.fn() },
  };
  const handler = asset().createHandler({
    ...collaborators,
    mappings: [mapping],
    physicalId: "scope-stable-id",
  });
  return { handler, ...collaborators };
};
const lifecycle = (RequestType: string) => ({
  RequestType,
  ResourceProperties: { Mappings: [mapping] },
});
const change = (name: string, operation = "Update") => ({
  source: "aws.ssm",
  "detail-type": "Parameter Store Change",
  detail: { name, operation },
});

it("defaults render no downloaded executables and preserve explicit caller commands", () => {
  const stack = new AmplifyHostingStack(app(), "Hosting", {
    stageName: "test",
    hosting: {
      owner: "example",
      repository: "frontend",
      branch: "main",
      oauthTokenSecretName: "test/github",
    },
  });
  const spec = String(
    Object.values(
      Template.fromStack(stack).findResources("AWS::Amplify::App")
    )[0].Properties.BuildSpec
  );
  expect(spec).not.toMatch(/install -g|bun|export:web|curl|wget/);
  expect(spec).toContain("npm ci");
  expect(spec).toContain("npm run build");
});
it.each([
  ["aws", "us-east-1"],
  ["aws-cn", "cn-north-1"],
  ["aws-us-gov", "us-gov-west-1"],
])(
  "copies references with exact service/key grants in %s",
  async (partition, region) => {
    const { template, mappings } = await copier(false, region, partition);
    const resolveTemplate = (value: any): any => {
      if (value?.Ref === "AWS::Partition") return partition;
      if (value?.["Fn::Join"])
        return value["Fn::Join"][1]
          .map(resolveTemplate)
          .join(value["Fn::Join"][0]);
      if (Array.isArray(value)) return value.map(resolveTemplate);
      if (value && typeof value === "object")
        return Object.fromEntries(
          Object.entries(value).map(([key, item]) => [
            key,
            resolveTemplate(item),
          ])
        );
      return value;
    };
    const resolved = resolveTemplate(template);
    const resources = Object.values(resolved.Resources) as {
      Type: string;
      Properties: any;
    }[];
    const custom = resources.filter(
      resource => resource.Type === "Custom::SecretCopier"
    );
    expect(custom).toHaveLength(1);
    expect(custom[0].Properties.Mappings).toEqual(mappings);
    expect(JSON.stringify(template)).not.toContain(fakeValue);
    const statements = resources
      .filter(resource => resource.Type === "AWS::IAM::Policy")
      .flatMap(resource => resource.Properties.PolicyDocument.Statement);
    const data = statements.filter((s: any) =>
      JSON.stringify(s.Action).match(/ssm:|secretsmanager:|kms:/)
    );
    expect(data).toHaveLength(4);
    expect(
      data.find((s: any) => s.Action === "ssm:GetParameter").Resource
    ).toBe(`arn:${partition}:ssm:${region}:123456789012:parameter/test/api`);
    expect(
      data.find(
        (s: any) =>
          Array.isArray(s.Action) &&
          s.Action.includes("secretsmanager:PutSecretValue")
      ).Resource
    ).toBe(mappings[0].secretArn);
    const kms = data.filter((s: any) =>
      JSON.stringify(s.Action).includes("kms:")
    );
    expect(kms.map((s: any) => s.Resource)).toEqual([
      mappings[0].sourceKeyArn,
      mappings[0].targetKeyArn,
    ]);
    expect(kms[0].Condition.StringEquals).toMatchObject({
      "kms:ViaService": `ssm.${region}.amazonaws.com`,
      "kms:EncryptionContext:PARAMETER_ARN": `arn:${partition}:ssm:${region}:123456789012:parameter/test/api`,
    });
    expect(kms[1].Condition.StringEquals).toMatchObject({
      "kms:ViaService": `secretsmanager.${region}.amazonaws.com`,
      "kms:EncryptionContext:SecretARN": mappings[0].secretArn,
    });
    expect(kms[1].Action).toEqual(["kms:Decrypt", "kms:GenerateDataKey"]);
    const allows = (
      action: string,
      resource: string,
      context: Record<string, string> = {}
    ) =>
      data.some((statement: any) => {
        const actions = Array.isArray(statement.Action)
          ? statement.Action
          : [statement.Action];
        return (
          statement.Effect === "Allow" &&
          actions.includes(action) &&
          statement.Resource === resource &&
          Object.entries(statement.Condition?.StringEquals ?? {}).every(
            ([key, value]) => context[key] === value
          )
        );
      });
    const parameterArn = `arn:${partition}:ssm:${region}:123456789012:parameter/test/api`;
    expect(allows("ssm:GetParameter", parameterArn)).toBe(true);
    expect(allows("ssm:GetParameter", `${parameterArn}-other`)).toBe(false);
    expect(allows("ssm:GetParametersByPath", parameterArn)).toBe(false);
    expect(allows("secretsmanager:PutSecretValue", mappings[0].secretArn)).toBe(
      true
    );
    expect(allows("secretsmanager:DeleteSecret", mappings[0].secretArn)).toBe(
      false
    );
    expect(
      allows("secretsmanager:PutSecretValue", `${mappings[0].secretArn}-other`)
    ).toBe(false);
    expect(
      allows("kms:Decrypt", mappings[0].sourceKeyArn, {
        "kms:ViaService": `ssm.${region}.amazonaws.com`,
        "kms:EncryptionContext:PARAMETER_ARN": parameterArn,
      })
    ).toBe(true);
    expect(
      allows("kms:Decrypt", mappings[0].sourceKeyArn, {
        "kms:ViaService": `ssm.${region}.amazonaws.com`,
        "kms:EncryptionContext:PARAMETER_ARN": `${parameterArn}-other`,
      })
    ).toBe(false);
    expect(
      allows("kms:GenerateDataKey", mappings[0].targetKeyArn, {
        "kms:ViaService": `secretsmanager.${region}.amazonaws.com`,
        "kms:EncryptionContext:SecretARN": mappings[0].secretArn,
      })
    ).toBe(true);
    expect(
      allows("kms:GenerateDataKey", mappings[0].targetKeyArn, {
        "kms:ViaService": `ssm.${region}.amazonaws.com`,
        "kms:EncryptionContext:SecretARN": mappings[0].secretArn,
      })
    ).toBe(false);
    expect(JSON.stringify(data)).not.toMatch(/Delete|\*/);
    expect(
      resources.filter(resource => resource.Type === "AWS::Events::Rule")
    ).toHaveLength(0);
  }
);
it("optional sync matches exact mappings and Create/Update only with stable identities", async () => {
  const first = await copier(true);
  const second = await copier(true);
  expect(first.template).toEqual(second.template);
  const rule = Object.values(first.template.Resources).find(
    (resource: any) => resource.Type === "AWS::Events::Rule"
  ) as any;
  expect(rule.Properties.EventPattern).toEqual({
    source: ["aws.ssm"],
    "detail-type": ["Parameter Store Change"],
    detail: { name: [mapping.parameterName], operation: ["Create", "Update"] },
  });
});
it.each(["Create", "Update"])(
  "%s writes changed values and returns no plaintext data",
  async request => {
    const h = harness();
    const response = await h.handler(lifecycle(request));
    expect(response).toEqual({ PhysicalResourceId: "scope-stable-id" });
    expect(h.getParameter).toHaveBeenCalledWith({
      Name: mapping.parameterName,
      WithDecryption: true,
    });
    expect(h.putSecretValue).toHaveBeenCalledWith({
      SecretId: mapping.secretArn,
      SecretString: fakeValue,
    });
    expect(
      JSON.stringify([
        response,
        h.logger.info.mock.calls,
        h.logger.error.mock.calls,
      ])
    ).not.toContain(fakeValue);
  }
);
it("equal values skip writes on retries and delete never reads or writes", async () => {
  const h = harness(fakeValue, fakeValue);
  await h.handler(lifecycle("Create"));
  await h.handler(lifecycle("Update"));
  expect(h.putSecretValue).not.toHaveBeenCalled();
  h.getParameter.mockClear();
  h.getSecretValue.mockClear();
  expect(await h.handler(lifecycle("Delete"))).toEqual({
    PhysicalResourceId: "scope-stable-id",
  });
  expect(h.getParameter).not.toHaveBeenCalled();
  expect(h.getSecretValue).not.toHaveBeenCalled();
});
it("only exact configured change events read values", async () => {
  const h = harness();
  for (const event of [
    change("/unrelated"),
    change(mapping.parameterName, "Delete"),
    { ...change(mapping.parameterName), source: "other" },
    {},
    { RequestType: "Bogus" },
  ])
    await h.handler(event);
  expect(h.getParameter).not.toHaveBeenCalled();
  await h.handler(change(mapping.parameterName));
  expect(h.putSecretValue).toHaveBeenCalledTimes(1);
});
it.each([undefined, "", null])(
  "rejects missing/empty source %s without secret output",
  async value => {
    const h = harness(value);
    if (value === undefined) h.getParameter.mockResolvedValue({});
    await expect(h.handler(lifecycle("Create"))).rejects.toThrow(
      "Secret copy failed"
    );
    expect(h.putSecretValue).not.toHaveBeenCalled();
    expect(JSON.stringify(h.logger.error.mock.calls)).not.toContain(fakeValue);
  }
);
it.each(["getParameter", "getSecretValue", "putSecretValue"] as const)(
  "redacts %s SDK errors including untrusted error names",
  async operation => {
    const h = harness();
    h[operation].mockRejectedValue(
      Object.assign(new Error(fakeValue), { name: fakeValue })
    );
    await expect(h.handler(lifecycle("Update"))).rejects.toThrow(
      /^Secret copy failed$/
    );
    expect(
      JSON.stringify([h.logger.info.mock.calls, h.logger.error.mock.calls])
    ).not.toContain(fakeValue);
  }
);
it("a missing destination fails rather than swallowing SDK errors", async () => {
  const h = harness();
  h.getSecretValue.mockRejectedValue(
    Object.assign(new Error(fakeValue), { name: "ResourceNotFoundException" })
  );
  await expect(h.handler(lifecycle("Create"))).rejects.toThrow(
    /^Secret copy failed$/
  );
  expect(h.putSecretValue).not.toHaveBeenCalled();
});
it("selected tools render one exact version and reject tags/ranges/duplicates/shell inputs", async () => {
  const { renderBuildToolCommands } =
    await import("../../util/amplify-build-tools");
  const tools = [{ packageName: "example-tool", executable: "example-tool" }];
  const commands = renderBuildToolCommands(tools, {
    dependencies: { "example-tool": "1.2.3" },
  });
  expect(commands.join("\n")).toContain("example-tool@1.2.3");
  expect(commands.join("\n")).toContain("example-tool --version");
  for (const version of ["latest", "^1.2.3", "~1.2.3", "1", "1.2.3;echo bad"])
    expect(() =>
      renderBuildToolCommands(tools, {
        dependencies: { "example-tool": version },
      })
    ).toThrow(/exact/);
  expect(() =>
    renderBuildToolCommands([...tools, ...tools], {
      dependencies: { "example-tool": "1.2.3" },
    })
  ).toThrow(/duplicate/i);
  expect(() =>
    renderBuildToolCommands([{ packageName: "x;echo", executable: "x" }], {
      dependencies: { "x;echo": "1.2.3" },
    })
  ).toThrow();
});

it.each(["1.2.3", "0.9.0", "absent"])(
  "executes the pin check for a %s preinstalled binary without network",
  async installed => {
    const { renderBuildToolCommands } =
      await import("../../util/amplify-build-tools");
    const workspace = mkdtempSync(join(tmpdir(), "starter-tool-shell-"));
    outputs.push(workspace);
    const bin = join(workspace, "bin");
    mkdirSync(bin);
    const executable = join(bin, "example-tool");
    if (installed !== "absent") {
      writeFileSync(executable, `#!/bin/sh\necho '${installed}'\n`);
      chmodSync(executable, 0o755);
    }
    const npm = join(bin, "npm");
    writeFileSync(
      npm,
      '#!/bin/sh\n[ "$1" = install ] || exit 3\nshift\n[ "$1" = --prefix ] || exit 4\nprefix="$2"\n[ "$6" = example-tool@1.2.3 ] || exit 5\nmkdir -p "$prefix/node_modules/.bin"\nprintf "#!/bin/sh\\necho 1.2.3\\n" > "$prefix/node_modules/.bin/example-tool"\n[ "$FAIL_INSTALL" != 1 ] || echo "exit 1" >> "$prefix/node_modules/.bin/example-tool"\nchmod +x "$prefix/node_modules/.bin/example-tool"\necho installed >> "$PWD/installed.log"\n'
    );
    chmodSync(npm, 0o755);
    const commands = renderBuildToolCommands(
      [{ packageName: "example-tool", executable: "example-tool" }],
      { dependencies: { "example-tool": "1.2.3" } }
    );
    execFileSync("/bin/sh", ["-c", commands.join("\n")], {
      cwd: workspace,
      env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` },
    });
    expect(existsSync(join(workspace, "installed.log"))).toBe(
      installed !== "1.2.3"
    );
    if (installed !== "1.2.3") {
      // A successful installer is insufficient: the installed executable must
      // actually return the selected version, and failing --version is failure.
      const selected = join(
        workspace,
        ".amplify-build-tools/example-tool/node_modules/.bin/example-tool"
      );
      writeFileSync(selected, "#!/bin/sh\necho 1.2.3\nexit 1\n");
      expect(() =>
        execFileSync("/bin/sh", ["-c", commands[0]], {
          cwd: workspace,
          env: {
            ...process.env,
            PATH: `${bin}:/usr/bin:/bin`,
            FAIL_INSTALL: "1",
          },
        })
      ).toThrow();
    }
  }
);

it("rejects unsafe/ambiguous mapping metadata and preserves default-off stage composition", async () => {
  const { validateSecretCopyConfig } =
    await import("../../util/secret-copy-config");
  const { SecretCopier } = await import("../../lib/constructs/secret-copier");
  expect(() => validateSecretCopyConfig()).not.toThrow();
  for (const mappings of [
    [],
    [mapping, mapping],
    [{ ...mapping, key: "" }],
    [{ ...mapping, parameterName: "relative" }],
    [{ ...mapping, parameterName: "/aws/managed" }],
    [{ ...mapping, secretArn: `${mapping.secretArn}*` }],
    [
      {
        ...mapping,
        sourceKeyArn: "arn:aws:kms:us-east-1:123456789012:alias/key",
      },
    ],
    [{ ...mapping, value: fakeValue }],
  ])
    expect(() => validateSecretCopyConfig({ mappings } as any)).toThrow(
      /secret copy/i
    );
  for (const patch of [
    { secretArn: mapping.secretArn.replace("123456789012", "999999999999") },
    { targetKeyArn: mapping.targetKeyArn.replace("us-east-1", "us-west-2") },
    { secretArn: mapping.secretArn.replace("arn:aws:", "arn:aws-cn:") },
  ])
    expect(
      () =>
        new SecretCopier(
          new cdk.Stack(app(), "Invalid", {
            env: { account: "123456789012", region: "us-east-1" },
          }),
          "Copy",
          { mappings: [{ ...mapping, ...patch }] }
        )
    ).toThrow(/same-account/);
  const { EnvironmentStage } =
    await import("../../lib/stages/environment-stage");
  const { stageEnvironments } = await import("../../config/environments");
  const { alarmThresholds } = await import("../../config/observability");
  const base = {
    ...stageEnvironments[0],
    accountId: "123456789012",
    region: "us-east-1",
    features: {
      githubOidcDeploy: false,
      network: false,
      aurora: false,
      valkey: false,
      cognito: false,
      observability: false,
      backup: false,
      ssmRelay: false,
      migrationRunner: false,
      waf: false,
      shieldAdvanced: false,
      xray: false,
    },
  };
  const disabled = new EnvironmentStage(app(), "Env-test", {
    environment: base,
    alarmThresholds,
    env: { account: base.accountId, region: base.region },
  });
  expect(disabled.node.tryFindChild("SecretCopyStack")).toBeUndefined();
  const enabled = new EnvironmentStage(app(), "Env-test", {
    environment: { ...base, secretCopy: { mappings: [mapping] } },
    alarmThresholds,
    env: { account: base.accountId, region: base.region },
  });
  const template = Template.fromStack(
    enabled.node.findChild("SecretCopyStack") as cdk.Stack
  );
  template.resourceCountIs("Custom::SecretCopier", 1);
});

it("the deployed SDK entrypoint invokes exact commands and never returns SDK values", async () => {
  const { readFileSync } = await import("node:fs");
  const { runInNewContext } = await import("node:vm");
  class GetParameterCommand {
    constructor(public input: unknown) {}
  }
  class GetSecretValueCommand {
    constructor(public input: unknown) {}
  }
  class PutSecretValueCommand {
    constructor(public input: unknown) {}
  }
  const ssmSend = vi
    .fn()
    .mockResolvedValue({ Parameter: { Value: fakeValue } });
  const secretSend = vi
    .fn()
    .mockImplementation(async command =>
      command instanceof GetSecretValueCommand ? { SecretString: "old" } : {}
    );
  const exported: { handler?: (event: unknown) => Promise<unknown> } = {};
  const logs = { info: vi.fn(), error: vi.fn() };
  runInNewContext(
    readFileSync(
      resolve(__dirname, "../../resources/secret-copier/index.js"),
      "utf8"
    ),
    {
      exports: exported,
      console: logs,
      process: {
        env: {
          MAPPINGS: JSON.stringify([mapping]),
          PHYSICAL_ID: "scope-stable-id",
        },
      },
      require: (name: string) =>
        name === "@aws-sdk/client-ssm"
          ? {
              SSMClient: class {
                send = ssmSend;
              },
              GetParameterCommand,
            }
          : {
              SecretsManagerClient: class {
                send = secretSend;
              },
              GetSecretValueCommand,
              PutSecretValueCommand,
            },
    }
  );
  const response = await exported.handler!(lifecycle("Create"));
  expect(ssmSend.mock.calls[0][0]).toBeInstanceOf(GetParameterCommand);
  expect(secretSend.mock.calls[0][0]).toBeInstanceOf(GetSecretValueCommand);
  expect(secretSend.mock.calls[1][0]).toBeInstanceOf(PutSecretValueCommand);
  expect(secretSend.mock.calls[1][0].input).toEqual({
    SecretId: mapping.secretArn,
    SecretString: fakeValue,
  });
  expect(
    JSON.stringify([response, logs.info.mock.calls, logs.error.mock.calls])
  ).not.toContain(fakeValue);
});

it("preserves explicit caller commands without selecting executables", () => {
  const stack = new AmplifyHostingStack(app(), "Explicit", {
    stageName: "test",
    hosting: {
      owner: "example",
      repository: "frontend",
      branch: "main",
      oauthTokenSecretName: "test/github",
      preBuildCommands: ["caller-install --flag"],
      buildCommands: ["caller-build --flag"],
    },
  });
  const spec = String(
    Object.values(
      Template.fromStack(stack).findResources("AWS::Amplify::App")
    )[0].Properties.BuildSpec
  );
  expect(spec).toContain("caller-install --flag");
  expect(spec).toContain("caller-build --flag");
  expect(spec).not.toMatch(/npm ci|npm run build|amplify-build-tools/);
});
it("rejects duplicate pin sources, unsafe executable bindings, malformed semver and missing pins", async () => {
  const { renderBuildToolCommands } =
    await import("../../util/amplify-build-tools");
  const tools = [{ packageName: "example-tool", executable: "example-tool" }];
  expect(() =>
    renderBuildToolCommands(tools, {
      dependencies: { "example-tool": "1.2.3" },
      devDependencies: { "example-tool": "1.2.3" },
    })
  ).toThrow(/duplicate sources/);
  expect(() =>
    renderBuildToolCommands([{ ...tools[0], version: "1.2.3" } as any], {
      dependencies: { "example-tool": "1.2.3" },
    })
  ).toThrow(/versions only/);
  expect(() =>
    renderBuildToolCommands([{ ...tools[0], executable: "echo;bad" }], {
      dependencies: { "example-tool": "1.2.3" },
    })
  ).toThrow(/safe/);
  for (const version of ["01.2.3", "1.2.3-01", "1.2.3-.", "1.2.3+."])
    expect(() =>
      renderBuildToolCommands(tools, {
        dependencies: { "example-tool": version },
      })
    ).toThrow(/exact/);
  expect(() => renderBuildToolCommands(tools)).toThrow(/exact/);
  expect(
    renderBuildToolCommands([], { dependencies: { unused: "latest" } })
  ).toEqual([]);
});
it.each([{}, { SecretString: null }, { SecretBinary: "binary" }])(
  "rejects malformed or unsupported destination responses %j",
  async target => {
    const h = harness();
    h.getSecretValue.mockResolvedValue(target);
    await expect(h.handler(lifecycle("Update"))).rejects.toThrow(
      /^Secret copy failed$/
    );
    expect(h.putSecretValue).not.toHaveBeenCalled();
  }
);

it("retries partially completed mappings without rewriting completed destinations", async () => {
  const second = {
    ...mapping,
    key: "other",
    parameterName: "/test/other",
    secretArn: mapping.secretArn.replace(
      "fixture-aaaaaa",
      "fixture-other-aaaaaa"
    ),
  };
  const values = new Map<string, string>([
    [mapping.secretArn, "old"],
    [second.secretArn, "old"],
  ]);
  const getParameter = vi
    .fn()
    .mockResolvedValue({ Parameter: { Value: fakeValue } });
  const getSecretValue = vi.fn(async ({ SecretId }: { SecretId: string }) => ({
    SecretString: values.get(SecretId),
  }));
  const putSecretValue = vi
    .fn()
    .mockImplementationOnce(async ({ SecretId, SecretString }) => {
      values.set(SecretId, SecretString);
    })
    .mockRejectedValueOnce(new Error(fakeValue))
    .mockImplementation(async ({ SecretId, SecretString }) => {
      values.set(SecretId, SecretString);
    });
  const logger = { info: vi.fn(), error: vi.fn() };
  const handler = asset().createHandler({
    getParameter,
    getSecretValue,
    putSecretValue,
    mappings: [mapping, second],
    physicalId: "scope-stable-id",
    logger,
  });
  await expect(handler(lifecycle("Update"))).rejects.toThrow(
    /^Secret copy failed$/
  );
  await expect(handler(lifecycle("Update"))).resolves.toEqual({
    PhysicalResourceId: "scope-stable-id",
  });
  expect(putSecretValue.mock.calls.map(([input]) => input.SecretId)).toEqual([
    mapping.secretArn,
    second.secretArn,
    second.secretArn,
  ]);
  expect(
    JSON.stringify([logger.info.mock.calls, logger.error.mock.calls])
  ).not.toContain(fakeValue);
});

it("mapping edits retain caller-scope physical/logical identities and omitted keys add no KMS grants", async () => {
  const { SecretCopier } = await import("../../lib/constructs/secret-copier");
  const create = (parameterName: string) => {
    const stack = new cdk.Stack(app(), "Stable", {
      env: { account: "123456789012", region: "us-east-1" },
    });
    new SecretCopier(stack, "Copy", {
      mappings: [
        { key: mapping.key, secretArn: mapping.secretArn, parameterName },
      ],
    });
    return Template.fromStack(stack).toJSON();
  };
  const first = create("/test/api");
  const updated = create("/test/updated");
  expect(Object.keys(first.Resources)).toEqual(Object.keys(updated.Resources));
  const custom = (template: any) =>
    Object.values(template.Resources).find(
      (resource: any) => resource.Type === "Custom::SecretCopier"
    ) as any;
  expect(custom(first).Properties.PhysicalId).toBe(
    custom(updated).Properties.PhysicalId
  );
  expect(JSON.stringify(first)).not.toContain("kms:");
});

it("deployed delete needs no SDK and malformed configuration is redacted", async () => {
  const { readFileSync } = await import("node:fs");
  const { runInNewContext } = await import("node:vm");
  const source = readFileSync(
    resolve(__dirname, "../../resources/secret-copier/index.js"),
    "utf8"
  );
  const logs = { info: vi.fn(), error: vi.fn() };
  const loadSdk = vi.fn(() => {
    throw Object.assign(new Error(fakeValue), { name: fakeValue });
  });
  const exported: { handler?: (event: unknown) => Promise<unknown> } = {};
  const env = {
    MAPPINGS: JSON.stringify([mapping]),
    PHYSICAL_ID: "scope-stable-id",
  };
  runInNewContext(source, {
    exports: exported,
    console: logs,
    process: { env },
    require: loadSdk,
  });
  await expect(exported.handler!(lifecycle("Delete"))).resolves.toEqual({
    PhysicalResourceId: "scope-stable-id",
  });
  expect(loadSdk).not.toHaveBeenCalled();
  await expect(exported.handler!(lifecycle("Create"))).rejects.toThrow(
    /^Secret copy failed$/
  );
  env.MAPPINGS = fakeValue;
  await expect(exported.handler!(lifecycle("Create"))).rejects.toThrow(
    /^Secret copy failed$/
  );
  env.MAPPINGS = "[]";
  await expect(exported.handler!(lifecycle("Create"))).rejects.toThrow(
    /^Secret copy failed$/
  );
  expect(JSON.stringify(logs.error.mock.calls)).not.toContain(fakeValue);
});
