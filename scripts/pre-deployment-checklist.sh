#!/usr/bin/env bash
#
# pre-deployment-checklist.sh — preflight checks before deploying
# infrastructure changes.
#
# Usage:
#   scripts/pre-deployment-checklist.sh
#
# Configuration (env vars):
#   AWS_PROFILE_PREFIX  profile name prefix (default: "your-project");
#                       profiles checked: <prefix>-shared, <prefix>-dev,
#                       <prefix>-staging, <prefix>-production
#   DEPLOY_BRANCH       branch deploys are expected from (default: "main")
#   SKIP_PROFILE_CHECKS set to 1 to skip AWS profile authentication checks
#                       (useful before profiles are configured)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PROFILE_PREFIX="${AWS_PROFILE_PREFIX:-your-project}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"

echo -e "${BLUE}=== Pre-Deployment Checklist ===${NC}\n"

# Function to check a condition
check() {
  local description="$1"
  local command="$2"

  echo -n "Checking: $description... "

  if eval "$command" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
    return 0
  else
    echo -e "${RED}✗${NC}"
    return 1
  fi
}

# Track failures
failures=0

# 1. Check AWS CLI installation
if ! check "AWS CLI installed" "command -v aws"; then
  ((failures++))
fi

# 2. Check AWS profiles
if [ "${SKIP_PROFILE_CHECKS:-0}" != "1" ]; then
  echo -e "\n${YELLOW}AWS Profile Configuration:${NC}"
  for env in shared dev staging production; do
    if ! check "Profile ${PROFILE_PREFIX}-${env} authenticates" "aws sts get-caller-identity --profile ${PROFILE_PREFIX}-${env}"; then
      ((failures++))
    fi
  done
else
  echo -e "\n${YELLOW}Skipping AWS profile checks (SKIP_PROFILE_CHECKS=1)${NC}"
fi

# 3. Check CDK installation
echo -e "\n${YELLOW}CDK Configuration:${NC}"
if ! check "CDK available" "npx cdk --version"; then
  ((failures++))
fi

# 4. Check Node.js version
if ! check "Node.js >= 22" "node -v | grep -E 'v(2[2-9]|[3-9][0-9])\..*'"; then
  ((failures++))
fi

# 5. Check current branch
echo -e "\n${YELLOW}Git Status:${NC}"
current_branch=$(git branch --show-current)
echo "Current branch: $current_branch"

if [[ "$current_branch" != "$DEPLOY_BRANCH" ]]; then
  echo -e "${YELLOW}Warning: Not on ${DEPLOY_BRANCH} branch${NC}"
fi

# Check for uncommitted changes
if ! check "No uncommitted changes" "git diff-index --quiet HEAD --"; then
  echo -e "${YELLOW}Warning: You have uncommitted changes${NC}"
fi

# 6. Check CDK synthesis
echo -e "\n${YELLOW}CDK Synthesis:${NC}"
if check "CDK synthesis successful" "npx cdk synth"; then
  echo -e "${GREEN}CloudFormation templates generated successfully${NC}"
else
  ((failures++))
fi

# 7. Check test status
echo -e "\n${YELLOW}Test Status:${NC}"
if check "All tests passing" "npm test"; then
  echo -e "${GREEN}All tests passed${NC}"
else
  ((failures++))
fi

# 8. Final summary
echo -e "\n${BLUE}=== Summary ===${NC}"
if [ $failures -eq 0 ]; then
  echo -e "${GREEN}✓ All checks passed! Ready for deployment.${NC}"
  echo -e "\n${YELLOW}Next steps:${NC}"
  echo "1. Notify team of deployment window"
  echo "2. Open monitoring dashboards"
  echo "3. Deploy (direct: npx cdk deploy --all --profile ${PROFILE_PREFIX}-shared;"
  echo "   pipeline mode: push to ${DEPLOY_BRANCH} and monitor the pipeline)"
  echo "4. Verify stack outputs and application health after deployment"
  exit 0
else
  echo -e "${RED}✗ Found $failures issues that need to be resolved.${NC}"
  echo -e "\n${YELLOW}Please fix the issues above before proceeding with deployment.${NC}"
  exit 1
fi
