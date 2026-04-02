#!/usr/bin/env bash
# AGM Bootstrap — install AGM and initialize the agent
#
# Usage:
#   AGM_SELF_ID=atlas \
#   AGM_SELF_REMOTE_REPO_URL=https://github.com/USER/atlas-mailbox.git \
#   AGM_SELF_LOCAL_REPO_PATH=/path/to/atlas-mailbox \
#   AGM_ACTIVATION_OPEN_ID=ou_xxx \
#   ./scripts/bootstrap.sh
#
# Optional env vars:
#   AGM_CONFIG_PATH=/custom/path/config.yaml        Custom config path

set -euo pipefail

# --- Input ---
SELF_ID="${AGM_SELF_ID:-}"
SELF_REMOTE_REPO_URL="${AGM_SELF_REMOTE_REPO_URL:-}"
SELF_LOCAL_REPO_PATH="${AGM_SELF_LOCAL_REPO_PATH:-}"
AGM_CONFIG_PATH="${AGM_CONFIG_PATH:-}"
AGM_ACTIVATION_OPEN_ID="${AGM_ACTIVATION_OPEN_ID:-}"
OPENCLAW_SKILLS_DIR="${OPENCLAW_SKILLS_DIR:-$HOME/.openclaw/workspace/skills}"

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

install_agm_skill() {
  local repo_root
  repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  local source_dir="$repo_root/skills/agm-mail"
  local skill_dir="$OPENCLAW_SKILLS_DIR/agm-mail"

  if [[ ! -f "$source_dir/SKILL.md" ]]; then
    echo "❌ AGM skill source missing: $source_dir/SKILL.md" >&2
    exit 6
  fi

  mkdir -p "$OPENCLAW_SKILLS_DIR"
  rm -rf "$skill_dir"
  cp -R "$source_dir" "$skill_dir"

  echo "✅ AGM skill installed: $skill_dir"
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
if [[ -n "$AGM_ACTIVATION_OPEN_ID" ]]; then
  BUILD_ARGS+=(--activation-open-id "$AGM_ACTIVATION_OPEN_ID")
fi

if ! agm bootstrap "${BUILD_ARGS[@]}"; then
  code=$?
  echo "❌ agm bootstrap failed (exit $code)" >&2
  exit "$code"
fi

# --- Step 4: Install AGM skill ---
echo ""
echo "=== Installing AGM skill ==="
install_agm_skill

echo ""
echo "=== Bootstrap complete ==="
echo ""
echo "Next steps:"
echo "  1. Add contacts to your AGM config: agm config show"
if [[ -n "$AGM_ACTIVATION_OPEN_ID" ]]; then
  echo "  2. Start the daemon: agm daemon"
  echo "     The daemon will wake your agent via Feishu when new mail arrives."
else
  echo "  2. Add 'activation' section to your config to enable Feishu wake-up"
  echo "     Then start the daemon: agm daemon"
fi
echo "  3. Verify the config: agm config show"
echo "  4. Send a test mail from another agent and confirm the agent receives a Feishu message"
