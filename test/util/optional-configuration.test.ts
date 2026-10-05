/** Unit contracts for caller-owned optional configuration, without CDK or AWS. */
import { renderBuildToolCommands } from "../../util/amplify-build-tools";
import {
  amplifyCustomRules,
  SPA_FALLBACK_SOURCE,
  validateAmplifyHosting,
} from "../../util/amplify-hosting";
import {
  dnsDelegationId,
  getDnsDelegations,
  normalizeDnsName,
} from "../../util/dns-delegation";
import { validateGraphqlMonitoring } from "../../util/graphql-monitoring";
import { queueName, validateQueues } from "../../util/queues";
import { validateSecretCopyConfig } from "../../util/secret-copy-config";
import { validateSmsMonitoring } from "../../util/sms-monitoring";
import type {
  AmplifyBuildTool,
  AmplifyHostingConfig,
  DomainConfig,
  GraphqlMonitoringConfig,
  QueuesConfig,
  SecretCopyConfig,
  SmsMonitoringConfig,
  StageEnvironment,
} from "../../lib/types";

const hosting: AmplifyHostingConfig = {
  owner: "example",
  repository: "frontend",
  branch: "main",
  oauthTokenSecretName: "example/token",
};
const account = "111111111111";
const region = "us-east-1";
const topic = `arn:aws:sns:${region}:${account}:alerts`;
const scope = { stageName: "dev", account, region };
const delegation = {
  parentDomain: "example.test",
  childZoneName: "dev.example.test",
  parentAccountId: account,
  parentHostedZoneId: "ZEXAMPLE",
  delegationRoleName: "delegate-dev",
  trustedChildAccountIds: ["222222222222"],
};
const graphql: GraphqlMonitoringConfig = {
  enabled: true,
  namespace: "Example/GraphQL",
  stageDimension: "dev",
  minimumInvocations: 1,
  errorRatePercent: { warning: 0, critical: 100 },
  latencyMilliseconds: { warning: 0, critical: 1 },
  latencyStatistic: "Average",
  operations: [{ name: "ReadItems", type: "query", public: false }],
};
const mapping = {
  key: "api",
  parameterName: "/example/api",
  secretArn: `arn:aws:secretsmanager:${region}:${account}:secret:api-Ab1234`,
};
const sms: SmsMonitoringConfig = {
  enabled: true,
  monthlyPreferenceUsd: 100,
  dailyCapUsd: 10,
  fiveMinuteSurgeUsd: 5,
  warningPercent: 80,
  notificationTopicArn: topic,
};
const worker = {
  functionArn: `arn:aws:lambda:${region}:${account}:function:worker`,
  executionRoleArn: `arn:aws:iam::${account}:role/application/worker`,
  timeoutSeconds: 30,
};

/** Present deliberately malformed external values to the public typed boundary. */
const external = <T>(value: unknown): T => value as T;
/** Validate one enabled delegation inventory. */
const dns = (
  entries: readonly unknown[],
  stages: readonly StageEnvironment[] = []
): ReturnType<typeof getDnsDelegations> =>
  getDnsDelegations(
    external<DomainConfig>({
      domains: [],
      dnsDelegation: { enabled: true, entries },
    }),
    stages
  );
/** Validate one enabled standard queue. */
const queues = (definition: unknown): void =>
  validateQueues(
    external<QueuesConfig>({ enabled: true, definitions: [definition] }),
    scope
  );

