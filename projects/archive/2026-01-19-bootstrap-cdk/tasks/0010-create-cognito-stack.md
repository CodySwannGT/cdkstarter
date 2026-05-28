# Task: Create Cognito Stack

**Type:** Task
**Parent:** None

## Description

Create the CognitoStack that provisions a Cognito User Pool for authentication. Note: Cognito triggers are NOT configured here - they are handled by the backend repo.

## Acceptance Criteria

- [ ] `lib/stacks/auth/cognito-stack.ts` creates CognitoStack class
- [ ] User pool with email sign-in enabled
- [ ] MFA optional (TOTP when enabled)
- [ ] Standard password policy (8+ chars, mixed case, numbers, symbols)
- [ ] Self-sign-up disabled (admin creates users)
- [ ] Email verification enabled
- [ ] App client for backend API access
- [ ] NO Lambda triggers configured (backend handles these)
- [ ] Stack outputs: user pool ID, user pool ARN, app client ID
- [ ] Unit tests verify Cognito resource creation
- [ ] File passes TypeScript compilation and linting

## Relevant Research

From `research.md`:
- **Cognito Stack** (`lib/cognito-stack.ts:1-159`): Creates user pool with MFA, email/phone sign-in, custom attributes, token validity
- **Triggers NOT configured** (line 98): Matches requirement that backend owns triggers

From `brief.md`:
- Required AWS Resources (line 27): Cognito User Pool (client ID, triggers)
- Key Design Decision #6: Backend Owns Cognito Triggers (lines 533-534)

## Applicable Skills

Invoke these skills before writing implementation code:

- `/coding-philosophy` - Always required for all code
- `/jsdoc-best-practices` - For documenting user pool configuration

## Implementation Details

**File to create:** `lib/stacks/auth/cognito-stack.ts`

**Props interface:**
```typescript
interface CognitoStackProps extends cdk.StackProps {
  readonly stageName: string;
}
```

**Implementation:**
```typescript
const userPool = new cognito.UserPool(this, "UserPool", {
  userPoolName: `${props.stageName}-user-pool`,
  selfSignUpEnabled: false,
  signInAliases: {
    email: true,
    username: false,
  },
  autoVerify: {
    email: true,
  },
  passwordPolicy: {
    minLength: 8,
    requireLowercase: true,
    requireUppercase: true,
    requireDigits: true,
    requireSymbols: true,
  },
  mfa: cognito.Mfa.OPTIONAL,
  mfaSecondFactor: {
    sms: false,
    otp: true,
  },
  accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
  removalPolicy: props.stageName === "production"
    ? cdk.RemovalPolicy.RETAIN
    : cdk.RemovalPolicy.DESTROY,
  // NOTE: Lambda triggers are NOT configured here.
  // Triggers are deployed and managed by the backend repository.
});

const appClient = userPool.addClient("AppClient", {
  userPoolClientName: `${props.stageName}-app-client`,
  authFlows: {
    userPassword: true,
    userSrp: true,
  },
  generateSecret: false,
  accessTokenValidity: cdk.Duration.hours(1),
  idTokenValidity: cdk.Duration.hours(1),
  refreshTokenValidity: cdk.Duration.days(30),
});
```

**Outputs to export:**
- `{stageName}-cognito-user-pool-id`
- `{stageName}-cognito-user-pool-arn`
- `{stageName}-cognito-app-client-id`

**Why no triggers (document in JSDoc):**
Lambda triggers are application logic (pre-signup validation, post-confirmation actions, custom auth flows). The backend repo owns this logic and attaches triggers after deployment.

## Testing Requirements

### Unit Tests
- [ ] `describe('CognitoStack')/it('should create user pool')`: Verify resource exists
- [ ] `describe('CognitoStack')/it('should enable email sign-in')`: Verify sign-in aliases
- [ ] `describe('CognitoStack')/it('should have correct password policy')`: Verify policy
- [ ] `describe('CognitoStack')/it('should disable self-sign-up')`: Verify setting
- [ ] `describe('CognitoStack')/it('should create app client')`: Verify client
- [ ] `describe('CognitoStack')/it('should not configure Lambda triggers')`: Verify no triggers

### Integration Tests
N/A - stack creation tested via unit tests with CDK assertions

### E2E Tests
N/A - infrastructure stack, no user-facing changes

## Documentation Requirements

### Code Documentation (JSDoc)
- [ ] File preamble - explain Cognito purpose and trigger separation
- [ ] `CognitoStackProps` - document props
- [ ] `CognitoStack` - explain NO triggers design decision prominently
- [ ] App client section - explain token validity choices

### Database Comments
N/A - no database changes

### GraphQL Descriptions
N/A - no GraphQL changes

## Verification

### Type
`test-coverage`

### Proof Command
```bash
npm run build && npm run test -- --testPathPattern="cognito-stack" --coverage --collectCoverageFrom='lib/stacks/auth/cognito-stack.ts'
```

### Expected Output
All tests pass. User pool created without Lambda triggers.

## Implementation Steps

### Step 0: Setup Tracking
Use TodoWrite to create task tracking todos:
- Invoke skills
- Write failing tests
- Write implementation
- Verify implementation
- Update documentation
- Commit changes

### Step 1: Invoke Skills
Mark "Invoke skills" as in_progress.

1. Mark this task as "in progress" in `progress.md`
2. Invoke each skill listed in "Applicable Skills" using the Skill tool

Mark "Invoke skills" as completed.

### Step 2: Write Failing Tests
Mark "Write failing tests" as in_progress.

1. Create `test/stacks/auth/cognito-stack.test.ts`
2. Write tests using CDK assertions library
3. Run tests to confirm they fail (stack doesn't exist yet)

Mark "Write failing tests" as completed.

### Step 3: Write Implementation
Mark "Write implementation" as in_progress.

Create `lib/stacks/auth/cognito-stack.ts` until tests pass.

Mark "Write implementation" as completed.

### Step 4: Verify Implementation
Mark "Verify implementation" as in_progress.

1. Run the Proof Command from Verification section
2. Confirm output matches Expected Output
3. If verification fails, fix and re-verify

Mark "Verify implementation" as completed.

### Step 5: Update Documentation
Mark "Update documentation" as in_progress.

Complete all items in Documentation Requirements section.

Mark "Update documentation" as completed.

### Step 6: Commit Changes
Mark "Commit changes" as in_progress.

1. Run `/git:commit`
2. Mark this task as "completed" in `progress.md`
3. Record any learnings in `findings.md`

Mark "Commit changes" as completed.
