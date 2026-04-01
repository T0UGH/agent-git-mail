#!/usr/bin/env bash
# AGM Bootstrap — install AGM + OpenClaw plugin and initialize the agent
#
# Usage:
#   AGM_SELF_ID=atlas \
#   AGM_SELF_REMOTE_REPO_URL=https://github.com/USER/atlas-mailbox.git \
#   AGM_SELF_LOCAL_REPO_PATH=/path/to/atlas-mailbox \
#   ./scripts/bootstrap.sh
#
# Optional env vars:
#   AGM_CONFIG_PATH=/custom/path/config.yaml   Custom config path
#   AGM_SKIP_PLUGIN_INSTALL=1                  Skip plugin installation

set -euo pipefail

# --- Input ---
SELF_ID="${AGM_SELF_ID:-}"
SELF_REMOTE_REPO_URL="${AGM_SELF_REMOTE_REPO_URL:-}"
SELF_LOCAL_REPO_PATH="${AGM_SELF_LOCAL_REPO_PATH:-}"
AGM_CONFIG_PATH="${AGM_CONFIG_PATH:-}"
AGM_SKIP_PLUGIN_INSTALL="${AGM_SKIP_PLUGIN_INSTALL:-}"

# --- Validation ---
require_env() {
  local name="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    echo "❌ Missing required environment variable: $name" >&2
    exit 2
  fi
}

require_env "AGM_SELF_ID" "$SELF_ID"
require_env "AGM_SELF_REMOTE_REPO_URL" "$SELF_REMOTE_REPO_URL"
require_env "AGM_SELF_LOCAL_REPO_PATH" "$SELF_LOCAL_REPO_PATH"

# --- Step 1: Check system dependencies ---
check_dep() {
  if ! command -v "$1" &>/dev/null; then
    echo "❌ Missing system dependency: $1" >&2
    exit 3
  fi
  echo "✅ $1: $(command -v "$1") ($(eval "$1 --version 2>/dev/null | head -1 || echo 'found')")"
}

echo "=== Checking system dependencies ==="
for dep in git node npm openclaw; do
  check_dep "$dep"
done

# --- Step 2: Install AGM CLI ---
echo ""
echo "=== Installing @t0u9h/agent-git-mail ==="
if npm install -g @t0u9h/agent-git-mail; then
  echo "✅ AGM CLI installed"
else
  echo "❌ AGM CLI installation failed" >&2
  exit 5
fi

# --- Step 3: Run agm bootstrap ---
echo ""
echo "=== Running agm bootstrap ==="

echo "  Self ID: $SELF_ID"
echo "  Remote repo: $SELF_REMOTE_REPO_URL"
echo "  Local clone: $SELF_LOCAL_REPO_PATH"

BUILD_ARGS=(
  --self-id "$SELF_ID"
  --self-remote-repo-url "$SELF_REMOTE_REPO_URL"
  --self-local-repo-path "$SELF_LOCAL_REPO_PATH"
)

if [[ -n "$AGM_CONFIG_PATH" ]]; then
  BUILD_ARGS+=(--config-path "$AGM_CONFIG_PATH")
fi
if [[ "$AGM_SKIP_PLUGIN_INSTALL" == "1" ]]; then
  BUILD_ARGS+=(--skip-plugin-install)
fi

if ! agm bootstrap "${BUILD_ARGS[@]}"; then
  code=$?
  echo "❌ agm bootstrap failed (exit $code)" >&2
  exit "$code"
fi

echo ""
echo "=== Bootstrap complete ==="
echo ""
echo "Next steps:"
echo "  1. Add contacts to your AGM config: agm config show"
echo "  2. Restart your OpenClaw gateway to load the plugin"
echo "  3. Verify the config: agm config show"
echo "  4. Send a test mail from another agent and confirm the plugin wakes your main session"
