# Task: Create IAM Stack

**Type:** Task
**Parent:** None

## Description

Create the IamStack that provisions SOC2-compliant IAM roles for Lambda functions. These roles follow least-privilege principles and provide access only to required resources.

## Acceptance Criteria

- [ ] `lib/stacks/auth/iam-stack.ts` creates IamStack class
- [ ] Lambda execution role with basic execution policy
- [ ] Policy for Aurora RDS access via IAM auth
- [ ] Policy for Valkey access (network, no IAM for ElastiCache)
- [ ] Policy for Cognito operations (admin actions for triggers)
- [ ] Policy for CloudWatch Logs
- [ ] Policy for X-Ray tracing
- [ ] All policies use resource ARNs from cross-stack references (not wildcards)
- [ ] Stack outputs: Lambda execution role ARN
- [ ] Unit tests verify IAM policies
- [ ] File passes TypeScript compilation and linting

## Relevant Research

From `research.md`:
- **Stage Orchestration** (`lib/app-stage.ts:1-264`): Imports values from network stage via Fn.importValue for IAM policies
- **Aurora with IAM Auth** (lines 165-173): IAM auth for RDS Proxy access

From `brief.md`:
- Required AWS Resources (line 29): IAM Roles (SOC2 compliant statements)
- SOC2 compliance requires least-privilege policies

## Applicable Skills

Invoke these skills before writing implementation code:

- `/coding-philosophy` - Always required for all code
- `/jsdoc-best-practices` - For documenting IAM policies and SOC2 rationale

## Implementation Details

**File to create:** `lib/stacks/auth/iam-stack.ts`

**Props interface:**
```typescript
interface IamStackProps extends cdk.StackProps {
  readonly stageName: string;
  readonly auroraClusterArn: string;
  readonly auroraSecretArn: string;
  readonly cognitoUserPoolArn: string;
}
```

**Implementation:**
```typescript
const lambdaExecutionRole = new iam.Role(this, "LambdaExecutionRole", {
  roleName: `${props.stageName}-lambda-execution-role`,
  assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
  description: "SOC2-compliant Lambda execution role with least-privilege access",
});

// Basic Lambda execution (CloudWatch Logs)
lambdaExecutionRole.addManagedPolicy(
  iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")
);

// VPC access for Lambda
lambdaExecutionRole.addManagedPolicy(
  iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaVPCAccessExecutionRole")
);

// Aurora IAM auth (connect via RDS Proxy)
lambdaExecutionRole.addToPolicy(new iam.PolicyStatement({
  actions: ["rds-db:connect"],
  resources: [`${props.auroraClusterArn}/*`],
  effect: iam.Effect.ALLOW,
}));

// Secrets Manager read (for any non-IAM scenarios)
lambdaExecutionRole.addToPolicy(new iam.PolicyStatement({
  actions: ["secretsmanager:GetSecretValue"],
  resources: [props.auroraSecretArn],
  effect: iam.Effect.ALLOW,
}));

// Cognito admin actions (for trigger Lambdas)
lambdaExecutionRole.addToPolicy(new iam.PolicyStatement({
  actions: [
    "cognito-idp:AdminGetUser",
    "cognito-idp:AdminUpdateUserAttributes",
    "cognito-idp:AdminCreateUser",
  ],
  resources: [props.cognitoUserPoolArn],
  effect: iam.Effect.ALLOW,
}));

// X-Ray tracing
lambdaExecutionRole.addToPolicy(new iam.PolicyStatement({
  actions: [
    "xray:PutTraceSegments",
    "xray:PutTelemetryRecords",
  ],
  resources: ["*"], // X-Ray requires * for these actions
  effect: iam.Effect.ALLOW,
}));
```

**Outputs to export:**
- `{stageName}-lambda-execution-role-arn`
- `{stageName}-lambda-execution-role-name`

**SOC2 compliance notes (for JSDoc):**
- Least-privilege: Only required actions, specific resources where possible
- Auditability: Named resources, descriptive role names
- No wildcards except where AWS requires (X-Ray)

## Testing Requirements

### Unit Tests
- [ ] `describe('IamStack')/it('should create Lambda execution role')`: Verify role exists
- [ ] `describe('IamStack')/it('should have basic execution policy')`: Verify managed policy
- [ ] `describe('IamStack')/it('should allow RDS IAM auth')`: Verify rds-db:connect
- [ ] `describe('IamStack')/it('should allow Cognito admin actions')`: Verify cognito-idp actions
- [ ] `describe('IamStack')/it('should allow X-Ray tracing')`: Verify xray actions
- [ ] `describe('IamStack')/it('should use specific resource ARNs')`: Verify no unnecessary wildcards

### Integration Tests
N/A - stack creation tested via unit tests with CDK assertions

### E2E Tests
N/A - infrastructure stack, no user-facing changes

## Documentation Requirements

### Code Documentation (JSDoc)
- [ ] File preamble - explain SOC2 compliance approach
- [ ] `IamStackProps` - document each prop and why it's needed
- [ ] `IamStack` - explain least-privilege design
- [ ] Each policy statement - explain why the action/resource is needed

### Database Comments
N/A - no database changes

### GraphQL Descriptions
N/A - no GraphQL changes

## Verification

### Type
`test-coverage`

### Proof Command
```bash
npm run build && npm run test -- --testPathPattern="iam-stack" --coverage --collectCoverageFrom='lib/stacks/auth/iam-stack.ts'
```

### Expected Output
All tests pass. IAM role created with least-privilege policies.

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

1. Create `test/stacks/auth/iam-stack.test.ts`
2. Write tests using CDK assertions library
3. Run tests to confirm they fail (stack doesn't exist yet)

Mark "Write failing tests" as completed.

### Step 3: Write Implementation
Mark "Write implementation" as in_progress.

Create `lib/stacks/auth/iam-stack.ts` until tests pass.

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