describe("optional Amplify public configuration", () => {
  it("keeps omitted options inert and returns a separate ordered rule array", () => {
    expect(() => validateAmplifyHosting(hosting)).not.toThrow();
    expect(amplifyCustomRules(hosting)).toEqual([]);
    const rules = [{ source: "/old", target: "/new", status: "301" as const }];
    expect(amplifyCustomRules({ ...hosting, customRules: rules })).toEqual(
      rules
    );
    expect(amplifyCustomRules({ ...hosting, customRules: rules })).not.toBe(
      rules
    );
    expect(rules).toHaveLength(1);
  });
  it.each(["200", "301", "302", "404", "404-200"])(
    "accepts documented rewrite status %s",
    status => {
      expect(() =>
        validateAmplifyHosting(
          external<AmplifyHostingConfig>({
            ...hosting,
            customRules: [
              { source: "/a", target: "/b", status, condition: "<US>" },
            ],
          })
        )
      ).not.toThrow();
    }
  );
  it.each([
    ["source", ""],
    ["source", " "],
    ["source", 1],
    ["source", "/a\n/b"],
    ["target", ""],
    ["target", "/a\r/b"],
    ["condition", ""],
    ["condition", "a\0b"],
    ["status", "307"],
  ])("rejects invalid rule %s = %j", (field, value) => {
    expect(() =>
      validateAmplifyHosting(
        external<AmplifyHostingConfig>({
          ...hosting,
          customRules: [
            { source: "/a", target: "/b", status: "200", [field]: value },
          ],
        })
      )
    ).toThrow(/Amplify/);
  });
  it.each(["spaFallback", "buildFailureNotifications"])(
    "rejects nonboolean %s enablement",
    field => {
      expect(() =>
        validateAmplifyHosting(
          external<AmplifyHostingConfig>({
            ...hosting,
            [field]: { enabled: "yes" },
          })
        )
      ).toThrow(/boolean/);
    }
  );
  it.each([
    { pattern: "", headers: { Accept: "ok" } },
    { pattern: "/a\u2028b", headers: {} },
    { pattern: "/*", headers: { "Bad Name": "ok" } },
    { pattern: "/*", headers: { "X-Test": 1 } },
    { pattern: "/*", headers: { "X-Test": "a\nInjected: b" } },
    { pattern: "/*", headers: { "X-Test": "a\u2029b" } },
  ])("rejects unsafe header group %j", group => {
    expect(() =>
      validateAmplifyHosting(
        external<AmplifyHostingConfig>({ ...hosting, customHeaders: [group] })
      )
    ).toThrow(/Amplify/);
  });
  it("accepts empty, quoted and backslash header values without rewriting them", () => {
    const headers = {
      "X-Empty": "",
      "Content-Disposition": 'attachment; filename="report.json"',
      "X-Path": "a\\b",
    };
    expect(() =>
      validateAmplifyHosting({
        ...hosting,
        customHeaders: [{ pattern: "/*", headers }],
      })
    ).not.toThrow();
    expect(headers["X-Path"]).toBe("a\\b");
  });
  it("rejects case-insensitive duplicate headers within one path group", () => {
    expect(() =>
      validateAmplifyHosting({
        ...hosting,
        customHeaders: [
          {
            pattern: "/*",
            headers: {
              "Cache-Control": "no-store",
              "cache-control": "max-age=3600",
            },
          },
        ],
      })
    ).toThrow(/duplicate header/i);
  });
  it("allows differently cased headers in separate path groups", () => {
    expect(() =>
      validateAmplifyHosting({
        ...hosting,
        customHeaders: [
          { pattern: "/private/*", headers: { "Cache-Control": "no-store" } },
          {
            pattern: "/assets/*",
            headers: { "cache-control": "max-age=3600" },
          },
        ],
      })
    ).not.toThrow();
  });
  it("appends fallback last, deduplicates only an unconditional equivalent", () => {
    const equivalent = {
      source: SPA_FALLBACK_SOURCE,
      target: "/index.html",
      status: "200" as const,
    };
    expect(
      amplifyCustomRules({ ...hosting, spaFallback: { enabled: true } })
    ).toEqual([equivalent]);
    expect(
      amplifyCustomRules({
        ...hosting,
        spaFallback: { enabled: true },
        customRules: [equivalent],
      })
    ).toEqual([equivalent]);
    const conditioned = { ...equivalent, condition: "<US>" };
    expect(
      amplifyCustomRules({
        ...hosting,
        spaFallback: { enabled: true },
        customRules: [conditioned],
      })
    ).toEqual([conditioned, equivalent]);
    expect(
      amplifyCustomRules({
        ...hosting,
        spaFallback: { enabled: false },
        customRules: [conditioned],
      })
    ).toEqual([conditioned]);
  });
  it.each([{}, { enabled: false, topicArn: "not-an-arn" }])(
    "ignores disabled notification options %j",
    options => {
      expect(() =>
        validateAmplifyHosting(
          external<AmplifyHostingConfig>({
            ...hosting,
            buildFailureNotifications: options,
          })
        )
      ).not.toThrow();
    }
  );
  it.each([
    undefined,
    "",
    "arn:aws:sns:us-east-1:111111111111:alerts.fifo",
    "arn:aws:lambda:us-east-1:111111111111:function:wrong",
  ])("rejects missing/nonstandard notification topic %j", topicArn => {
    expect(() =>
      validateAmplifyHosting(
        external<AmplifyHostingConfig>({
          ...hosting,
          buildFailureNotifications: { enabled: true, topicArn },
        })
      )
    ).toThrow(/topic ARN/);
  });
  it.each([
    { branches: [] },
    { branches: [""] },
    { branches: ["main\nother"] },
  ])("rejects invalid notification branches %j", ({ branches }) => {
    expect(() =>
      validateAmplifyHosting({
        ...hosting,
        buildFailureNotifications: {
          enabled: true,
          topicArn: topic,
          branches,
        },
      })
    ).toThrow(/branch/);
  });
  it("uses the configured source branch unless an explicit branch list is supplied", () => {
    expect(() =>
      validateAmplifyHosting({
        ...hosting,
        buildFailureNotifications: { enabled: true, topicArn: topic },
      })
    ).not.toThrow();
    expect(() =>
      validateAmplifyHosting({
        ...hosting,
        buildFailureNotifications: {
          enabled: true,
          topicArn: topic,
          branches: ["main", "release"],
        },
      })
    ).not.toThrow();
    expect(() =>
      validateAmplifyHosting({
        ...hosting,
        branch: "",
        buildFailureNotifications: { enabled: true, topicArn: topic },
      })
    ).toThrow(/branch/);
  });
});

