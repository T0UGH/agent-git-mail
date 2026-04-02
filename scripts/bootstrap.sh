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
#   AGM_ACTIVATION_POLL_INTERVAL=5                  Activation poll interval (seconds)

set -euo pipefail

# --- Input ---
SELF_ID="${AGM_SELF_ID:-}"
SELF_REMOTE_REPO_URL="${AGM_SELF_REMOTE_REPO_URL:-}"
SELF_LOCAL_REPO_PATH="${AGM_SELF_LOCAL_REPO_PATH:-}"
AGM_CONFIG_PATH="${AGM_CONFIG_PATH:-}"
AGM_ACTIVATION_OPEN_ID="${AGM_ACTIVATION_OPEN_ID:-}"
AGM_ACTIVATION_POLL_INTERVAL="${AGM_ACTIVATION_POLL_INTERVAL:-}"
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
  local skill_dir="$OPENCLAW_SKILLS_DIR/agm-mail"
  mkdir -p "$skill_dir"
  cat > "$skill_dir/SKILL.md" <<'EOF'
---
name: agm-mail
description: Handle Agent Git Mail notifications by following the mailbox workflow: read first, then reply or archive. Trigger when an AGM system message announces a newly delivered mail file.
---

# AGM Mail

When you receive an AGM notification, treat it as mailbox work — **not** as a normal chat message.

## Required flow

1. **Read the mail first**

```bash
agm read <filename>
```

Do not reply in chat before reading the mail.

2. **Decide what to do next**

- If a reply is needed, use AGM reply:

```bash
agm reply <filename> --from <self_id> --body-file <path>
```

- If the mail is handled and no reply is needed, archive it:

```bash
agm archive <filename> --agent <self_id>
```

## Default discipline

- AGM notification → `agm read` first
- Use AGM commands for mailbox actions
- Do not replace the mail workflow with a generic chat reply

## Example

```bash
agm read 2026-04-02T01-57-23Z-mt-to-leo-ff97.md
agm reply 2026-04-02T01-57-23Z-mt-to-leo-ff97.md --from leo --body-file ./reply.md
agm archive 2026-04-02T01-57-23Z-mt-to-leo-ff97.md --agent leo
```
EOF
  echo "✅ AGM skill installed: $skill_dir/SKILL.md"
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
if [[ -n "$AGM_ACTIVATION_POLL_INTERVAL" ]]; then
  BUILD_ARGS+=(--activation-poll-interval-seconds "$AGM_ACTIVATION_POLL_INTERVAL")
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
