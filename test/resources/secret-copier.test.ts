/** Offline contracts for the deployed copier, including retry and redaction. */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

const assetPath = resolve(__dirname, "../../resources/secret-copier/index.js");
const runtime = createRequire(resolve(__dirname, "../../package.json"))(
  assetPath
);
const value = "FAKE-PRIVATE-VALUE-NOT-FOR-LOGS";
const mappings = ["first", "second"].map(key => ({
  key,
  parameterName: `/fixture/${key}`,
  secretArn: `arn:aws:secretsmanager:us-east-1:111111111111:secret:${key}-abcdef`,
  sourceKeyArn: "arn:aws:kms:us-east-1:111111111111:key/source",
  targetKeyArn: "arn:aws:kms:us-east-1:111111111111:key/target",
}));
const physicalId = "stable-copier-identity";
const event = (name = mappings[0].parameterName, operation = "Update") => ({
  source: "aws.ssm",
  "detail-type": "Parameter Store Change",
  detail: { name, operation },
});
const fixture = (selected = mappings) => {
  const destination = new Map(selected.map(m => [m.secretArn, "old"]));
  const deps = {
    getParameter: vi.fn().mockResolvedValue({ Parameter: { Value: value } }),
    getSecretValue: vi.fn(async ({ SecretId }: { SecretId: string }) => ({
      SecretString: destination.get(SecretId),
    })),
    putSecretValue: vi.fn(
      async (input: { SecretId: string; SecretString: string }) => {
        destination.set(input.SecretId, input.SecretString);
        return { VersionId: "sdk-version-not-public" };
      }
    ),
    logger: { info: vi.fn(), error: vi.fn() },
  };
  return {
    ...deps,
    destination,
    handler: runtime.createHandler({ ...deps, mappings: selected, physicalId }),
  };
};
const expectPrivate = (f: ReturnType<typeof fixture>, response?: unknown) => {
  expect(
    JSON.stringify([
      response,
      f.logger.info.mock.calls,
      f.logger.error.mock.calls,
    ])
  ).not.toContain(value);
};

// Evaluate the exact asset with only Node's runtime dependencies injected. This
// also exercises the Lambda export rather than replacing it with a test wrapper.
const deployed = () => {
  const f = fixture();
  const command = (operation: string) =>
    class {
      constructor(readonly input: any) {}
      readonly operation = operation;
    };
  const ssmSend = vi.fn(async (request: any) => f.getParameter(request.input));
  const secretSend = vi.fn(async (request: any) => {
    if (request.operation === "GetSecretValue")
      return f.getSecretValue(request.input);
    if (request.operation === "PutSecretValue")
      return f.putSecretValue(request.input);
    throw new Error("Unexpected secret operation");
  });
  const sdk = {
    "@aws-sdk/client-ssm": {
      SSMClient: class {
        send = ssmSend;
      },
      GetParameterCommand: command("GetParameter"),
    },
    "@aws-sdk/client-secrets-manager": {
      SecretsManagerClient: class {
        send = secretSend;
      },
      GetSecretValueCommand: command("GetSecretValue"),
      PutSecretValueCommand: command("PutSecretValue"),
    },
  };
  const loadSdk = vi.fn((name: keyof typeof sdk) => {
    if (!(name in sdk)) throw new Error("Unexpected SDK");
    return sdk[name];
  });
  const env: Record<string, unknown> = {
    MAPPINGS: JSON.stringify(mappings),
    PHYSICAL_ID: physicalId,
  };
  const exports: { handler?: (event: unknown) => Promise<unknown> } = {};
  runInNewContext(
    readFileSync(assetPath, "utf8"),
    {
      exports,
      require: loadSdk,
      process: { env },
      console: f.logger,
    },
    { filename: assetPath }
  );
  return { ...f, handler: exports.handler!, env, loadSdk, ssmSend, secretSend };
};