describe("exact optional executable pins", () => {
  it("selects no implicit tools or manifest read", () => {
    expect(renderBuildToolCommands()).toEqual([]);
    expect(renderBuildToolCommands([])).toEqual([]);
    expect(() =>
      renderBuildToolCommands([
        { packageName: "missing", executable: "missing" },
      ])
    ).toThrow(/exact semver/);
  });
  it.each([
    "1.2.3",
    "0.0.0",
    "1.2.3-beta.1",
    "1.2.3+build.01",
    "1.2.3-beta.1+build.01",
  ])("renders installation and post-check for exact %s", version => {
    const commands = renderBuildToolCommands(
      [{ packageName: "@example/tool", executable: "tool" }],
      { dependencies: { "@example/tool": version } }
    );
    expect(commands).toHaveLength(1);
    expect(commands[0]).toContain(`'@example/tool@${version}'`);
    expect(commands[0]).toContain("command -v tool");
    expect(commands[0]).toContain("export PATH=");
    expect(commands[0]).toContain("Build tool version mismatch: tool");
  });
  it.each([
    "^1.2.3",
    "latest",
    "01.2.3",
    "1.2",
    "1.2.3-beta..1",
    "1.2.3-01",
    "1.2.3+build..1",
    undefined,
    123,
  ])("rejects a nonexact manifest pin %j", version => {
    expect(() =>
      renderBuildToolCommands(
        [{ packageName: "tool", executable: "tool" }],
        external({ dependencies: { tool: version } })
      )
    ).toThrow(/exact semver/);
  });
  it.each([
    null,
    { packageName: 1, executable: "tool" },
    { packageName: "tool", executable: 1 },
    { packageName: "tool;echo", executable: "tool" },
    { packageName: "Tool", executable: "tool" },
    { packageName: "tool", executable: "tool;echo" },
    { packageName: "tool", executable: "1tool" },
    { packageName: "tool", executable: "tool", version: "1.2.3" },
  ])("rejects unsafe or second-source executable metadata %j", tool => {
    expect(() =>
      renderBuildToolCommands(external<AmplifyBuildTool[]>([tool]), {
        dependencies: { tool: "1.2.3" },
      })
    ).toThrow(/safe package/);
  });
  it("rejects a duplicate version source even when the values agree", () => {
    expect(() =>
      renderBuildToolCommands([{ packageName: "tool", executable: "tool" }], {
        dependencies: { tool: "1.2.3" },
        devDependencies: { tool: "1.2.3" },
      })
    ).toThrow(/duplicate sources/);
  });
  it.each([
    {
      tools: [
        { packageName: "tool", executable: "first" },
        { packageName: "tool", executable: "second" },
      ],
    },
    {
      tools: [
        { packageName: "first", executable: "tool" },
        { packageName: "second", executable: "tool" },
      ],
    },
  ])("rejects conflicting package or executable ownership %j", ({ tools }) => {
    expect(() =>
      renderBuildToolCommands(tools, {
        dependencies: { tool: "1.2.3", first: "1.2.3", second: "2.3.4" },
      })
    ).toThrow(/duplicate package/);
  });
});

