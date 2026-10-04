/** Offline optional Amplify contracts; no account or live event delivery. */
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { load } from "js-yaml";
import { AmplifyHostingStack } from "../../lib/stacks/edge/amplify-hosting-stack";
import type { AmplifyHostingConfig } from "../../lib/types";
import { stageEnvironments } from "../../config/environments";
import { dashboardWidgets } from "../../config/observability";
import { validateConfiguration } from "../../util/config-loader";

const fallback = String.raw`</^[^.]+$|\.(?!(css|gif|html|ico|jpg|jpeg|js|json|map|otf|png|svg|ttf|txt|webp|webmanifest|woff2?)$)([^.]+$)/>`;
const topic = "arn:aws:sns:us-east-1:111111111111:frontend-builds";
const hosting = {
  owner: "example",
  repository: "frontend",
  branch: "main",
  oauthTokenSecretName: "example/amplify/github-token",
  preBuildCommands: ["npm ci"],
  buildCommands: ["npm run build"],
};
const render = (options: Record<string, unknown> = {}) => {
  const app = new cdk.App();
  const stack = new AmplifyHostingStack(app, "Hosting", {
    env: { account: "111111111111", region: "us-east-1" },
    stageName: "dev",
    hosting: { ...hosting, ...options } as AmplifyHostingConfig,
  });
  return Template.fromStack(stack).toJSON();
};
const resources = (template: ReturnType<typeof render>, type: string) =>
  Object.entries(template.Resources).filter(
    ([, resource]) => (resource as { Type: string }).Type === type
  );
const properties = (template: ReturnType<typeof render>, type: string) =>
  (resources(template, type)[0]?.[1] as { Properties: Record<string, any> })
    ?.Properties;
const validate = (options: Record<string, unknown>) =>
  validateConfiguration({
    stages: [
      {
        ...stageEnvironments[0],
        amplifyHosting: { ...hosting, ...options } as AmplifyHostingConfig,
        features: { ...stageEnvironments[0].features, amplifyHosting: true },
      },
    ],
    supports: [],
    dashboardWidgets,
  });

// Exercise the rendered pattern's exact scalar constraints on representative events.
const matches = (
  pattern: Record<string, any>,
  event: Record<string, any>
): boolean =>
  Object.entries(pattern).every(([key, expected]) =>
    Array.isArray(expected)
      ? expected.some(
          value => JSON.stringify(value) === JSON.stringify(event[key])
        )
      : matches(expected, event[key] ?? {})
  );

