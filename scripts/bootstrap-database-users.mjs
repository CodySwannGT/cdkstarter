#!/usr/bin/env node
/** Operator-only PostgreSQL bootstrap. Never called by a CDK deployment. */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const identifier = value => {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]{0,62}$/.test(value)) {
    throw new Error(
      "Database, schema, owner and usernames must be lowercase PostgreSQL identifiers."
    );
  }
  return `"${value}"`;
};

/** Repeatable grants for dedicated IAM-only users; secret values never enter SQL. */
export const bootstrapDatabaseUsers = async (options, clients) => {
  const database = identifier(options.database);
  const schema = identifier(options.schema);
  const owner = identifier(options.owner);
  const users = [
    {
      username: options.applicationUsername,
      secret: options.applicationSecret,
      readonly: false,
    },
    ...(options.readOnlyUsername || options.readOnlySecret
      ? [
          {
            username: options.readOnlyUsername,
            secret: options.readOnlySecret,
            readonly: true,
          },
        ]
      : []),
  ];
  users.forEach(user => identifier(user.username));
  if (
    !options.adminSecret ||
    users.some(
      user =>
        !user.secret ||
        user.secret === options.adminSecret ||
        user.username === "rdsadmin" ||
        user.username.startsWith("pg_") ||
        user.username.startsWith("rds_")
    ) ||
    new Set(users.map(user => user.username)).size !== users.length
  ) {
    throw new Error(
      "Runtime users and secret references must be distinct non-administrative accounts."
    );
  }
  try {
    const admin = await clients.getSecret(options.adminSecret);
    if (
      typeof admin.username !== "string" ||
      typeof admin.password !== "string" ||
      !admin.password
    ) {
      throw new Error("Invalid administrative credentials.");
    }
    if (
      users.some(
        user =>
          user.username === admin.username || user.username === options.owner
      )
    ) {
      throw new Error(
        "Runtime usernames must be distinct from the administrative and object-owner accounts."
      );
    }
    for (const user of users) {
      const secret = await clients.getSecret(user.secret);
      if (secret.username !== user.username)
        throw new Error(
          "Configured username does not match its secret username."
        );
    }
    const statements = users.map(user => {
      const name = identifier(user.username);
      const privileges = user.readonly
        ? "SELECT"
        : "SELECT, INSERT, UPDATE, DELETE";
      return `DO $bootstrap$
DECLARE membership record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${user.username}') THEN
    CREATE ROLE ${name} LOGIN;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relowner = (SELECT oid FROM pg_roles WHERE rolname = '${user.username}'))
    OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspowner = (SELECT oid FROM pg_roles WHERE rolname = '${user.username}'))
    OR EXISTS (SELECT 1 FROM pg_database WHERE datdba = (SELECT oid FROM pg_roles WHERE rolname = '${user.username}')) THEN
    RAISE EXCEPTION 'Dedicated runtime role owns objects; migrate ownership before bootstrap';
  END IF;
  FOR membership IN SELECT parent.rolname FROM pg_auth_members members JOIN pg_roles parent ON parent.oid = members.roleid JOIN pg_roles child ON child.oid = members.member WHERE child.rolname = '${user.username}' AND parent.rolname <> 'rds_iam' LOOP
    EXECUTE format('REVOKE %I FROM %I', membership.rolname, '${user.username}');
  END LOOP;
END $bootstrap$;
ALTER ROLE ${name} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD NULL;
REVOKE ALL PRIVILEGES ON DATABASE ${database} FROM ${name};
REVOKE ALL PRIVILEGES ON SCHEMA ${schema} FROM ${name};
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${schema} FROM ${name};
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ${schema} FROM ${name};
GRANT CONNECT ON DATABASE ${database} TO ${name};
GRANT USAGE ON SCHEMA ${schema} TO ${name};
GRANT ${privileges} ON ALL TABLES IN SCHEMA ${schema} TO ${name};
${user.readonly ? "" : `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${name};`}
ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA ${schema} REVOKE ALL ON TABLES FROM ${name};
ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA ${schema} REVOKE ALL ON SEQUENCES FROM ${name};
ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA ${schema} GRANT ${privileges} ON TABLES TO ${name};
${user.readonly ? "" : `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA ${schema} GRANT USAGE, SELECT ON SEQUENCES TO ${name};`}
REVOKE ADMIN OPTION FOR rds_iam FROM ${name};
GRANT rds_iam TO ${name};
DO $role_admin$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_auth_members membership
    JOIN pg_roles parent ON parent.oid = membership.roleid
    JOIN pg_roles child ON child.oid = membership.member
    WHERE parent.rolname = 'rds_iam' AND child.rolname = '${user.username}'
      AND membership.admin_option
  ) THEN
    RAISE EXCEPTION 'Runtime rds_iam ADMIN OPTION remains; review membership grantors before bootstrap';
  END IF;
END $role_admin$;`;
    });
    // Schema-local defaults add to global ACLs, so local REVOKE cannot undo
    // conflicting global rights. Fail closed without mutating other schemas.
    const globalConflicts = users.map(user => {
      const tablePrivileges = user.readonly
        ? "'SELECT'"
        : "'SELECT', 'INSERT', 'UPDATE', 'DELETE'";
      const sequenceConflict = user.readonly
        ? "defaults.defaclobjtype = 'S'"
        : "(defaults.defaclobjtype = 'S' AND privileges.privilege_type NOT IN ('USAGE', 'SELECT'))";
      return `(grantee.rolname = '${user.username}' AND (
        privileges.is_grantable
        OR (defaults.defaclobjtype = 'r' AND privileges.privilege_type NOT IN (${tablePrivileges}))
        OR ${sequenceConflict}
      ))`;
    });
    const globalDefaultPreflight = `DO $global_defaults$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_default_acl defaults
    CROSS JOIN LATERAL aclexplode(defaults.defaclacl) privileges
    LEFT JOIN pg_roles grantee ON grantee.oid = privileges.grantee
    WHERE defaults.defaclrole = (SELECT oid FROM pg_roles WHERE rolname = '${options.owner}')
      AND defaults.defaclnamespace = 0
      AND defaults.defaclobjtype IN ('r', 'S')
      AND (privileges.grantee = 0 OR ${globalConflicts.join(" OR ")})
  ) THEN
    RAISE EXCEPTION 'Conflicting owner global default ACLs; review the database-user migration runbook';
  END IF;
END $global_defaults$;`;
    // PUBLIC privileges can otherwise bypass per-user revocations. This script
    // operates only on the caller-selected database/schema; review the runbook.
    const sql = `BEGIN;\n${globalDefaultPreflight}\nREVOKE CREATE ON DATABASE ${database} FROM PUBLIC;\nREVOKE CREATE ON SCHEMA ${schema} FROM PUBLIC;\nREVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${schema} FROM PUBLIC;\nREVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ${schema} FROM PUBLIC;\nALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA ${schema} REVOKE ALL ON TABLES FROM PUBLIC;\nALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA ${schema} REVOKE ALL ON SEQUENCES FROM PUBLIC;\n${statements.join("\n")}\nCOMMIT;`;
    await clients.execute(sql, admin);
  } catch (error) {
    // Transport/server diagnostics can contain credentials; expose only our
    // safe precondition messages, never caller-provided error payloads.
    if (
      error instanceof Error &&
      [
        "Runtime usernames must be distinct from the administrative and object-owner accounts.",
        "Configured username does not match its secret username.",
      ].includes(error.message)
    )
      throw error;
    throw new Error(
      "Database bootstrap failed; inspect access and migration prerequisites without logging credentials."
    );
  }
};

