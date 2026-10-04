# Application and read-only database users

Aurora keeps its existing `clusteradmin` secret and resource identities for
administrative operations. Configure `aurora.applicationUsername` (default
`application`) and optionally `aurora.readOnlyUsername` in an environment. Each
runtime user gets a separate Secrets Manager record. The Lambda role can read
only the application record and connect only as that user through the actual
proxy resource-ID ARN. Enabling a read-only user creates no observer IAM role.

The proxy and cluster use end-to-end IAM authentication. Runtime users receive
`rds_iam` membership and authenticate with IAM tokens, never the master password.
Bootstrap sets their PostgreSQL passwords to NULL. Generated passwords in their
separate secret records are not a password-authentication fallback. The proxy
omits explicit `Auth` entries: registering these records would select `SECRETS`
for proxy-to-database authentication and conflict with IAM-only users. This
evidence-backed choice replaces the original issue’s password-backed secret
registration wording while retaining isolated user records and grants. Combining
`rds_iam` with password-backed proxy authentication is unsupported here, because
AWS warns that this combination causes connection instability.

After a separately authorized deployment or migration, an operator with access
to the writer endpoint, administrative secret and PostgreSQL object-owner role
runs the explicit bootstrap. CDK never executes it as a custom resource:

```sh
PGSSLROOTCERT=/path/to/rds-ca-bundle.pem node scripts/bootstrap-database-users.mjs \
  --host WRITER_ENDPOINT --database application_db --schema application_schema \
  --owner clusteradmin --admin-secret ADMIN_SECRET_ARN \
  --application-username application --application-secret APPLICATION_SECRET_ARN
```

Supply both `--read-only-username` and `--read-only-secret` to add the optional
read-only user. Database, schema, owner and usernames must be lowercase SQL
identifiers. Use the writer endpoint, not the proxy. AWS CLI and `psql` must be
installed. TLS verifies the endpoint certificate. Secret responses stay in
memory, administrative credentials enter only the narrow `psql` subprocess,
and no credentials are placed in SQL, files, stdout or diagnostic logs.

Application privileges are database CONNECT, schema USAGE, table
SELECT/INSERT/UPDATE/DELETE and sequence USAGE/SELECT. Read-only privileges are
CONNECT/USAGE/SELECT without sequence or write grants. Matching default privileges
apply to future objects created by the supplied owner. Bootstrap removes other
role memberships, elevated role attributes and existing grants in this database
and schema before applying the intended grants. Repeating it converges to the
same privileges. Roles that already own objects fail until ownership is migrated.

Review the migration before running on an existing database: bootstrap also
removes PUBLIC CREATE on the selected database/schema and PUBLIC table/sequence
privileges, including that owner's defaults. Audit existing ownership, grants,
PUBLIC access and other object owners. Repeat the setup for each future object
owner as needed. This can affect other consumers of that schema. Bootstrap
creates neither the database nor schema, grants no DDL/administrative fallback,
and does not revoke privileges in other databases or schemas. Test migration in
a non-production copy, move application consumers to IAM tokens and the proxy,
and verify their privileges before removing existing administrative access.

Offline tests inject mocked Secrets Manager/PostgreSQL clients and inspect actual
CDK templates. They establish source behavior, not live migration or deployed
AWS connectivity.

Sources: [proxy AuthFormat](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-rds-dbproxy-authformat.html),
[proxy default authentication](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-rds-dbproxy.html),
[RDS Proxy authentication](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy-connecting.html),
[database-user IAM ARNs](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.IAMPolicy.html),
[PostgreSQL default privileges](https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html).
