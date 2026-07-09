#!/usr/bin/env bash
#
# psql-secret.sh — open a `psql` shell against the Aurora cluster endpoint
# using the master password from Secrets Manager. The RDS Proxy is configured
# with IAM auth, so password auth must bypass the proxy and hit the cluster
# directly.
#
# Starts an SSM tunnel to the cluster writer endpoint via the relay, fetches
# the master credentials from Secrets Manager, and drops you into psql. The
# tunnel is torn down automatically on exit.
#
# Usage:
#   scripts/psql-secret.sh <dev|staging|production> [local-port] [-- psql-args...]
#
# Examples:
#   scripts/psql-secret.sh dev
#   scripts/psql-secret.sh dev 15432
#   scripts/psql-secret.sh dev -c "SELECT version();"
#
# AWS profile resolution: $AWS_PROFILE if set, else "$AWS_PROFILE_PREFIX-<env>"
# (AWS_PROFILE_PREFIX defaults to "your-project").
#
# Prefer psql-iam.sh for routine work — tokens beat cleartext passwords.

set -euo pipefail

ENV_ARG="${1:-}"
case "$ENV_ARG" in
  dev|staging|production) ;;
  *)
    echo "Usage: $0 <dev|staging|production> [local-port] [psql-args...]" >&2
    exit 1
    ;;
esac
shift

LOCAL_PORT=15432
if [[ "${1:-}" =~ ^[0-9]+$ ]]; then
  LOCAL_PORT="$1"
  shift
fi
[ "${1:-}" = "--" ] && shift

PROFILE_PREFIX="${AWS_PROFILE_PREFIX:-your-project}"
PROFILE="${AWS_PROFILE:-${PROFILE_PREFIX}-${ENV_ARG}}"
REGION="${AWS_REGION:-us-east-1}"

for cmd in aws session-manager-plugin lsof jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: required command '$cmd' not installed." >&2
    echo "  macOS: brew install awscli libpq jq && brew install --cask session-manager-plugin" >&2
    exit 1
  fi
done

PSQL_BIN="$(command -v psql || true)"
if [ -z "$PSQL_BIN" ] && command -v brew >/dev/null 2>&1; then
  PFX="$(brew --prefix libpq 2>/dev/null || true)"
  [ -n "$PFX" ] && [ -x "$PFX/bin/psql" ] && PSQL_BIN="$PFX/bin/psql"
fi
if [ -z "$PSQL_BIN" ]; then
  echo "Error: psql not found. Install via: brew install libpq" >&2
  exit 1
fi

if ! aws sts get-caller-identity --profile "$PROFILE" >/dev/null 2>&1; then
  echo "Signing in to AWS SSO profile '$PROFILE'..." >&2
  aws sso login --profile "$PROFILE"
fi

export_val() {
  aws cloudformation list-exports --profile "$PROFILE" --region "$REGION" \
    --query "Exports[?Name=='$1'].Value | [0]" --output text 2>/dev/null \
    | grep -v '^None$' | head -n1
}

CLUSTER_HOST="$(export_val "${ENV_ARG}-aurora-cluster-endpoint")"
SECRET_ARN="$(export_val "${ENV_ARG}-aurora-secret-arn")"
REMOTE_PORT="$(export_val "${ENV_ARG}-aurora-cluster-port")"
if [ -z "$REMOTE_PORT" ] || [ "$REMOTE_PORT" = "None" ]; then REMOTE_PORT=5432; fi

if [ -z "$CLUSTER_HOST" ] || [ "$CLUSTER_HOST" = "None" ]; then
  echo "Error: ${ENV_ARG}-aurora-cluster-endpoint export not found in $ENV_ARG." >&2
  exit 1
fi
if [ -z "$SECRET_ARN" ] || [ "$SECRET_ARN" = "None" ]; then
  echo "Error: ${ENV_ARG}-aurora-secret-arn export not found in $ENV_ARG." >&2
  exit 1
fi

