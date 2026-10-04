/** Offline network endpoint contracts through the real environment composition. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { alarmThresholds } from "../../config/observability";
import { stageEnvironments } from "../../config/environments";
import { EnvironmentStage } from "../../lib/stages/environment-stage";
import type { VpcEndpointType } from "../../lib/types";

const outputs: string[] = [];
afterEach(() =>
  outputs
    .splice(0)
    .forEach(output => rmSync(output, { recursive: true, force: true }))
);
const synth = (services?: readonly string[], name = "dev") => {
  const outdir = mkdtempSync(join(tmpdir(), "starter-endpoint-"));
  outputs.push(outdir);
  const app = new cdk.App({ outdir });
  const configured = stageEnvironments.find(
    environment => environment.name === name
  );
  if (!configured) throw new Error("Missing stage fixture");
  const stage = new EnvironmentStage(app, "Env-test", {
    environment: {
      ...configured,
      accountId: "123456789012",
      network: {
        ...configured.network,
        ...(services === undefined
          ? {}
          : { vpcEndpoints: services as readonly VpcEndpointType[] }),
      },
    },
    alarmThresholds,
    env: { account: "123456789012", region: "us-east-1" },
  });
  if (!stage.vpcStack) throw new Error("Missing VPC");
  return {
    stack: stage.vpcStack,
    template: Template.fromStack(stage.vpcStack),
  };
};

describe("starter private endpoint contract", () => {
  it.each(["dev", "staging", "production"])(
    "%s creates configured gateways on all private routes and no paid interfaces",
    name => {
      const { stack, template } = synth(undefined, name);
      const endpoints = Object.values(
        template.findResources("AWS::EC2::VPCEndpoint")
      );
      expect(endpoints).toHaveLength(2);
      const privateRoutes = [
        ...stack.vpc.privateSubnets,
        ...stack.vpc.isolatedSubnets,
      ].map(subnet => stack.resolve(subnet.routeTable.routeTableId));
      endpoints.forEach(endpoint => {
        expect(endpoint.Properties.VpcEndpointType).toBe("Gateway");
        expect(endpoint.Properties.RouteTableIds).toEqual(privateRoutes);
      });
      expect(JSON.stringify(endpoints)).toContain("s3");
      expect(JSON.stringify(endpoints)).toContain("dynamodb");
    }
  );
  it("creates each opted-in interface with private DNS and TCP443 limited to private subnet CIDRs", () => {
    const { stack, template } = synth([
      "secretsmanager",
      "ssm",
      "ssmmessages",
      "logs",
    ]);
    const endpoints = Object.values(
      template.findResources("AWS::EC2::VPCEndpoint")
    );
    expect(endpoints).toHaveLength(4);
    endpoints.forEach(endpoint => {
      expect(endpoint.Properties.VpcEndpointType).toBe("Interface");
      expect(endpoint.Properties.PrivateDnsEnabled).toBe(true);
      expect(endpoint.Properties.SubnetIds).toEqual(
        stack.vpc.privateSubnets.map(subnet => stack.resolve(subnet.subnetId))
      );
      expect(endpoint.Properties.SecurityGroupIds).toHaveLength(1);
    });
    const groups = Object.values(
      template.findResources("AWS::EC2::SecurityGroup")
    );
    expect(groups).toHaveLength(1);
    const ingress = groups[0].Properties.SecurityGroupIngress;
    const privateCidrs = [
      ...stack.vpc.privateSubnets,
      ...stack.vpc.isolatedSubnets,
    ]
      .map(subnet => subnet.ipv4CidrBlock)
      .sort();
    expect(
      ingress.map((rule: { CidrIp: string }) => rule.CidrIp).sort()
    ).toEqual(privateCidrs);
    ingress.forEach(
      (rule: { IpProtocol: string; FromPort: number; ToPort: number }) => {
        expect(rule.IpProtocol).toBe("tcp");
        expect(rule.FromPort).toBe(443);
        expect(rule.ToPort).toBe(443);
      }
    );
  });
  it("deduplicates services and keeps an explicit empty configuration empty", () => {
    expect(
      Object.keys(
        synth(["s3", "s3", "ssm", "ssm"]).template.findResources(
          "AWS::EC2::VPCEndpoint"
        )
      )
    ).toHaveLength(2);
    synth([]).template.resourceCountIs("AWS::EC2::VPCEndpoint", 0);
  });
  it.each(["unknown", "kms", "__proto__"])(
    "rejects unsupported endpoint service %s",
    service => {
      expect(() => synth([service])).toThrow(/Unsupported VPC endpoint/);
    }
  );
});
