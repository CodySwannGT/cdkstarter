/** Offline database-user boundary: synthesized IAM/proxy and mocked bootstrap. */
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { resolve } from "node:path";
import { rmSync } from "node:fs";
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

const createFakeSecret = (username: string, label: string) => ({
  username,
  password: ["synthetic", "fixture", label, "only"].join("-"),
});

describe("starter application database access", () => {
  const outdirs: string[] = [];
  afterEach(() => {
    for (const outdir of outdirs.splice(0)) {
      rmSync(outdir, { recursive: true, force: true });
    }
  });
  it("grants only the configured proxy user and application secret, with separate read-only credentials", () => {
    const app = new cdk.App({
      context: {
        "availability-zones:account=111111111111:region=us-east-1": [
          "us-east-1a",
          "us-east-1b",
        ],
      },
    });
    outdirs.push(app.outdir);
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
    const membershipAdmin = new Map([
      ["app_user", true],
      ["reader_user", true],
    ]);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const secrets = {
        admin: createFakeSecret("clusteradmin", "admin"),
        application: createFakeSecret("app_user", "application"),
        readonly: createFakeSecret("reader_user", "reader"),
      };
      const clients = {
        getSecret: async (id: keyof typeof secrets) => secrets[id],
        execute: async (
          sql: string,
          admin: { username: string; password: string }
        ) => {
          expect(admin.username).toBe("clusteradmin");
          expect(admin.password).toBe(secrets.admin.password);
          statements.push(sql);
          for (const line of sql.split("\n")) {
            const revokeAdmin =
              /^REVOKE ADMIN OPTION FOR rds_iam FROM "([a-z_]+)";/.exec(line);
            if (revokeAdmin) membershipAdmin.set(revokeAdmin[1], false);
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
      expect([...membershipAdmin.values()]).toEqual([false, false]);
      expect(statements).toHaveLength(2);
      expect(statements[0]).toBe(statements[1]);
      expect(statements[0]).toContain("IF NOT EXISTS");
      for (const secret of Object.values(secrets)) {
        expect(statements[0]).not.toContain(secret.password);
      }
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
      expect(statements[0]).toContain(
        'REVOKE ADMIN OPTION FOR rds_iam FROM "app_user"'
      );
      expect(statements[0]).toContain('GRANT rds_iam TO "app_user"');
      expect(statements[0]).toContain("membership.admin_option");
      expect(statements[0]).toContain(
        'ALTER DEFAULT PRIVILEGES FOR ROLE "clusteradmin"'
      );
      expect(statements[0]).toContain(
        "NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS"
      );
      for (const secret of Object.values(secrets)) {
        expect(JSON.stringify([log.mock.calls, info.mock.calls])).not.toContain(
          secret.password
        );
      }
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
      getSecret: async () => createFakeSecret("clusteradmin", "rejection"),
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

  it("fails closed on conflicting owner global defaults before applying grants, while leaving unrelated defaults untouched", async () => {
    const { bootstrapDatabaseUsers } = await bootstrapModule();
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
    const secrets = {
      admin: createFakeSecret("clusteradmin", "admin-rejection"),
      application: createFakeSecret("app_user", "application-rejection"),
      readonly: createFakeSecret("reader_user", "reader-rejection"),
    };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      // Model owner global ACL rows separately from schema-local grants: local
      // REVOKE cannot remove these future-object rights in PostgreSQL.
      for (const acl of [
        { grantee: "PUBLIC", kind: "r", privilege: "INSERT", grantable: false },
        { grantee: "PUBLIC", kind: "S", privilege: "USAGE", grantable: false },
        ...["INSERT", "UPDATE", "DELETE"].map(privilege => ({
          grantee: "reader_user",
          kind: "r",
          privilege,
          grantable: false,
        })),
        {
          grantee: "reader_user",
          kind: "S",
          privilege: "SELECT",
          grantable: false,
        },
        {
          grantee: "reader_user",
          kind: "r",
          privilege: "SELECT",
          grantable: true,
        },
        {
          grantee: "app_user",
          kind: "r",
          privilege: "TRIGGER",
          grantable: false,
        },
        {
          grantee: "app_user",
          kind: "S",
          privilege: "UPDATE",
          grantable: false,
        },
        {
          grantee: "app_user",
          kind: "r",
          privilege: "SELECT",
          grantable: true,
        },
      ]) {
        const applied = vi.fn();
        const globalDefaults = [
          { ...acl, owner: "clusteradmin", namespace: 0 },
        ];
        const execute = vi.fn(async (sql: string) => {
          // A bounded catalog model preserves global defaults independently of
          // local REVOKE. Without the query, old code applies grants/succeeds.
          if (
            sql.includes("FROM pg_default_acl") &&
            sql.includes("aclexplode") &&
            sql.includes("defaclnamespace = 0")
          ) {
            expect(sql).toContain(
              "defaclrole = (SELECT oid FROM pg_roles WHERE rolname = 'clusteradmin')"
            );
            expect(sql).toContain("is_grantable");
            expect(sql).toContain("privilege_type");
            expect(sql.indexOf("FROM pg_default_acl")).toBeLessThan(
              sql.indexOf("REVOKE CREATE")
            );
            expect(sql).toContain("privileges.grantee = 0");
            expect(sql).toContain(
              "privilege_type NOT IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')"
            );
            expect(sql).toContain("privilege_type NOT IN ('USAGE', 'SELECT')");
            expect(sql).toContain("privilege_type NOT IN ('SELECT')");
            const conflicts = globalDefaults
              .filter(row => row.owner === options.owner && row.namespace === 0)
              .filter(
                row =>
                  row.grantee === "PUBLIC" ||
                  row.grantable ||
                  (row.grantee === "reader_user" &&
                    (row.kind === "S" || row.privilege !== "SELECT")) ||
                  (row.grantee === "app_user" &&
                    !(
                      row.kind === "r"
                        ? ["SELECT", "INSERT", "UPDATE", "DELETE"]
                        : ["USAGE", "SELECT"]
                    ).includes(row.privilege))
              );
            if (conflicts.length)
              throw new Error(
                ["global ACL conflict", secrets.admin.password].join(": ")
              );
          }
          applied();
        });
        const rejectedBootstrap = bootstrapDatabaseUsers(options, {
          getSecret: async (id: keyof typeof secrets) => secrets[id],
          execute,
        });
        await expect(rejectedBootstrap).rejects.toThrow(
          "Database bootstrap failed"
        );
        for (const secret of Object.values(secrets)) {
          await expect(rejectedBootstrap).rejects.not.toThrow(secret.password);
        }
        expect(applied).not.toHaveBeenCalled();
        expect(execute).toHaveBeenCalledOnce();
        expect(globalDefaults).toEqual([
          { ...acl, owner: "clusteradmin", namespace: 0 },
        ]);
      }
      const unrelatedDefaults = [
        {
          owner: "another_owner",
          namespace: 0,
          grantee: "PUBLIC",
          privilege: "INSERT",
        },
        {
          owner: "clusteradmin",
          namespace: 0,
          grantee: "unrelated_user",
          privilege: "INSERT",
        },
        {
          owner: "clusteradmin",
          namespace: 0,
          grantee: "app_user",
          privilege: "INSERT",
        },
        {
          owner: "clusteradmin",
          namespace: 0,
          grantee: "reader_user",
          privilege: "SELECT",
        },
      ];
      const originalDefaults = JSON.stringify(unrelatedDefaults);
      const execute = vi.fn(async (sql: string) => {
        // Unrelated owner/grantee rows and least-privilege SELECT/DML globals
        // remain unchanged. Every generated default ACL mutation stays local.
        expect(sql).toContain("defaclobjtype IN ('r', 'S')");
        expect(sql).toContain("grantee.rolname = 'reader_user'");
        expect(sql).toContain("grantee.rolname = 'app_user'");
        for (const line of sql
          .split("\n")
          .filter(line => line.startsWith("ALTER DEFAULT PRIVILEGES"))) {
          expect(line).toContain('IN SCHEMA "application_schema"');
        }
      });
      await expect(
        bootstrapDatabaseUsers(options, {
          getSecret: async (id: keyof typeof secrets) => secrets[id],
          execute,
        })
      ).resolves.toBeUndefined();
      expect(execute).toHaveBeenCalledOnce();
      expect(JSON.stringify(unrelatedDefaults)).toBe(originalDefaults);
      for (const secret of Object.values(secrets)) {
        expect(JSON.stringify(log.mock.calls)).not.toContain(secret.password);
      }
    } finally {
      log.mockRestore();
    }
  });
});
