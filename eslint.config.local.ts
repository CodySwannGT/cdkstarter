/**
 * ESLint 9 Flat Config - Project-Local Customizations
 *
 * Add project-specific ESLint rules here. This file is create-only,
 * meaning Lisa will create it but never overwrite your customizations.
 *
 * Example:
 * ```ts
 * export default [
 *   {
 *     files: ["src/legacy/**"],
 *     rules: {
 *       "@typescript-eslint/no-explicit-any": "off",
 *     },
 *   },
 * ];
 * ```
 * @see https://eslint.org/docs/latest/use/configure/configuration-files-new
 * @module eslint.config.local
 */
export default [
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "jsdoc/require-jsdoc": "off",
      "max-lines-per-function": "off",
      "no-restricted-syntax": "off",
      "sonarjs/constructor-for-side-effects": "off",
      "sonarjs/no-duplicate-string": "off",
      "sonarjs/aws-s3-bucket-insecure-http": "off",
      "sonarjs/aws-s3-bucket-versioning": "off",
      "sonarjs/aws-s3-bucket-public-access": "off",
      "sonarjs/aws-sns-unencrypted-topics": "off",
    },
  },
];
