#!/usr/bin/env bash
# AGM OpenClaw installer — curl-friendly entrypoint
#
# Usage:
#   AGM_SELF_ID=atlas \
#   AGM_SELF_REMOTE_REPO_URL=https://github.com/USER/atlas-mailbox.git \
#   AGM_SELF_LOCAL_REPO_PATH=$HOME/.agm/atlas \
#   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/T0UGH/agent-git-mail/main/scripts/install-openclaw.sh)"
#
# This script is intentionally non-interactive. All required inputs must be
# provided via environment variables.

set -euo pipefail

SCRIPT_URL="https://raw.githubusercontent.com/T0UGH/agent-git-mail/main/scripts/bootstrap.sh"
TMP_SCRIPT="$(mktemp -t agm-bootstrap.XXXXXX.sh)"
cleanup() {
  rm -f "$TMP_SCRIPT"
}
trap cleanup EXIT

require_env() {
  local name="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    echo "❌ Missing required environment variable: $name" >&2
    echo "" >&2
    echo "Expected usage:" >&2
    echo "AGM_SELF_ID=atlas AGM_SELF_REMOTE_REPO_URL=https://github.com/USER/atlas-mailbox.git AGM_SELF_LOCAL_REPO_PATH=\$HOME/.agm/atlas /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/T0UGH/agent-git-mail/main/scripts/install-openclaw.sh)\"" >&2
    exit 2
  fi
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "❌ Missing required command: $1" >&2
    exit 3
  fi
}

require_env "AGM_SELF_ID" "${AGM_SELF_ID:-}"
require_env "AGM_SELF_REMOTE_REPO_URL" "${AGM_SELF_REMOTE_REPO_URL:-}"
require_env "AGM_SELF_LOCAL_REPO_PATH" "${AGM_SELF_LOCAL_REPO_PATH:-}"

require_cmd curl
require_cmd bash

if command -v git >/dev/null 2>&1; then
  echo "✅ git: $(command -v git)"
fi
if command -v node >/dev/null 2>&1; then
  echo "✅ node: $(command -v node)"
fi
if command -v npm >/dev/null 2>&1; then
  echo "✅ npm: $(command -v npm)"
fi
if command -v openclaw >/dev/null 2>&1; then
  echo "✅ openclaw: $(command -v openclaw)"
fi

echo "=== Fetching AGM bootstrap script ==="
curl -fsSL "$SCRIPT_URL" -o "$TMP_SCRIPT"
chmod +x "$TMP_SCRIPT"

echo "=== Running AGM bootstrap ==="
exec bash "$TMP_SCRIPT"
