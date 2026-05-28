# Code Review for branch `feature/bootstrap-cdk-infrastructure`

Reviewed 11 commits with changes to 58 files.

Found 5 issues:

## 1. Unsafe type assertion for Aurora secret (Score: 85)

The type assertion `as rds.DatabaseSecret` bypasses TypeScript's null safety. The `cluster.secret` property has type `ISecret | undefined` in AWS CDK, but the code asserts it's always defined.

- File: `lib/stacks/database/aurora-stack.ts:105`
- Code: `this.secret = this.cluster.secret as rds.DatabaseSecret;`
- Risk: Runtime error if secret is undefined

**Recommended fix:**
```typescript
if (!this.cluster.secret) {
  throw new Error("Aurora cluster secret was not created");
}
this.secret = this.cluster.secret;
```

## 2. IamStack only created when BOTH Aurora AND Cognito enabled (Score: 95)

The IamStack is conditionally created only when both Aurora and Cognito are enabled, but feature flags allow independent enabling. If Aurora is enabled without Cognito (or vice versa), no IAM roles are created.

- File: `lib/stages/app-stage.ts:130`
- Code: `if (this.auroraStack && this.cognitoStack) { this.iamStack = new IamStack(...) }`
- Documentation at line 17 states "IamStack (always)" which contradicts the implementation
- Risk: Lambda functions cannot access Aurora when Cognito is disabled

**Recommended fix:** Create IamStack when either service is enabled, and conditionally add policies based on what's available.

## 3. validateConfiguration() never called at CDK app startup (Score: 82)

The JSDoc in `util/config-loader.ts:144` explicitly states "Call this function at CDK app startup to fail fast on configuration errors" but the function is never called in `bin/infrastructure.ts`.

- File: `bin/infrastructure.ts` (missing call)
- Related: `util/config-loader.ts:144-150`
- Risk: Configuration errors (duplicate CIDRs, multiple primary domains) only discovered at deploy time

**Recommended fix:** Add at the start of `bin/infrastructure.ts`:
```typescript
import { validateConfiguration } from "../util/config-loader";
validateConfiguration();
```

## 4. Unused stage variables (Score: 90)

The `appStage` and `observabilityStage` variables are assigned but never used. ESLint will flag this with `@typescript-eslint/no-unused-vars` and `sonarjs/no-dead-store`.

- File: `bin/infrastructure.ts:65`
- File: `bin/infrastructure.ts:91`
- Risk: Will fail lint checks

**Recommended fix:** Remove the variable declarations since CDK Stages register themselves automatically:
```typescript
new AppStage(app, `${stageName}-app`, { ... });
new ObservabilityStage(app, `${stageName}-observability`, { ... });
```

## 5. Missing language specifiers on fenced code blocks (Score: 85)

CLAUDE.md line 13 requires "Always add language specifiers to fenced code blocks in Markdown." Two code blocks in brief.md lack language specifiers.

- File: `projects/2026-01-19-bootstrap-cdk/brief.md:301-348`
- File: `projects/2026-01-19-bootstrap-cdk/brief.md:390-427`
- CLAUDE.md says: "Always add language specifiers to fenced code blocks in Markdown"

**Recommended fix:** Add `text` or appropriate language specifier to ASCII diagram blocks.