describe("DNS delegation caller identity", () => {
  it("leaves absent and disabled entries inert", () => {
    expect(getDnsDelegations({ domains: [] })).toEqual([]);
    expect(
      getDnsDelegations(
        external({
          domains: [],
          dnsDelegation: { enabled: false, entries: [null] },
        })
      )
    ).toEqual([]);
  });
  it("normalizes names without mutating input and makes stable child identities", () => {
    const input = {
      ...delegation,
      parentDomain: "EXAMPLE.TEST.",
      childZoneName: "DEV.EXAMPLE.TEST.",
    };
    const [result] = dns([input]);
    expect(result).toMatchObject({
      parentDomain: "example.test",
      childZoneName: "dev.example.test",
    });
    expect(input.childZoneName).toBe("DEV.EXAMPLE.TEST.");
    expect(normalizeDnsName("A.TEST.")).toBe("a.test");
    expect(dnsDelegationId(result)).toBe(dnsDelegationId(delegation));
    expect(dnsDelegationId(result)).not.toBe(
      dnsDelegationId({ ...result, childZoneName: "other.example.test" })
    );
  });
  it.each([
    ["parentDomain", ""],
    ["parentDomain", "-example.test"],
    ["parentDomain", "a".repeat(254)],
    ["childZoneName", "example.test"],
    ["childZoneName", "dev.notexample.test"],
    ["childZoneName", "a..example.test"],
    ["childZoneName", `${"a".repeat(64)}.example.test`],
    ["parentAccountId", "123"],
    ["parentHostedZoneId", "zexample"],
    ["parentHostedZoneId", "Z*"],
    ["delegationRoleName", ""],
    ["delegationRoleName", "path/role"],
    ["delegationRoleName", "r".repeat(65)],
    ["trustedChildAccountIds", []],
    ["trustedChildAccountIds", ["bad"]],
    ["trustedChildAccountIds", ["222222222222", "222222222222"]],
  ])("rejects invalid delegation %s = %j", (field, value) => {
    expect(() => dns([{ ...delegation, [field]: value }])).toThrow(
      /DNS delegation/
    );
  });
  it("allows label and role length boundaries and one matching owner", () => {
    const entry = {
      ...delegation,
      childZoneName: `${"a".repeat(63)}.example.test`,
      delegationRoleName: "r".repeat(64),
    };
    expect(
      dns(
        [entry],
        external([{ accountId: "222222222222" }, { accountId: "333333333333" }])
      )
    ).toHaveLength(1);
  });
  it("rejects normalized duplicate children, reused parent roles and competing stage owners", () => {
    expect(() =>
      dns([
        delegation,
        {
          ...delegation,
          childZoneName: "DEV.EXAMPLE.TEST.",
          delegationRoleName: "second",
        },
      ])
    ).toThrow(/Duplicate.*childZoneName/);
    expect(() =>
      dns([delegation, { ...delegation, childZoneName: "other.example.test" }])
    ).toThrow(/Duplicate.*role/);
    expect(() =>
      dns(
        [delegation],
        external([{ accountId: "222222222222" }, { accountId: "222222222222" }])
      )
    ).toThrow(/multiple stages/);
  });
});