const cli = async () => {
  const { values } = parseArgs({
    options: Object.fromEntries(
      [
        "database",
        "schema",
        "owner",
        "host",
        "port",
        "admin-secret",
        "application-secret",
        "application-username",
        "read-only-secret",
        "read-only-username",
      ].map(name => [name, { type: "string" }])
    ),
  });
  const port = Number(values.port ?? "5432");
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(values.host ?? "") ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error(
      "Supply a valid writer host and TCP port; bootstrap cannot use an RDS Proxy endpoint."
    );
  }
  await bootstrapDatabaseUsers(
    {
      database: values.database,
      schema: values.schema,
      owner: values.owner,
      adminSecret: values["admin-secret"],
      applicationSecret: values["application-secret"],
      applicationUsername: values["application-username"],
      readOnlySecret: values["read-only-secret"],
      readOnlyUsername: values["read-only-username"],
    },
    {
      getSecret: async id => {
        const result = spawnSync(
          "aws",
          [
            "secretsmanager",
            "get-secret-value",
            "--secret-id",
            id,
            "--output",
            "json",
          ],
          { encoding: "utf8", timeout: 30_000, maxBuffer: 1024 * 1024 }
        );
        if (result.error || result.status !== 0)
          throw new Error("Secret resolution failed.");
        return JSON.parse(JSON.parse(result.stdout).SecretString);
      },
      execute: async (sql, admin) => {
        const environment = Object.fromEntries(
          Object.entries(process.env).filter(([key]) => !key.startsWith("PG"))
        );
        const result = spawnSync(
          "psql",
          [
            "-X",
            "--no-password",
            "--set",
            "ON_ERROR_STOP=1",
            "--host",
            values.host,
            "--port",
            String(port),
            "--dbname",
            values.database,
          ],
          {
            input: sql,
            encoding: "utf8",
            timeout: 60_000,
            maxBuffer: 1024 * 1024,
            env: {
              ...environment,
              PGUSER: admin.username,
              PGPASSWORD: admin.password,
              PGSSLMODE: "verify-full",
              ...(process.env.PGSSLROOTCERT
                ? { PGSSLROOTCERT: process.env.PGSSLROOTCERT }
                : {}),
            },
          }
        );
        if (result.error || result.status !== 0)
          throw new Error("PostgreSQL bootstrap failed.");
      },
    }
  );
  console.info("Database-user bootstrap completed.");
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  cli().catch(() => {
    console.error(
      "Database-user bootstrap failed. Check the migration runbook and credential access."
    );
    process.exitCode = 1;
  });
}
