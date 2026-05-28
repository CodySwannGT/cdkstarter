/**
 * Tests for environment configuration validation.
 *
 * @module test/config/env.test
 */

describe("env module", () => {
  describe("default values", () => {
    it("should export env object", async () => {
      const { env } = await import("../../config/env");

      expect(env).toBeDefined();
    });

    it("should have default CDK_BOOTSTRAP_QUALIFIER", async () => {
      const { env } = await import("../../config/env");

      expect(env.CDK_BOOTSTRAP_QUALIFIER).toBe("hnb659fds");
    });

    it("should have default CDK_BOOTSTRAP_EXECUTION_POLICY_ARN", async () => {
      const { env } = await import("../../config/env");

      expect(env.CDK_BOOTSTRAP_EXECUTION_POLICY_ARN).toBe(
        "arn:aws:iam::aws:policy/AdministratorAccess"
      );
    });
  });

  describe("type exports", () => {
    it("should export Env type", async () => {
      const envModule = await import("../../config/env");

      // Type assertion to verify the type exists and is usable
      const typed: typeof envModule.env = envModule.env;
      expect(typed).toBeDefined();
    });
  });
});