describe("GraphQL metric manifest contract", () => {
  it("returns nothing for absent or disabled settings without validating inert fields", () => {
    expect(validateGraphqlMonitoring()).toBeUndefined();
    expect(
      validateGraphqlMonitoring(external({ enabled: false }))
    ).toBeUndefined();
    expect(validateGraphqlMonitoring(graphql)).toBe(graphql);
  });
  it.each([
    ["namespace", undefined],
    ["namespace", ""],
    ["namespace", " x"],
    ["namespace", "x\n"],
    ["namespace", "x".repeat(256)],
    ["namespace", "AWS/Private"],
    ["stageDimension", ""],
    ["stageDimension", "x".repeat(256)],
    ["stageDimension", "dev\0"],
    ["minimumInvocations", 0],
    ["minimumInvocations", -1],
    ["minimumInvocations", 1.5],
    ["minimumInvocations", Infinity],
    ["latencyStatistic", "Sum"],
    ["operations", undefined],
    ["operations", []],
  ])("rejects invalid monitoring %s = %j", (field, value) => {
    expect(() =>
      validateGraphqlMonitoring(external({ ...graphql, [field]: value }))
    ).toThrow(/graphqlMonitoring/);
  });
  it.each(["errorRatePercent", "latencyMilliseconds"])(
    "rejects incoherent %s thresholds",
    field => {
      for (const value of [
        undefined,
        { warning: NaN, critical: 10 },
        { warning: 1, critical: Infinity },
        { warning: -1, critical: 10 },
        { warning: 10, critical: 10 },
        { warning: 11, critical: 10 },
      ]) {
        expect(() =>
          validateGraphqlMonitoring(external({ ...graphql, [field]: value }))
        ).toThrow(/graphqlMonitoring/);
      }
    }
  );
  it("accepts explicit service-text limits and all supported latency statistics", () => {
    for (const latencyStatistic of [
      "Average",
      "Maximum",
      "p95",
      "p99",
    ] as const) {
      expect(
        validateGraphqlMonitoring({
          ...graphql,
          namespace: "x".repeat(255),
          stageDimension: "x".repeat(255),
          latencyStatistic,
        })
      ).toBeDefined();
    }
    expect(() =>
      validateGraphqlMonitoring({
        ...graphql,
        errorRatePercent: { warning: 1, critical: 101 },
      })
    ).toThrow(/0..100/);
  });
  it.each([
    { name: "1Query", type: "query", public: false },
    { name: "x".repeat(129), type: "query", public: false },
    { name: "Query", type: "subscription", public: false },
    { name: "Query", type: "query", public: "false" },
  ])("rejects ambiguous operation %j", operation => {
    expect(() =>
      validateGraphqlMonitoring(
        external({ ...graphql, operations: [operation] })
      )
    ).toThrow(/manifest|operations/);
  });
  it("distinguishes operation type but rejects duplicate name/type", () => {
    const operations = [
      { name: "_" + "x".repeat(127), type: "query" as const, public: true },
      { name: "ReadItems", type: "mutation" as const, public: false },
    ];
    expect(validateGraphqlMonitoring({ ...graphql, operations })).toBeDefined();
    expect(() =>
      validateGraphqlMonitoring({
        ...graphql,
        operations: [graphql.operations[0], graphql.operations[0]],
      })
    ).toThrow(/duplicate/);
  });
});

