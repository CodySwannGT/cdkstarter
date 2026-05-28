/**
 * Cognito Stack - User Pool for Authentication
 *
 * This stack creates a Cognito User Pool for user authentication. The user
 * pool is configured with email sign-in, optional MFA, and standard security
 * policies.
 *
 * ## IMPORTANT: Lambda Triggers Not Configured Here
 *
 * Lambda triggers (pre-signup, post-confirmation, custom auth, etc.) are
 * NOT configured in this stack. This is an intentional design decision:
 *
 * - **Separation of concerns**: Triggers contain application logic
 * - **Backend ownership**: The backend repo owns and deploys triggers
 * - **Deployment flexibility**: Triggers can be updated independently
 * - **Testing**: Backend can test triggers without infrastructure changes
 *
 * The backend repo attaches triggers to this user pool after deployment
 * using the exported user pool ID.
 *
 * ## Cross-Stack References
 *
 * This stack exports values for application stacks:
 * - `{stageName}-cognito-user-pool-id`: User pool identifier
 * - `{stageName}-cognito-user-pool-arn`: User pool ARN for IAM policies
 * - `{stageName}-cognito-app-client-id`: App client for API authentication
 * @see https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools.html
 * @module lib/stacks/auth/cognito-stack
 */
import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import type { Construct } from "constructs";

/**
 * Configuration properties for CognitoStack.
 */
export interface CognitoStackProps extends cdk.StackProps {
  /**
   * Stage name for CloudFormation output prefixes.
   * Examples: "dev", "staging", "production"
   */
  readonly stageName: string;
}

/**
 * Cognito Stack creating user pool for authentication.
 *
 * Creates a user pool with email sign-in, optional MFA, and standard
 * password policy. Self-sign-up is disabled - administrators create users.
 *
 * Lambda triggers are NOT configured here - they are owned and deployed
 * by the backend repository.
 */
export class CognitoStack extends cdk.Stack {
  /**
   * The Cognito user pool.
   */
  public readonly userPool: cognito.UserPool;

  /**
   * The app client for API authentication.
   */
  public readonly appClient: cognito.UserPoolClient;

  /**
   * Creates a new CognitoStack.
   * @param scope - Parent construct
   * @param id - Stack identifier
   * @param props - Stack configuration
   */
  constructor(scope: Construct, id: string, props: CognitoStackProps) {
    super(scope, id, props);

    const { stageName } = props;

    this.userPool = this.createUserPool(stageName);
    this.appClient = this.createAppClient(stageName);
    this.createOutputs(stageName);
  }

  /**
   * Creates the Cognito user pool.
   * @param stageName - Stage name for resource naming
   * @returns The created user pool
   */
  private createUserPool(stageName: string): cognito.UserPool {
    return new cognito.UserPool(this, "UserPool", {
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
      removalPolicy:
        stageName === "production"
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      // NOTE: Lambda triggers are NOT configured here.
      // Triggers are deployed and managed by the backend repository.
      // See file preamble for rationale.
    });
  }

  /**
   * Creates the app client for API authentication.
   *
   * Token validity:
   * - Access token: 1 hour (short-lived for security)
   * - ID token: 1 hour (matches access token)
   * - Refresh token: 30 days (allows long sessions without re-auth)
   * @param _stageName - Stage name (unused, kept for interface consistency)
   * @returns The created app client
   */
  private createAppClient(_stageName: string): cognito.UserPoolClient {
    return this.userPool.addClient("AppClient", {
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false,
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });
  }

  /**
   * Creates CloudFormation outputs for cross-stack references.
   * @param stageName - Stage name for export name prefixes
   */
  private createOutputs(stageName: string): void {
    new cdk.CfnOutput(this, "UserPoolId", {
      value: this.userPool.userPoolId,
      description: `Cognito user pool ID for ${stageName}`,
      exportName: `${stageName}-cognito-user-pool-id`,
    });

    new cdk.CfnOutput(this, "UserPoolArn", {
      value: this.userPool.userPoolArn,
      description: `Cognito user pool ARN for ${stageName}`,
      exportName: `${stageName}-cognito-user-pool-arn`,
    });

    new cdk.CfnOutput(this, "AppClientId", {
      value: this.appClient.userPoolClientId,
      description: `Cognito app client ID for ${stageName}`,
      exportName: `${stageName}-cognito-app-client-id`,
    });
  }
}
