# Explicit Amplify executables

No executable is installed by this manifest by default. The empty `dependencies`
object is intentional. Amplify's ordinary default build uses `npm ci` and
`npm run build`, so the frontend repository needs its own npm lock and build
script. Existing `preBuildCommands` and `buildCommands` remain caller-owned.

## Migrating existing Bun builds

Previously, omitting these command arrays installed Bun globally, ran
`bun install --frozen-lockfile`, and built with `bun run export:web`. The new
defaults require an npm lockfile and a `build` script. For an existing Bun
frontend, set both command arrays explicitly before adopting this starter:

```ts
preBuildCommands: ["npm install -g bun", "bun install --frozen-lockfile"],
buildCommands: ["bun run export:web"],
```

This preserves the previous build behavior, including its unpinned Bun install.
For a reproducible build, select an exact Bun executable version through
`buildTools`, omit `npm install -g bun`, and set
`preBuildCommands: ["bun install --frozen-lockfile"]` and
`buildCommands: ["bun run export:web"]`. The starter preserves the caller's
command order.

To opt in, review the npm package and record its exact published semver version
in this directory's `package.json` `dependencies`. Select it on the hosting
configuration with `buildTools: [{ packageName: "your-cli", executable:
"your-cli" }]`. The adapter expects `your-cli --version` to return the exact
version, optionally prefixed with `v`, and succeed. Package/executable names and
semver pins are validated before synthesis. Tags, ranges, duplicate package or
executable bindings, a second `devDependencies` pin, and a `version` on the
adapter are rejected.

The renderer runs before caller pre-build commands. A matching installed binary
is reused. An absent or different binary installs the exact package into
`$PWD/.amplify-build-tools/<executable>`, prepends that directory's
`node_modules/.bin` to PATH, clears the shell command cache, and checks the
version again. A failed installation or an incorrect/failing executable fails
the build. The adapter invokes npm lifecycle scripts for explicitly selected
packages, so approve the package and its transitive install behavior before
selecting it. It neither selects Bun/Expo/Sentry nor downloads an unversioned
CLI automatically.

Update pins in a reviewed change, check primary registry metadata, and run
`npm run test -- test/integration/starter-optional-secret-tools.integration.test.ts`.
The offline suite tests actual shell checks with fake local executables and an
injected npm installer. It never downloads the example tool.