describe("standard queue and worker contracts", () => {
  it("keeps omitted/disabled queues inert and resolves explicit/default names", () => {
    expect(() => validateQueues(undefined, scope)).not.toThrow();
    expect(() =>
      validateQueues(external({ enabled: false, definitions: [null] }), scope)
    ).not.toThrow();
    expect(queueName({ key: "jobs" }, "dev")).toBe("dev-jobs");
    expect(queueName({ key: "jobs", queueName: "explicit" }, "dev")).toBe(
      "explicit"
    );
    expect(() => queues({ key: "jobs" })).not.toThrow();
  });
  it.each([
    { enabled: "yes" },
    { enabled: true },
    { enabled: true, definitions: [] },
  ])("rejects incomplete enabled module %j", config => {
    expect(() => validateQueues(external(config), scope)).toThrow(/queues/);
  });
  it.each([
    ["key", ""],
    ["key", "1jobs"],
    ["key", "a".repeat(65)],
    ["queueName", ""],
    ["queueName", "jobs.fifo"],
    ["queueName", "q".repeat(77)],
    ["visibilityTimeoutSeconds", -1],
    ["visibilityTimeoutSeconds", 43201],
    ["visibilityTimeoutSeconds", 0.5],
    ["retentionSeconds", 59],
    ["retentionSeconds", 1209601],
    ["retentionSeconds", NaN],
    ["deadLetterRetentionSeconds", 59],
    ["deadLetterRetentionSeconds", 1209601],
    ["maxReceiveCount", 0],
    ["maxReceiveCount", 1001],
    ["maxReceiveCount", 1.5],
    ["backlogAgeThresholdSeconds", 0],
    ["backlogAgeThresholdSeconds", Infinity],
    ["notificationTopicArns", topic],
    ["notificationTopicArns", ["not-an-arn"]],
    ["notificationTopicArns", [`${topic}.fifo`]],
  ])("rejects queue %s = %j", (field, value) => {
    expect(() => queues({ key: "jobs", [field]: value })).toThrow(/queue/);
  });
  it.each([
    {
      visibilityTimeoutSeconds: 0,
      retentionSeconds: 60,
      deadLetterRetentionSeconds: 60,
      maxReceiveCount: 1,
      backlogAgeThresholdSeconds: 1,
    },
    {
      visibilityTimeoutSeconds: 43200,
      retentionSeconds: 1209600,
      deadLetterRetentionSeconds: 1209600,
      maxReceiveCount: 1000,
      backlogAgeThresholdSeconds: Number.MAX_SAFE_INTEGER,
    },
  ])("accepts inclusive queue service boundaries %j", limits => {
    expect(() =>
      queues({
        key: "a".repeat(64),
        queueName: "q".repeat(76),
        notificationTopicArns: [topic],
        ...limits,
      })
    ).not.toThrow();
  });
  it("rejects duplicate keys and collisions between source and DLQ names", () => {
    expect(() =>
      validateQueues(
        {
          enabled: true,
          definitions: [{ key: "jobs" }, { key: "jobs", queueName: "other" }],
        },
        scope
      )
    ).toThrow(/unique/);
    expect(() =>
      validateQueues(
        {
          enabled: true,
          definitions: [
            { key: "first", queueName: "jobs" },
            { key: "second", queueName: "jobs-dlq" },
          ],
        },
        scope
      )
    ).toThrow(/unique/);
  });
  it.each([
    ["functionArn", "bad"],
    ["executionRoleArn", "bad"],
    ["functionArn", `${worker.functionArn}:alias`],
    ["functionArn", worker.functionArn.replace(region, "us-west-2")],
    ["functionArn", worker.functionArn.replace(account, "222222222222")],
    [
      "executionRoleArn",
      worker.executionRoleArn.replace(account, "222222222222"),
    ],
    ["functionArn", worker.functionArn.replace("arn:aws:", "arn:aws-cn:")],
    [
      "executionRoleArn",
      worker.executionRoleArn.replace("arn:aws:", "arn:aws-cn:"),
    ],
    ["timeoutSeconds", 0],
    ["timeoutSeconds", 901],
    ["timeoutSeconds", 1.5],
    ["alarms", { errors: "yes" }],
    ["alarms", { throttles: 1 }],
  ])("rejects unsafe worker %s = %j", (field, value) => {
    expect(() =>
      queues({
        key: "jobs",
        visibilityTimeoutSeconds: 5400,
        worker: { ...worker, [field]: value },
      })
    ).toThrow(/queues/);
  });
  it("enforces the six-timeout visibility contract without narrowing valid boundaries", () => {
    expect(() => queues({ key: "jobs", worker })).not.toThrow();
    expect(() =>
      queues({ key: "jobs", worker, visibilityTimeoutSeconds: 179 })
    ).toThrow(/180 seconds/);
    expect(() =>
      queues({
        key: "jobs",
        worker: {
          ...worker,
          timeoutSeconds: 900,
          alarms: { errors: false, throttles: true },
        },
        visibilityTimeoutSeconds: 5400,
      })
    ).not.toThrow();
    expect(() =>
      queues({
        key: "jobs",
        worker: { ...worker, timeoutSeconds: 1 },
        visibilityTimeoutSeconds: 6,
      })
    ).not.toThrow();
  });
  it.each([
    ["cn-north-1", "aws-cn"],
    ["us-gov-west-1", "aws-us-gov"],
  ])(
    "accepts same-environment worker partition in %s",
    (owningRegion, partition) => {
      expect(() =>
        validateQueues(
          {
            enabled: true,
            definitions: [
              {
                key: "jobs",
                worker: {
                  ...worker,
                  functionArn: `arn:${partition}:lambda:${owningRegion}:${account}:function:worker`,
                  executionRoleArn: `arn:${partition}:iam::${account}:role/worker`,
                },
              },
            ],
          },
          { ...scope, region: owningRegion }
        )
      ).not.toThrow();
    }
  );
});

