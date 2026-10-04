# GitHub deployment trust

The OIDC deploy role requires `ownerId` and an explicit `deployRepositories` list in `config/github.ts`. Every repository requires its numeric ID and at least one exact `refs` or `environments` entry. Obtain both IDs with `gh api repos/OWNER/REPO --jq '{ownerId: .owner.id, repoId: .id}'`. Replace the checked-in placeholders before enabling `githubOidcDeploy`. Missing IDs, empty allowlists and wildcard filters stop synthesis.

New trust uses `repo:OWNER@OWNER-ID/REPO@REPO-ID:ref:refs/heads/main`. Name-only subjects are denied by default. For an existing repository that still emits legacy subjects, explicitly enable `allowLegacyDeploySubjects` during migration. This permits only the same configured repository and exact filters. Disable it after GitHub's immutable-subject opt-in. The deprecated `deployRepoPattern` no longer grants access.

A workflow using a GitHub environment emits an environment subject instead of a ref subject. Configure that exact environment and its GitHub branch protection rules. Colons in environment names are encoded as `%3A`. An environment entry cannot independently constrain the branch within that subject.

Renames and transfers require reviewing names and immutable IDs in this allowlist. This source change performs no GitHub settings or live AWS mutation. Verify the actual repository subject format before deploying the trust update.

The construct is pinned to aws-cdk-github-oidc 5.2.0 and uses its compatible CDK/constructs peer families. Version 5 replaces the Lambda-backed provider with native `AWS::IAM::OIDCProvider`, removing its custom-resource Lambda and IAM role. Existing accounts already containing the issuer must migrate/import the provider under infrastructure-administrator control before deployment because IAM permits only one provider per issuer. The provider physical issuer URL and deploy-role construct IDs, physical deploy role name, session duration and export name remain unchanged. Intentional differences are the exact immutable trust subjects and explicit optional legacy subjects.

Sources: [GitHub OIDC immutable subjects](https://docs.github.com/en/actions/reference/security/oidc#immutable-subject-claims), [aws-cdk-github-oidc](https://github.com/aripalo/aws-cdk-github-oidc).
