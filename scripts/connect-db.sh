#!/usr/bin/env bash
#
# connect-db.sh — SSM Session Manager port-forwarding tunnel to Aurora or
# Valkey via the per-environment relay EC2 instance (no VPN required).
#
# Usage:
#   scripts/connect-db.sh <env> [aurora|valkey] [local-port]
#
#   env:        dev | staging | production
#   target:     aurora (default) | valkey
#   local-port: optional override (defaults to remote port — 5432 / 6379)
#
# AWS profile resolution: $AWS_PROFILE if set, else "$AWS_PROFILE_PREFIX-<env>"
# (AWS_PROFILE_PREFIX defaults to "your-project").
#
# After the tunnel is up, point your client (psql / DBeaver / redis-cli) at
# 127.0.0.1:<local-port>. Ctrl-C closes the tunnel.
#
# Higher-level wrappers: psql-iam.sh (IAM auth via RDS Proxy) and
# psql-secret.sh (master password, cluster direct).

set -euo pipefail

ENV_ARG="${1:-}"
TARGET="${2:-aurora}"
LOCAL_PORT_ARG="${3:-}"
REGION="${AWS_REGION:-us-east-1}"
PROFILE_PREFIX="${AWS_PROFILE_PREFIX:-your-project}"

case "$ENV_ARG" in
  dev|staging|production) PROFILE="${PROFILE_PREFIX}-${ENV_ARG}" ;;
  *)
    echo "Usage: $0 <dev|staging|production> [aurora|valkey] [local-port]" >&2
    exit 1
    ;;
esac
PROFILE="${AWS_PROFILE:-$PROFILE}"

case "$TARGET" in
  aurora)
    EXPORT_NAME="${ENV_ARG}-aurora-cluster-endpoint"
    PORT_EXPORT_NAME="${ENV_ARG}-aurora-cluster-port"
    DEFAULT_REMOTE_PORT=5432
    ;;
  valkey)
    EXPORT_NAME="${ENV_ARG}-valkey-endpoint"
    PORT_EXPORT_NAME="${ENV_ARG}-valkey-port"
    DEFAULT_REMOTE_PORT=6379
    ;;
  *)
    echo "Unknown target: $TARGET (expected aurora|valkey)" >&2
    exit 1
    ;;
esac

for cmd in aws session-manager-plugin lsof; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: required command '$cmd' is not installed." >&2
    echo "  macOS: brew install awscli && brew install --cask session-manager-plugin" >&2
    exit 1
  fi
done

if ! aws sts get-caller-identity --profile "$PROFILE" >/dev/null 2>&1; then
  echo "Signing in to AWS SSO profile '$PROFILE'..." >&2
  aws sso login --profile "$PROFILE"
fi

# `list-exports` paginates, and `--query ... | [0]` is evaluated per page,
# so `--output text` yields `None\n<match>\nNone\n...` when the export
# isn't on the first page. Strip the `None` sentinels before taking the
# first line.
export_val() {
  aws cloudformation list-exports \
    --profile "$PROFILE" --region "$REGION" \
    --query "Exports[?Name=='$1'].Value | [0]" \
    --output text 2>/dev/null | grep -v '^None$' | head -n1
}

# Prefer the SSM Parameter published by SsmRelayStack; fall back to an
# EC2 tag lookup for environments that predate the parameter.
ASG_PARAM="/platform/ssm-relay/${ENV_ARG}/asg-name"
ASG_NAME=$(aws ssm get-parameter \
  --profile "$PROFILE" --region "$REGION" \
  --name "$ASG_PARAM" \
  --query "Parameter.Value" --output text 2>/dev/null || echo "")

if [ -n "$ASG_NAME" ] && [ "$ASG_NAME" != "None" ]; then
  INSTANCE_ID=$(aws autoscaling describe-auto-scaling-groups \
    --profile "$PROFILE" --region "$REGION" \
    --auto-scaling-group-names "$ASG_NAME" \
    --query "AutoScalingGroups[0].Instances[?LifecycleState=='InService'].InstanceId | [0]" \
    --output text)
else
  echo "SSM parameter $ASG_PARAM not found; falling back to EC2 tag lookup." >&2
  INSTANCE_ID=$(aws ec2 describe-instances \
    --profile "$PROFILE" --region "$REGION" \
    --filters \
      "Name=tag:Role,Values=ssm-relay" \
      "Name=tag:Environment,Values=$ENV_ARG" \
      "Name=instance-state-name,Values=running" \
    --query "Reservations[0].Instances[0].InstanceId" \
    --output text)
fi

if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
  echo "Error: no InService SSM relay instance found for env=$ENV_ARG." >&2
  echo "Is features.ssmRelay enabled for this environment?" >&2
  exit 1
fi

REMOTE_HOST=$(export_val "$EXPORT_NAME")
if [ -z "$REMOTE_HOST" ] || [ "$REMOTE_HOST" = "None" ]; then
  echo "Error: CloudFormation export '$EXPORT_NAME' not found in $ENV_ARG." >&2
  exit 1
fi

REMOTE_PORT=$(export_val "$PORT_EXPORT_NAME")
if [ -z "$REMOTE_PORT" ] || [ "$REMOTE_PORT" = "None" ]; then
  REMOTE_PORT="$DEFAULT_REMOTE_PORT"
fi

LOCAL_PORT="${LOCAL_PORT_ARG:-$REMOTE_PORT}"

if lsof -nP -iTCP:"$LOCAL_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Error: local port $LOCAL_PORT is already in use." >&2
  echo "Pass a different port: $0 $ENV_ARG $TARGET <local-port>" >&2
  exit 1
fi

echo "Relay instance: $INSTANCE_ID"
echo "$TARGET target: $REMOTE_HOST:$REMOTE_PORT"
echo "Forwarding to:  127.0.0.1:$LOCAL_PORT"
echo "Press Ctrl-C to close the tunnel."

exec aws ssm start-session \
  --profile "$PROFILE" --region "$REGION" \
  --target "$INSTANCE_ID" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "host=$REMOTE_HOST,portNumber=$REMOTE_PORT,localPortNumber=$LOCAL_PORT"