describe("metadata-only secret mapping configuration", () => {
  it("permits absent configuration, existing identifiers and explicit sync flags", () => {
    expect(() => validateSecretCopyConfig()).not.toThrow();
    for (const synchronizeChanges of [undefined, false, true])
      expect(() =>
        validateSecretCopyConfig({ mappings: [mapping], synchronizeChanges })
      ).not.toThrow();
  });
  it.each([{}, { mappings: [] }, { mappings: "bad" }])(
    "rejects missing mappings %j",
    config => {
      expect(() => validateSecretCopyConfig(external(config))).toThrow(
        /nonempty mappings/
      );
    }
  );
  it.each([
    null,
    { ...mapping, value: "inline" },
    { ...mapping, key: 1 },
    { ...mapping, parameterName: 1 },
    { ...mapping, secretArn: 1 },
    { ...mapping, key: "1api" },
    { ...mapping, key: "a".repeat(65) },
    { ...mapping, parameterName: "relative" },
    { ...mapping, parameterName: "/aws/private" },
    { ...mapping, parameterName: "/SSM/private" },
    { ...mapping, parameterName: "/a//b" },
    { ...mapping, parameterName: "/" + "a".repeat(1011) },
    { ...mapping, parameterName: "/a".repeat(16) },
    { ...mapping, secretArn: mapping.secretArn.replace("-Ab1234", "") },
    { ...mapping, secretArn: mapping.secretArn + "*" },
  ])("rejects values or malformed/widened secret identifiers %j", value => {
    expect(() =>
      validateSecretCopyConfig(
        external<SecretCopyConfig>({ mappings: [value] })
      )
    ).toThrow(/Secret copy/);
  });
  it("rejects duplicate stable keys and destinations independently", () => {
    expect(() =>
      validateSecretCopyConfig({
        mappings: [
          mapping,
          {
            ...mapping,
            secretArn: mapping.secretArn.replace("api-", "other-"),
          },
        ],
      })
    ).toThrow(/unique/);
    expect(() =>
      validateSecretCopyConfig({
        mappings: [mapping, { ...mapping, key: "other" }],
      })
    ).toThrow(/unique/);
    expect(() =>
      validateSecretCopyConfig(
        external({ mappings: [mapping], synchronizeChanges: "yes" })
      )
    ).toThrow(/boolean/);
  });
  it.each([
    123,
    "",
    `arn:aws:kms:${region}:${account}:alias/application`,
    `arn:aws:kms:${region}:${account}:key/*`,
    `arn:aws:kms:${region}:${account}:key/11111111-1111-1111-1111-111111111111:extra`,
  ])("rejects nonexact customer key reference %j", keyArn => {
    for (const field of ["sourceKeyArn", "targetKeyArn"])
      expect(() =>
        validateSecretCopyConfig(
          external({ mappings: [{ ...mapping, [field]: keyArn }] })
        )
      ).toThrow(/exact customer-managed KMS/);
  });
  it.each(["11111111-1111-1111-1111-111111111111", "mrk-" + "a".repeat(32)])(
    "accepts exact UUID/MRK key %s",
    key => {
      expect(() =>
        validateSecretCopyConfig({
          mappings: [
            {
              ...mapping,
              key: "a".repeat(64),
              parameterName: "/" + "a".repeat(1010),
              sourceKeyArn: `arn:aws:kms:${region}:${account}:key/${key}`,
              targetKeyArn: `arn:aws:kms:${region}:${account}:key/${key}`,
            },
          ],
        })
      ).not.toThrow();
    }
  );
});