SECRET_JSON="$(aws secretsmanager get-secret-value \
  --secret-id "$SECRET_ARN" --profile "$PROFILE" --region "$REGION" \
  --query SecretString --output text)"
DB_USER="$(printf '%s' "$SECRET_JSON" | jq -r '.username')"
DB_PASS="$(printf '%s' "$SECRET_JSON" | jq -r '.password')"
DB_NAME="$(printf '%s' "$SECRET_JSON" | jq -r '.dbname // empty')"

ASG_NAME="$(aws ssm get-parameter --profile "$PROFILE" --region "$REGION" \
  --name "/platform/ssm-relay/${ENV_ARG}/asg-name" \
  --query "Parameter.Value" --output text)"
INSTANCE_ID="$(aws autoscaling describe-auto-scaling-groups \
  --profile "$PROFILE" --region "$REGION" \
  --auto-scaling-group-names "$ASG_NAME" \
  --query "AutoScalingGroups[0].Instances[?LifecycleState=='InService'].InstanceId | [0]" \
  --output text)"
if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
  echo "Error: no InService instance in relay ASG $ASG_NAME." >&2
  exit 1
fi

if lsof -nP -iTCP:"$LOCAL_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Error: local port $LOCAL_PORT already in use." >&2
  exit 1
fi

TUNNEL_LOG="$(mktemp -t psql-secret-tunnel.XXXXXX)"
aws ssm start-session \
  --profile "$PROFILE" --region "$REGION" \
  --target "$INSTANCE_ID" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "host=$CLUSTER_HOST,portNumber=$REMOTE_PORT,localPortNumber=$LOCAL_PORT" \
  > "$TUNNEL_LOG" 2>&1 &
TUN_PID=$!

cleanup() {
  kill "$TUN_PID" 2>/dev/null || true
  pkill -P "$TUN_PID" 2>/dev/null || true
  # session-manager-plugin reparents to init when its aws parent exits, so
  # PID-tree kill won't catch it. Kill whatever still holds the local port.
  local lsof_pid
  lsof_pid="$(lsof -t -iTCP:"$LOCAL_PORT" -sTCP:LISTEN 2>/dev/null || true)"
  [ -n "$lsof_pid" ] && kill $lsof_pid 2>/dev/null || true
  wait "$TUN_PID" 2>/dev/null || true
  rm -f "$TUNNEL_LOG"
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 30); do
  lsof -nP -iTCP:"$LOCAL_PORT" -sTCP:LISTEN >/dev/null 2>&1 && break
  sleep 1
done
if ! lsof -nP -iTCP:"$LOCAL_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Error: SSM tunnel to $CLUSTER_HOST did not come up on 127.0.0.1:$LOCAL_PORT." >&2
  cat "$TUNNEL_LOG" >&2
  exit 1
fi

# Cache the RDS global CA bundle once for sslmode=verify-ca (the cluster cert
# is signed by Amazon RDS's private CA, not in the system trust store).
RDS_CA_BUNDLE="${HOME}/.aws/rds-global-bundle.pem"
if [ ! -s "$RDS_CA_BUNDLE" ]; then
  mkdir -p "$(dirname "$RDS_CA_BUNDLE")"
  echo "Downloading Amazon RDS CA bundle to $RDS_CA_BUNDLE..." >&2
  curl -sSfL \
    "https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem" \
    -o "$RDS_CA_BUNDLE"
fi

echo "Connecting to ${DB_NAME:-<default>} on $CLUSTER_HOST as $DB_USER (Secrets Manager password, cluster direct)." >&2

# sslmode=verify-ca because we have the CA bundle; skip hostname check since
# we're connecting to 127.0.0.1 but the cert is for the cluster hostname.
PGPASSWORD="$DB_PASS" "$PSQL_BIN" \
  "host=127.0.0.1 port=$LOCAL_PORT user=$DB_USER ${DB_NAME:+dbname=$DB_NAME} sslmode=verify-ca sslrootcert=$RDS_CA_BUNDLE" \
  "$@"
