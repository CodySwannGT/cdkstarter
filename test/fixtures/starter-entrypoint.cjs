/**
 * Offline fixture that configures and then loads the real starter entrypoint.
 * Each CDK CLI invocation runs in its own process, so configuration mutations
 * cannot leak into another scenario or into the checked-in configuration.
 */
const {
  stageEnvironments,
  supportEnvironments,
} = require("../../config/environments.ts");
const { domainConfig } = require("../../config/domains.ts");
const { githubConfig } = require("../../config/github.ts");
const { agentOperationsConfig } = require("../../config/agent-operations.ts");

githubConfig.owner = "example";
githubConfig.ownerId = "123456";
githubConfig.deployRepositories = [
  { name: "backend", id: "456789", refs: ["refs/heads/main"] },
];

const mode = process.argv[2];
if (!["direct", "pipeline", "frontend-only"].includes(mode)) {
  throw new Error("Expected direct, pipeline, or frontend-only fixture mode");
}

stageEnvironments.splice(1);
const environment = stageEnvironments[0];
environment.accountId = "111111111111";
environment.region = "us-east-1";
domainConfig.domains.splice(0);
agentOperationsConfig.enabled = false;

const shared = supportEnvironments[0];
shared.accountId = "999999999999";
shared.region = "us-east-1";
shared.purpose.dns = false;
shared.purpose.codeConnections = false;
shared.purpose.flowLogs = false;
shared.purpose.pipeline = mode === "pipeline";
githubConfig.codeConnectionArn =
  mode === "pipeline"
    ? "arn:aws:codestar-connections:us-east-1:999999999999:connection/00000000-0000-0000-0000-000000000000"
    : "PLACEHOLDER";

if (mode === "frontend-only") {
  shared.accountId = "PLACEHOLDER";
  environment.features = {
    network: false,
    observability: false,
    aurora: false,
    valkey: false,
    cognito: false,
    ssmRelay: false,
    githubOidcDeploy: false,
    migrationRunner: false,
    xray: false,
    waf: false,
    shieldAdvanced: false,
    backup: false,
    amplifyHosting: true,
  };
  environment.amplifyHosting = {
    owner: "example",
    repository: "frontend",
    branch: "dev",
    oauthTokenSecretName: "fixture/amplify/token",
  };
}

process.env.CDK_CONTEXT_JSON = JSON.stringify({
  ...JSON.parse(process.env.CDK_CONTEXT_JSON ?? "{}"),
  "availability-zones:account=111111111111:region=us-east-1": [
    "us-east-1a",
    "us-east-1b",
  ],
  "availability-zones:account=999999999999:region=us-east-1": [
    "us-east-1a",
    "us-east-1b",
  ],
});

require("../../bin/app.ts");