describe("account-scoped optional SMS configuration", () => {
  it("does not require inert settings until explicitly enabled", () => {
    expect(() =>
      validateSmsMonitoring(undefined, "PLACEHOLDER", region)
    ).not.toThrow();
    expect(() =>
      validateSmsMonitoring({ enabled: false }, "PLACEHOLDER", region)
    ).not.toThrow();
    expect(() =>
      validateSmsMonitoring(external({ enabled: "yes" }), account, region)
    ).toThrow(/boolean/);
  });
  it.each(["monthlyPreferenceUsd", "dailyCapUsd", "fiveMinuteSurgeUsd"])(
    "rejects nonpositive/nonfinite/missing %s",
    field => {
      for (const value of [undefined, "10", 0, -1, NaN, Infinity])
        expect(() =>
          validateSmsMonitoring(
            external({ ...sms, [field]: value }),
            account,
            region
          )
        ).toThrow(/positive/);
    }
  );
  it.each([undefined, "80", NaN, Infinity, 0, 100, -1, 101])(
    "rejects invalid warning percent %j",
    warningPercent => {
      expect(() =>
        validateSmsMonitoring(
          external({ ...sms, warningPercent }),
          account,
          region
        )
      ).toThrow(/warningPercent/);
    }
  );
  it("accepts positive decimal budgets, equality cap, observe/default and enforce", () => {
    for (const mode of [undefined, "observe", "enforce"] as const)
      expect(() =>
        validateSmsMonitoring(
          {
            ...sms,
            monthlyPreferenceUsd: 0.01,
            dailyCapUsd: 0.01,
            fiveMinuteSurgeUsd: 0.001,
            warningPercent: 0.01,
            mode,
          },
          account,
          region
        )
      ).not.toThrow();
    expect(() =>
      validateSmsMonitoring({ ...sms, dailyCapUsd: 101 }, account, region)
    ).toThrow(/dailyCapUsd/);
    expect(() =>
      validateSmsMonitoring(
        external({ ...sms, mode: "automatic" }),
        account,
        region
      )
    ).toThrow(/mode/);
  });
  it.each([
    undefined,
    "",
    "bad",
    `${topic}.fifo`,
    topic.replace("arn:aws:", "arn:aws-cn:"),
    topic.replace(region, "us-west-2"),
    topic.replace(account, "222222222222"),
  ])("rejects mismatched or missing destination %j", notificationTopicArn => {
    expect(() =>
      validateSmsMonitoring({ ...sms, notificationTopicArn }, account, region)
    ).toThrow(/account\/region/);
  });
  it("rejects unresolved owning identity even with a valid destination", () => {
    expect(() => validateSmsMonitoring(sms, "PLACEHOLDER", region)).toThrow(
      /account\/region/
    );
  });
  it.each([
    ["cn-north-1", "aws-cn"],
    ["us-gov-west-1", "aws-us-gov"],
  ])(
    "accepts matching concrete SMS partition in %s",
    (owningRegion, partition) => {
      expect(() =>
        validateSmsMonitoring(
          {
            ...sms,
            notificationTopicArn: `arn:${partition}:sns:${owningRegion}:${account}:alerts`,
          },
          account,
          owningRegion
        )
      ).not.toThrow();
    }
  );
});
