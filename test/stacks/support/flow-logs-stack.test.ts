/**
 * Tests for FlowLogsStack.
 *
 * @module test/stacks/support/flow-logs-stack.test
 */
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { FlowLogsStack } from "../../../lib/stacks/support/flow-logs-stack";

describe("FlowLogsStack", () => {
  const createTemplate = (): Template => {
    const app = new cdk.App();
    const stack = new FlowLogsStack(app, "TestStack", {
      sources: [
        { accountId: "111111111111", region: "us-east-1" },
        { accountId: "222222222222", region: "us-east-1" },
      ],
      env: { account: "999999999999", region: "us-east-1" },
    });
    return Template.fromStack(stack);
  };

  describe("Bucket", () => {
    it("should create an SSL-enforced, non-public bucket", () => {
      const template = createTemplate();

      template.hasResourceProperties("AWS::S3::Bucket", {
        PublicAccessBlockConfiguration: Match.objectLike({
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        }),
      });
    });
  });

  describe("Delivery Policy", () => {
    it("should grant log delivery write access per source account", () => {
      const template = createTemplate();

      template.hasResourceProperties("AWS::S3::BucketPolicy", {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Sid: "AWSLogDeliveryWrite111111111111",
              Principal: { Service: "delivery.logs.amazonaws.com" },
              Condition: Match.objectLike({
                StringEquals: Match.objectLike({
                  "aws:SourceAccount": "111111111111",
                }),
              }),
            }),
            Match.objectLike({
              Sid: "AWSLogDeliveryCheck111111111111",
            }),
            Match.objectLike({
              Sid: "AWSLogDeliveryWrite222222222222",
            }),
          ]),
        }),
      });
    });
  });

  describe("Outputs", () => {
    it("should export the bucket name", () => {
      const template = createTemplate();

      template.hasOutput("FlowLogsBucketName", {
        Export: { Name: "flow-logs-bucket-name" },
      });
    });
  });
});
