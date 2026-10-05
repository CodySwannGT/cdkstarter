/** Metadata-only, opt-in same-account SSM to Secrets Manager delivery. */
import { join } from "node:path";
import * as cdk from "aws-cdk-lib";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { RegionInfo } from "aws-cdk-lib/region-info";
import * as cr from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import { validateSecretCopyConfig } from "../../util/secret-copy-config";
import type { SecretCopyConfig, SecretCopyMapping } from "../types";

/** Dedicated scoped copier configuration. */
export type SecretCopierProps = SecretCopyConfig;

/** Copies values at runtime; CloudFormation sees identifiers only. */
export class SecretCopier extends Construct {
  /** Dedicated runtime used by its provider and optional change rule. */
  public readonly function: lambda.Function;

  /**
   * Creates the provider, exact grants and optional event subscription.
   * @param scope - Caller-owned scope, retained for stable identities
   * @param id - Caller-owned construct identifier
   * @param props - Explicit mappings and opt-in synchronization
   */
  constructor(scope: Construct, id: string, props: SecretCopierProps) {
    super(scope, id);
    validateSecretCopyConfig(props);
    const stack = cdk.Stack.of(this);
    this.validateLocation(stack, props.mappings);
    const physicalId = `secret-copy-${this.node.addr}`;
    this.function = new lambda.Function(this, "Handler", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(
        join(__dirname, "../../resources/secret-copier")
      ),
      timeout: cdk.Duration.minutes(2),
      logGroup: new logs.LogGroup(this, "RuntimeLogs", {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      environment: {
        MAPPINGS: JSON.stringify(props.mappings),
        PHYSICAL_ID: physicalId,
      },
    });
    for (const mapping of props.mappings)
      this.addMappingPermissions(stack, mapping);
    const provider = new cr.Provider(this, "Provider", {
      onEventHandler: this.function,
      logGroup: new logs.LogGroup(this, "ProviderLogs", {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });
    new cdk.CustomResource(this, "Copy", {
      resourceType: "Custom::SecretCopier",
      serviceToken: provider.serviceToken,
      properties: { Mappings: props.mappings, PhysicalId: physicalId },
    });
    if (props.synchronizeChanges === true) {
      new events.Rule(this, "ParameterChanges", {
        eventPattern: {
          source: ["aws.ssm"],
          detailType: ["Parameter Store Change"],
          detail: {
            name: [
              ...new Set(props.mappings.map(mapping => mapping.parameterName)),
            ],
            operation: ["Create", "Update"],
          },
        },
        targets: [new targets.LambdaFunction(this.function)],
      });
    }
  }

  /**
   * Avoid transporting secrets across regions, accounts or partitions.
   * @param stack - Owning stack
   * @param mappings - Validated mappings
   */
  private validateLocation(
    stack: cdk.Stack,
    mappings: readonly SecretCopyMapping[]
  ): void {
    if (
      cdk.Token.isUnresolved(stack.account) ||
      cdk.Token.isUnresolved(stack.region)
    ) {
      throw new Error(
        "Secret copy requires an explicit owning account and region."
      );
    }
    const partition = RegionInfo.get(stack.region).partition;
    for (const mapping of mappings) {
      const destination = cdk.Arn.split(
        mapping.secretArn,
        cdk.ArnFormat.COLON_RESOURCE_NAME
      );
      for (const arn of [
        mapping.secretArn,
        mapping.sourceKeyArn,
        mapping.targetKeyArn,
      ].filter((value): value is string => value !== undefined)) {
        const reference = cdk.Arn.split(arn, cdk.ArnFormat.SLASH_RESOURCE_NAME);
        if (
          reference.account !== destination.account ||
          reference.region !== destination.region ||
          reference.partition !== destination.partition ||
          (!cdk.Token.isUnresolved(stack.account) &&
            reference.account !== stack.account) ||
          (!cdk.Token.isUnresolved(stack.region) &&
            reference.region !== stack.region) ||
          reference.partition !== partition
        )
          throw new Error(
            "Secret copy requires same-account, same-region, same-partition references."
          );
      }
    }
  }

  /**
   * Scope each data/key permission to one exact mapping and encryption context.
   * @param stack - Owning stack
   * @param mapping - One validated reference mapping
   */
  private addMappingPermissions(
    stack: cdk.Stack,
    mapping: SecretCopyMapping
  ): void {
    const parameterArn = stack.formatArn({
      service: "ssm",
      resource: "parameter",
      resourceName: mapping.parameterName.slice(1),
      arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
    });
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter"],
        resources: [parameterArn],
      })
    );
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "secretsmanager:GetSecretValue",
          "secretsmanager:PutSecretValue",
        ],
        resources: [mapping.secretArn],
      })
    );
    // KMS ViaService uses .amazonaws.com in every partition (including China).
    // https://docs.aws.amazon.com/kms/latest/developerguide/conditions-kms.html#conditions-kms-via-service
    if (mapping.sourceKeyArn)
      this.function.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["kms:Decrypt"],
          resources: [mapping.sourceKeyArn],
          conditions: {
            StringEquals: {
              "kms:ViaService": `ssm.${stack.region}.amazonaws.com`,
              "kms:EncryptionContext:PARAMETER_ARN": parameterArn,
            },
          },
        })
      );
    if (mapping.targetKeyArn)
      this.function.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["kms:Decrypt", "kms:GenerateDataKey"],
          resources: [mapping.targetKeyArn],
          conditions: {
            StringEquals: {
              "kms:ViaService": `secretsmanager.${stack.region}.amazonaws.com`,
              "kms:EncryptionContext:SecretARN": mapping.secretArn,
            },
          },
        })
      );
  }
}