describe("optional Amplify hosting", () => {
  it("retains the complete disabled template and app/branch/build identities", () => {
    const template = render();
    expect(
      render({
        spaFallback: { enabled: false },
        buildFailureNotifications: { enabled: false },
      })
    ).toEqual(template);
    expect(
      properties(template, "AWS::Amplify::App").CustomRules
    ).toBeUndefined();
    expect(
      properties(template, "AWS::Amplify::App").CustomHeaders
    ).toBeUndefined();
    expect(resources(template, "AWS::Events::Rule")).toHaveLength(0);
    expect(
      load(properties(template, "AWS::Amplify::App").BuildSpec)
    ).toMatchObject({
      frontend: {
        phases: {
          preBuild: { commands: ["npm ci"] },
          build: { commands: ["npm run build"] },
        },
      },
    });
  });
  it("appends SPA fallback after the explicit redirect and bypasses real static HTML/assets", () => {
    const rules = properties(
      render({
        spaFallback: { enabled: true },
        customRules: [{ source: "/old", target: "/new", status: "301" }],
      }),
      "AWS::Amplify::App"
    ).CustomRules;
    expect(rules).toEqual([
      { Source: "/old", Target: "/new", Status: "301" },
      { Source: fallback, Target: "/index.html", Status: "200" },
    ]);
    const matcher = new RegExp(rules[1].Source.slice(2, -2));
    for (const path of ["/", "/account/settings", "/nested/route"])
      expect(matcher.test(path), path).toBe(true);
    for (const path of [
      "/auth/callback.html",
      "/style.css",
      "/script.js",
      "/icon.svg",
      "/font.woff2",
      "/manifest.webmanifest",
    ])
      expect(matcher.test(path), path).toBe(false);
  });
  it("does not duplicate an explicit equivalent SPA fallback", () => {
    expect(
      properties(
        render({
          spaFallback: { enabled: true },
          customRules: [
            { source: fallback, target: "/index.html", status: "200" },
          ],
        }),
        "AWS::Amplify::App"
      ).CustomRules
    ).toHaveLength(1);
  });
  it("honors explicit rules even without SPA fallback", () => {
    expect(
      properties(
        render({
          customRules: [
            { source: "/legacy", target: "/current", status: "302" },
          ],
        }),
        "AWS::Amplify::App"
      ).CustomRules
    ).toEqual([{ Source: "/legacy", Target: "/current", Status: "302" }]);
  });
  it("renders only caller-defined headers on their explicit path patterns", () => {
    const headers = properties(
      render({
        customHeaders: [
          {
            pattern: "/assets/*",
            headers: {
              "Cache-Control": "max-age=3600",
              "X-Content-Type-Options": "nosniff",
            },
          },
        ],
      }),
      "AWS::Amplify::App"
    ).CustomHeaders;
    expect(load(headers)).toEqual({
      customHeaders: [
        {
          pattern: "/assets/*",
          headers: [
            { key: "Cache-Control", value: "max-age=3600" },
            { key: "X-Content-Type-Options", value: "nosniff" },
          ],
        },
      ],
    });
  });
  it.each(["307", "500", "bad"])(
    "rejects unsupported redirect status %s at config and constructor boundaries",
    status => {
      const options = {
        customRules: [{ source: "/old", target: "/new", status }],
      };
      expect(() => validate(options)).toThrow(/status/);
      expect(() => render(options)).toThrow(/status/);
    }
  );
  it.each([
    { headers: { "X-Bad\nName": "value" } },
    { headers: { "X-Test": "bad\r\nvalue" } },
  ])("rejects malformed multiline header input %j before synth", input => {
    const options = { customHeaders: [{ pattern: "**", ...input }] };
    expect(() => validate(options)).toThrow(/header/i);
    expect(() => render(options)).toThrow(/header/i);
  });
  it("requires an explicit SNS destination when build alerts are enabled", () => {
    const options = { buildFailureNotifications: { enabled: true } };
    expect(() => validate(options)).toThrow(/topic/i);
    expect(() => render(options)).toThrow(/topic/i);
  });
  it.each([
    { spaFallback: { enabled: "false" } },
    { buildFailureNotifications: { enabled: "false" } },
  ])("rejects nonboolean optional flags %j", options => {
    expect(() => validate(options)).toThrow(/boolean/);
    expect(() => render(options)).toThrow(/boolean/);
  });
  it.each([
    { enabled: true, topicArn: "arn:aws:sqs:us-east-1:111111111111:queue" },
    { enabled: true, topicArn: topic, branches: [] },
  ])("rejects ineligible notification input %j", options => {
    expect(() => validate({ buildFailureNotifications: options })).toThrow(
      /topic|branches/i
    );
    expect(() => render({ buildFailureNotifications: options })).toThrow(
      /topic|branches/i
    );
  });

  it("scopes FAILED events to this exact application and explicit branches/target", () => {
    const template = render({
      buildFailureNotifications: {
        enabled: true,
        topicArn: topic,
        branches: ["main", "preview"],
      },
    });
    const appId = resources(template, "AWS::Amplify::App")[0][0];
    const rule = properties(template, "AWS::Events::Rule");
    expect(rule.EventPattern).toEqual({
      source: ["aws.amplify"],
      "detail-type": ["Amplify Deployment Status Change"],
      detail: {
        appId: [{ "Fn::GetAtt": [appId, "AppId"] }],
        branchName: ["main", "preview"],
        jobStatus: ["FAILED"],
      },
    });
    expect(rule.Targets).toHaveLength(1);
    expect(rule.Targets[0]).toMatchObject({ Arn: topic, Id: "Target0" });
    const roleId = rule.Targets[0].RoleArn["Fn::GetAtt"][0];
    expect(
      template.Resources[roleId].Properties.AssumeRolePolicyDocument.Statement
    ).toEqual([
      {
        Action: "sts:AssumeRole",
        Effect: "Allow",
        Principal: { Service: "events.amazonaws.com" },
      },
    ]);
    const publish = resources(template, "AWS::IAM::Policy")
      .map(([, resource]) => (resource as any).Properties)
      .find(policy => policy.Roles?.some((role: any) => role.Ref === roleId));
    expect(publish.PolicyDocument.Statement).toEqual([
      { Action: "sns:Publish", Effect: "Allow", Resource: topic },
    ]);
    const event = {
      source: "aws.amplify",
      "detail-type": "Amplify Deployment Status Change",
      detail: {
        appId: { "Fn::GetAtt": [appId, "AppId"] },
        branchName: "main",
        jobStatus: "FAILED",
      },
    };
    expect(matches(rule.EventPattern, event)).toBe(true);
    for (const change of [
      { jobStatus: "SUCCEED" },
      { appId: "unrelated-app" },
      { branchName: "other" },
    ])
      expect(
        matches(rule.EventPattern, {
          ...event,
          detail: { ...event.detail, ...change },
        })
      ).toBe(false);
    expect(
      matches(rule.EventPattern, { ...event, source: "unrelated.service" })
    ).toBe(false);
    expect(resources(template, "AWS::SNS::TopicPolicy")).toHaveLength(0);
  });
  it("defaults alerts to the configured source branch", () => {
    const template = render({
      buildFailureNotifications: { enabled: true, topicArn: topic },
    });
    expect(
      properties(template, "AWS::Events::Rule").EventPattern.detail.branchName
    ).toEqual(["main"]);
  });
  it("adds no build commands, IAM changes or integrations when only SPA routing is enabled", () => {
    const before = render();
    const after = render({ spaFallback: { enabled: true } });
    expect(properties(after, "AWS::Amplify::App").BuildSpec).toEqual(
      properties(before, "AWS::Amplify::App").BuildSpec
    );
    for (const type of ["AWS::IAM::Role", "AWS::IAM::Policy"])
      expect(resources(after, type)).toEqual(resources(before, type));
    for (const type of [
      "AWS::Events::Rule",
      "AWS::Events::ApiDestination",
      "AWS::Lambda::Function",
      "AWS::SNS::Topic",
    ])
      expect(resources(after, type)).toHaveLength(0);
  });
});