describe("secret copier unit runtime", () => {
  it.each(["Create", "Update"])(
    "%s decrypts exact sources and converges existing destinations",
    async RequestType => {
      const f = fixture();
      const response = await f.handler({
        RequestType,
        ResourceProperties: { SecretString: "untrusted-event-value" },
      });
      expect(response).toEqual({ PhysicalResourceId: physicalId });
      expect(f.getParameter.mock.calls).toEqual(
        mappings.map(m => [{ Name: m.parameterName, WithDecryption: true }])
      );
      expect(f.getSecretValue.mock.calls).toEqual(
        mappings.map(m => [{ SecretId: m.secretArn }])
      );
      expect(f.putSecretValue.mock.calls).toEqual(
        mappings.map(m => [{ SecretId: m.secretArn, SecretString: value }])
      );
      await f.handler({ RequestType: "Update" });
      expect(f.putSecretValue).toHaveBeenCalledTimes(2);
      expectPrivate(f, response);
    }
  );

  it("retries a partially completed batch by rereading both destinations without rewriting the successful one", async () => {
    const f = fixture();
    f.getSecretValue
      .mockResolvedValueOnce({ SecretString: "old" })
      .mockRejectedValueOnce(
        Object.assign(new Error(value), { name: "ThrottlingException" })
      );
    await expect(f.handler({ RequestType: "Create" })).rejects.toThrow(
      /^Secret copy failed$/
    );
    expect(f.putSecretValue).toHaveBeenCalledTimes(1);
    expect(f.getSecretValue).toHaveBeenCalledTimes(2);
    expect(f.logger.error).toHaveBeenCalledWith("Secret copy failed", {
      key: "second",
      category: "ThrottlingException",
    });
    await expect(f.handler({ RequestType: "Create" })).resolves.toEqual({
      PhysicalResourceId: physicalId,
    });
    expect(
      f.putSecretValue.mock.calls.map(([input]) => input.SecretId)
    ).toEqual(mappings.map(m => m.secretArn));
    expectPrivate(f);
  });

  it.each([
    null,
    undefined,
    {},
    { RequestType: "Delete" },
    { RequestType: "Import" },
    event("/fixture/first-child"),
    event("/fixture"),
    event(undefined, "Delete"),
    { ...event(), source: "other" },
    { ...event(), "detail-type": "other" },
    { ...event(), detail: null },
    { ...event(), detail: { name: mappings[0].parameterName } },
  ])(
    "ignores unrelated or destructive invocation %# without data operations",
    async input => {
      const f = fixture();
      expect(await f.handler(input)).toEqual({
        PhysicalResourceId: physicalId,
      });
      expect(f.getParameter).not.toHaveBeenCalled();
      expect(f.getSecretValue).not.toHaveBeenCalled();
      expect(f.putSecretValue).not.toHaveBeenCalled();
    }
  );

  it.each(["Create", "Update"])(
    "exact %s change selects only its mapped destination",
    async operation => {
      const f = fixture();
      await f.handler(event(mappings[1].parameterName, operation));
      expect(f.getParameter).toHaveBeenCalledExactlyOnceWith({
        Name: mappings[1].parameterName,
        WithDecryption: true,
      });
      expect(f.putSecretValue).toHaveBeenCalledExactlyOnceWith({
        SecretId: mappings[1].secretArn,
        SecretString: value,
      });
    }
  );

  it.each([
    {},
    { Parameter: {} },
    { Parameter: { Value: "" } },
    { Parameter: { Value: null } },
    { Parameter: { Value: 1 } },
  ])(
    "rejects unusable source %# before reading any destination",
    async reply => {
      const f = fixture();
      f.getParameter.mockResolvedValue(reply);
      await expect(f.handler({ RequestType: "Update" })).rejects.toThrow(
        /^Secret copy failed$/
      );
      expect(f.getSecretValue).not.toHaveBeenCalled();
      expect(f.putSecretValue).not.toHaveBeenCalled();
      expectPrivate(f);
    }
  );

  it.each([
    {},
    { SecretBinary: Buffer.from(value) },
    { SecretString: null },
    { SecretString: 7 },
  ])(
    "rejects unsupported destination %# without creating or overwriting it",
    async reply => {
      const f = fixture();
      f.getSecretValue.mockResolvedValue(reply as any);
      await expect(f.handler({ RequestType: "Update" })).rejects.toThrow(
        /^Secret copy failed$/
      );
      expect(f.putSecretValue).not.toHaveBeenCalled();
      expectPrivate(f);
    }
  );

  it.each(["getParameter", "getSecretValue", "putSecretValue"] as const)(
    "%s fails closed, strips SDK causes and allows a later AWS reinvocation",
    async operation => {
      const f = fixture([mappings[0]]);
      f[operation].mockRejectedValueOnce(
        Object.assign(new Error(value), {
          name: value,
          cause: { SecretString: value },
        })
      );
      const error = await f
        .handler({ RequestType: "Create" })
        .catch((failure: Error) => failure);
      expect(error.message).toBe("Secret copy failed");
      expect(error.cause).toBeUndefined();
      expect(f[operation]).toHaveBeenCalledTimes(1);
      expect(f.logger.error).toHaveBeenCalledWith("Secret copy failed", {
        key: "first",
        category: "SecretCopyError",
      });
      expectPrivate(f, error);
      await expect(f.handler({ RequestType: "Create" })).resolves.toEqual({
        PhysicalResourceId: physicalId,
      });
    }
  );

  it("missing destination is a failure, not an implicit create", async () => {
    const f = fixture();
    f.getSecretValue.mockRejectedValue(
      Object.assign(new Error(value), { name: "ResourceNotFoundException" })
    );
    await expect(f.handler({ RequestType: "Create" })).rejects.toThrow(
      /^Secret copy failed$/
    );
    expect(f.putSecretValue).not.toHaveBeenCalled();
    expect(f.logger.error).toHaveBeenCalledWith("Secret copy failed", {
      key: "first",
      category: "ResourceNotFoundException",
    });
    expectPrivate(f);
  });

  it("Lambda entrypoint uses only GetParameter/GetSecretValue/PutSecretValue and returns stable metadata", async () => {
    const f = deployed();
    const result = await f.handler({ RequestType: "Create" });
    expect(result).toEqual({ PhysicalResourceId: physicalId });
    expect(f.ssmSend.mock.calls.map(([request]) => request.operation)).toEqual([
      "GetParameter",
      "GetParameter",
    ]);
    expect(
      f.secretSend.mock.calls.map(([request]) => request.operation)
    ).toEqual([
      "GetSecretValue",
      "PutSecretValue",
      "GetSecretValue",
      "PutSecretValue",
    ]);
    expectPrivate(f, result);
    await f.handler({ RequestType: "Update" });
    expect(f.putSecretValue).toHaveBeenCalledTimes(2);
  });

  it("Lambda delete works without loading SDK clients", async () => {
    const f = deployed();
    expect(await f.handler({ RequestType: "Delete" })).toEqual({
      PhysicalResourceId: physicalId,
    });
    expect(f.loadSdk).not.toHaveBeenCalled();
  });

  it.each([undefined, value, "null", "{}", "[]"])(
    "Lambda rejects malformed mappings %# before SDK loading with a redacted error",
    async input => {
      const f = deployed();
      f.env.MAPPINGS = input;
      await expect(f.handler({ RequestType: "Create" })).rejects.toThrow(
        /^Secret copy failed$/
      );
      expect(f.loadSdk).not.toHaveBeenCalled();
      expectPrivate(f);
    }
  );

  it.each([undefined, "", 12])(
    "Lambda requires a stable identity %# before SDK loading",
    async input => {
      const f = deployed();
      f.env.PHYSICAL_ID = input;
      await expect(f.handler({ RequestType: "Create" })).rejects.toThrow(
        /^Secret copy failed$/
      );
      expect(f.loadSdk).not.toHaveBeenCalled();
      expectPrivate(f);
    }
  );

  it("Lambda strips transport errors while leaving failure available for external retry", async () => {
    const f = deployed();
    f.getParameter.mockRejectedValueOnce(
      Object.assign(new Error(value), { name: "AccessDeniedException" })
    );
    await expect(f.handler({ RequestType: "Create" })).rejects.toThrow(
      /^Secret copy failed$/
    );
    expect(f.logger.error.mock.calls).toEqual([
      [
        "Secret copy failed",
        { key: "first", category: "AccessDeniedException" },
      ],
      ["Secret copy failed", { category: "SecretCopyError" }],
    ]);
    expect(f.ssmSend).toHaveBeenCalledTimes(1);
    expect(f.secretSend).not.toHaveBeenCalled();
    expectPrivate(f);
    await expect(f.handler({ RequestType: "Create" })).resolves.toEqual({
      PhysicalResourceId: physicalId,
    });
  });
});
