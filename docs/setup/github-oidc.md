# GitHub deployment trust

The OIDC deploy role requires `ownerId` and an explicit `deployRepositories` list in `config/github.ts`. Every repository requires its numeric ID and at least one exact `refs` or `environments` entry. Obtain both IDs with `gh api repos/OWNER/REPO --jq '{ownerId: .owner.id, repoId: .id}'`. Replace the checked-in placeholders before enabling `githubOidcDeploy`. Missing IDs, empty allowlists and wildcard filters stop synthesis.

New trust uses `repo:OWNER@OWNER-ID/REPO@REPO-ID:ref:refs/heads/main`. Name-only subjects are denied by default. For an existing repository that still emits legacy subjects, explicitly enable `allowLegacyDeploySubjects` during migration. This permits only the same configured repository and exact filters. Disable it after GitHub's immutable-subject opt-in. The deprecated `deployRepoPattern` no longer grants access.

A workflow using a GitHub environment emits an environment subject instead of a ref subject. Configure that exact environment and its GitHub branch protection rules. Colons in environment names are encoded as `%3A`. An environment entry cannot independently constrain the branch within that subject.

Renames and transfers require reviewing names and immutable IDs in this allowlist. This source change performs no GitHub settings or live AWS mutation. Verify the actual repository subject format before deploying the trust update.

The construct is pinned to aws-cdk-github-oidc 5.2.0 and uses its compatible CDK/constructs peer families. Version 5 replaces the Lambda-backed provider with native `AWS::IAM::OIDCProvider`, removing its custom-resource Lambda and IAM role. Existing accounts already containing the issuer must complete the staged migration below under infrastructure-administrator control because IAM permits only one provider per issuer. The provider physical issuer URL and deploy-role construct IDs, physical deploy role name, session duration and export name remain unchanged. Intentional differences are the exact immutable trust subjects and explicit optional legacy subjects.

## Existing provider migration

The old custom resource's Delete handler deletes the IAM provider. Referencing
its ARN does not prevent that deletion. Complete each deployment before moving
to the next step, preserving the issuer, audience and deploy-role trust ARN.

1. While still using `aws-cdk-github-oidc` 2.4.1, retain the existing
   `Custom::AWSCDKOpenIdConnectProvider`. Its constructor has no removal-policy
   argument, so apply the policy to its custom-resource child:

   ```typescript
   const provider = new GithubActionsIdentityProvider(this, "GithubProvider");
   const legacyResource = provider.node.findChild("Resource") as cdk.CustomResource;
   legacyResource.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
   ```

   Review `cdk diff` for `DeletionPolicy: Retain` and `UpdateReplacePolicy:
   Retain`, then deploy this change. Verify both policies in the deployed
   template before removing the construct.

2. Still on 2.4.1, replace that initialization with
   `GithubActionsIdentityProvider.fromAccount(this, "GithubProviderReference")`.
   Use the different reference construct ID and leave role identities and
   provider ARN unchanged. Review the diff: the old custom resource must be
   orphaned/retained, while its unused handler Lambda and role may be removed.
   Deploy and confirm that the provider still exists and role trust references
   the same ARN.

3. Move to the native-provider v4 release (for example 4.2.5 with compatible CDK
   peers). Replace the reference with the original `GithubProvider` construct ID
   using `new GithubActionsIdentityProvider(this, "GithubProvider", {
   removalPolicy: cdk.RemovalPolicy.RETAIN })`. Review the diff for only the
   native `AWS::IAM::OIDCProvider` addition, with no unrelated updates. Run
   `cdk import <stack-selector>` and supply the retained provider's ARN when
   requested. Use the selector shown by `cdk list`. Do not use a normal deploy to
   create this already-existing issuer. Match the retained provider's properties
   and verify the completed import, unchanged ARN and drift before continuing.

4. After import, upgrade to the starter's pinned 5.2.0 and compatible peers.
   Review the native-provider diff and deploy the explicit subject configuration
   described above, after confirming GitHub's actual subject format. Keep the
   provider's ARN and deploy-role identities stable throughout.

These are operator migration instructions. This starter's offline validation
does not establish that an existing account has completed them.

Sources: [GitHub OIDC immutable subjects](https://docs.github.com/en/actions/reference/security/oidc#immutable-subject-claims),
[versioned upstream migration guide](https://github.com/aripalo/aws-cdk-github-oidc/blob/v5.2.0/README.md#migration-guide),
[old CDK Delete handler](https://github.com/aws/aws-cdk/blob/v2.180.0/packages/@aws-cdk/custom-resource-handlers/lib/aws-iam/oidc-handler/index.ts),
[CDK resource import](https://docs.aws.amazon.com/cdk/v2/guide/ref-cli-cmd-import.html).
