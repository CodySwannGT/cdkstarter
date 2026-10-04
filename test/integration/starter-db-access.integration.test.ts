/** Offline database-user boundary: synthesized IAM/proxy and mocked bootstrap. */
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { resolve } from "node:path";
import { stageEnvironments } from "../../config/environments";
import { alarmThresholds } from "../../config/observability";
import { EnvironmentStage } from "../../lib/stages/environment-stage";

const bootstrapModule = async () =>
  import(
    /* @vite-ignore */ resolve(
      __dirname,
      "../../scripts/bootstrap-database-users.mjs"
    )
  ).catch(() => ({ bootstrapDatabaseUsers: undefined }));

describe("starter application database access", () => {
  it("grants only the configured proxy user and application secret, with separate read-only credentials", () => {
    const app = new cdk.App({
      context: {
        "availability-zones:account=111111111111:region=us-east-1": [
          "us-east-1a",
          "us-east-1b",
        ],
      },
    });
    const environment = {
      ...stageEnvironments[0],
      accountId: "111111111111",
      aurora: {
        ...stageEnvironments[0].aurora,
        applicationUsername: "app_user",
        readOnlyUsername: "reader_user",
      },
    };
    const stage = new EnvironmentStage(app, "Env-dev", {
      environment,
      alarmThresholds,
      env: { account: "111111111111", region: "us-east-1" },
    });
    const database = Template.fromStack(
      stage.node.findChild("AuroraStack") as cdk.Stack
    );
    const iam = JSON.stringify(
      Template.fromStack(stage.node.findChild("IamStack") as cdk.Stack).toJSON()
    );
    expect(iam).toContain("dbuser:");
    expect(iam).toContain("/app_user");
    expect(iam).toContain("ApplicationCredentials");
    expect(iam).not.toContain("AuroraClusterSecret");
    expect(iam).not.toContain("/reader_user");
    database.resourceCountIs("AWS::SecretsManager::Secret", 3);
    database.hasResourceProperties("AWS::RDS::DBCluster", {
      EnableIAMDatabaseAuthentication: true,
    });
    const proxies = Object.values(database.findResources("AWS::RDS::DBProxy"));
    expect(proxies[0].Properties.DefaultAuthScheme).toBe("IAM_AUTH");
    expect(proxies[0].Properties.Auth).toBeUndefined();
  });

  it("repeats mocked application/read-only bootstrap with convergent least privileges and no secret logging", async () => {
    const { bootstrapDatabaseUsers } = await bootstrapModule();
    expect(bootstrapDatabaseUsers).toBeTypeOf("function");
    const statements: string[] = [];
    // Existing mocked users include stale write grants; execute the emitted
    // table GRANT/REVOKE statements against this bounded PostgreSQL model.
    const permissions = new Map([
      ["app_user", new Set(["CREATE", "SELECT"])],
      ["reader_user", new Set(["INSERT", "SELECT"])],
    ]);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const secrets = {
        admin: { username: "clusteradmin", password: "admin-password" },
        application: { username: "app_user", password: "application-password" },
        readonly: { username: "reader_user", password: "reader-password" },
      };
      const clients = {
        getSecret: async (id: keyof typeof secrets) => secrets[id],
        execute: async (
          sql: string,
          admin: { username: string; password: string }
        ) => {
          expect(admin.username).toBe("clusteradmin");
          expect(admin.password).toBe("admin-password");
          statements.push(sql);
          for (const line of sql.split("\n")) {
            const revoke =
              /^REVOKE ALL PRIVILEGES ON ALL TABLES .* FROM "([a-z_]+)";/.exec(
                line
              );
            if (revoke) permissions.set(revoke[1], new Set());
            const grant =
              /^GRANT ([A-Z, ]+) ON ALL TABLES .* TO "([a-z_]+)";/.exec(line);
            if (grant) permissions.set(grant[2], new Set(grant[1].split(", ")));
          }
        },
      };
      const options = {
        database: "application_db",
        schema: "application_schema",
        owner: "clusteradmin",
        adminSecret: "admin",
        applicationSecret: "application",
        applicationUsername: "app_user",
        readOnlySecret: "readonly",
        readOnlyUsername: "reader_user",
      };
      await bootstrapDatabaseUsers(options, clients);
      const firstGrants = [...permissions].map(([name, grants]) => [
        name,
        [...grants],
      ]);
      await bootstrapDatabaseUsers(options, clients);
      expect(
        [...permissions].map(([name, grants]) => [name, [...grants]])
      ).toEqual(firstGrants);
      expect([...permissions.get("app_user")!]).toEqual([
        "SELECT",
        "INSERT",
        "UPDATE",
        "DELETE",
      ]);
      expect([...permissions.get("reader_user")!]).toEqual(["SELECT"]);
      expect(statements).toHaveLength(2);
      expect(statements[0]).toBe(statements[1]);
      expect(statements[0]).toContain("IF NOT EXISTS");
      expect(statements[0]).not.toMatch(
        /admin-password|application-password|reader-password/
      );
      expect(statements[0]).toContain("PASSWORD NULL");
      expect(statements[0]).toContain(
        'GRANT CONNECT ON DATABASE "application_db"'
      );
      expect(statements[0]).toContain(
        'GRANT USAGE ON SCHEMA "application_schema"'
      );
      expect(statements[0]).toContain(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "application_schema" TO "app_user"'
      );
      expect(statements[0]).toContain(
        'GRANT SELECT ON ALL TABLES IN SCHEMA "application_schema" TO "reader_user"'
      );
      expect(statements[0]).not.toContain(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "application_schema" TO "reader_user"'
      );
      expect(statements[0]).toContain('GRANT rds_iam TO "app_user"');
      expect(statements[0]).toContain(
        'ALTER DEFAULT PRIVILEGES FOR ROLE "clusteradmin"'
      );
      expect(statements[0]).toContain(
        "NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS"
      );
      expect(JSON.stringify([log.mock.calls, info.mock.calls])).not.toMatch(
        /admin-password|application-password|reader-password/
      );
    } finally {
      log.mockRestore();
      info.mockRestore();
    }
  });

  it("rejects admin-user reuse and mismatched secret usernames without executing SQL or exposing secrets", async () => {
    const { bootstrapDatabaseUsers } = await bootstrapModule();
    expect(bootstrapDatabaseUsers).toBeTypeOf("function");
    const execute = vi.fn();
    const clients = {
      getSecret: async () => ({
        username: "clusteradmin",
        password: "never-log-me",
      }),
      execute,
    };
    await expect(
      bootstrapDatabaseUsers(
        {
          database: "application_db",
          schema: "application_schema",
          owner: "clusteradmin",
          adminSecret: "admin",
          applicationSecret: "app",
          applicationUsername: "clusteradmin",
        },
        clients
      )
    ).rejects.toThrow(/distinct|administrative/i);
    await expect(
      bootstrapDatabaseUsers(
        {
          database: "application_db",
          schema: "application_schema",
          owner: "clusteradmin",
          adminSecret: "admin",
          applicationSecret: "app",
          applicationUsername: "app_user",
        },
        clients
      )
    ).rejects.toThrow(/username/);
    expect(execute).not.toHaveBeenCalled();
  });
});
