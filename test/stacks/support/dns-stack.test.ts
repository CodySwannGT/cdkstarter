/**
 * Tests for DnsStack.
 *
 * @module test/stacks/support/dns-stack.test
 */
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import type { DomainConfig } from "../../../lib/types";
import { DnsStack } from "../../../lib/stacks/support/dns-stack";

describe("DnsStack", () => {
  const singleDomainConfig: DomainConfig = {
    domains: [
      {
        name: "example.com",
        isPrimary: true,
        environments: {
          dev: { subdomain: "dev" },
          staging: { subdomain: "staging" },
          production: { useApex: true },
        },
      },
    ],
  };

  const multipleDomainConfig: DomainConfig = {
    domains: [
      {
        name: "example.com",
        isPrimary: true,
        environments: {
          dev: { subdomain: "dev" },
          production: { useApex: true },
        },
      },
      {
        name: "example.io",
        isPrimary: false,
        environments: {
          dev: { subdomain: "dev" },
          production: { useApex: true },
        },
      },
    ],
  };

  const defaultProps = {
    domainConfig: singleDomainConfig,
    env: { account: "123456789012", region: "us-east-1" },
  };

  const createStack = (props: Partial<typeof defaultProps> = {}): Template => {
    const app = new cdk.App();
    const stack = new DnsStack(app, "TestStack", {
      ...defaultProps,
      ...props,
    });
    return Template.fromStack(stack);
  };

  describe("Hosted Zones", () => {
    it("should create hosted zone for each domain", () => {
      const template = createStack();

      template.resourceCountIs("AWS::Route53::HostedZone", 1);
      template.hasResourceProperties("AWS::Route53::HostedZone", {
        Name: "example.com.",
      });
    });

    it("should create hosted zones for multiple domains", () => {
      const template = createStack({ domainConfig: multipleDomainConfig });

      template.resourceCountIs("AWS::Route53::HostedZone", 2);
      template.hasResourceProperties("AWS::Route53::HostedZone", {
        Name: "example.com.",
      });
      template.hasResourceProperties("AWS::Route53::HostedZone", {
        Name: "example.io.",
      });
    });

    it("should mark primary domain in zone comment", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::Route53::HostedZone", {
        Name: "example.com.",
        HostedZoneConfig: {
          Comment: "Hosted zone for example.com (primary)",
        },
      });
    });

    it("should not mark non-primary domain as primary", () => {
      const template = createStack({ domainConfig: multipleDomainConfig });

      template.hasResourceProperties("AWS::Route53::HostedZone", {
        Name: "example.io.",
        HostedZoneConfig: {
          Comment: "Hosted zone for example.io",
        },
      });
    });
  });

  describe("ACM Certificates", () => {
    it("should create ACM certificate for each domain", () => {
      const template = createStack();

      template.resourceCountIs("AWS::CertificateManager::Certificate", 1);
    });

    it("should create certificates for multiple domains", () => {
      const template = createStack({ domainConfig: multipleDomainConfig });

      template.resourceCountIs("AWS::CertificateManager::Certificate", 2);
    });

    it("should include wildcard in certificate subject alternative names", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CertificateManager::Certificate", {
        DomainName: "example.com",
        SubjectAlternativeNames: ["*.example.com"],
      });
    });

    it("should use DNS validation", () => {
      const template = createStack();

      template.hasResourceProperties("AWS::CertificateManager::Certificate", {
        ValidationMethod: "DNS",
      });
    });
  });

  describe("Outputs", () => {
    it("should export zone ID for each domain", () => {
      const template = createStack();

      template.hasOutput("examplecomzoneid", {
        Export: {
          Name: "example-com-zone-id",
        },
      });
    });

    it("should export certificate ARN for each domain", () => {
      const template = createStack();

      template.hasOutput("examplecomcertificatearn", {
        Export: {
          Name: "example-com-certificate-arn",
        },
      });
    });

    it("should export outputs for multiple domains", () => {
      const template = createStack({ domainConfig: multipleDomainConfig });

      template.hasOutput("examplecomzoneid", {
        Export: {
          Name: "example-com-zone-id",
        },
      });
      template.hasOutput("exampleiozoneid", {
        Export: {
          Name: "example-io-zone-id",
        },
      });
      template.hasOutput("examplecomcertificatearn", {
        Export: {
          Name: "example-com-certificate-arn",
        },
      });
      template.hasOutput("exampleiocertificatearn", {
        Export: {
          Name: "example-io-certificate-arn",
        },
      });
    });
  });

  describe("Public Properties", () => {
    it("should expose zone map by domain name", () => {
      const app = new cdk.App();
      const stack = new DnsStack(app, "TestStack", defaultProps);

      expect(stack.zones.get("example.com")).toBeDefined();
    });

    it("should expose certificate map by domain name", () => {
      const app = new cdk.App();
      const stack = new DnsStack(app, "TestStack", defaultProps);

      expect(stack.certificates.get("example.com")).toBeDefined();
    });
  });
});
