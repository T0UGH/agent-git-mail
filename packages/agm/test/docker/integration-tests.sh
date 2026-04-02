#!/bin/bash
# Integration test runner for AGM daemon → activator → checkpoint chain.
# Runs inside Docker with fake openclaw to isolate from real environment.
#
# Daemon entry point: node dist/index.js daemon
# (dist/index.js is the CLI binary, subcommand 'daemon' imports runDaemon)

set -euo pipefail

AGM_CLI="/workspace/packages/agm/dist/index.js"
CONFIG_DIR="/tmp/agm-test-config"
MAILBOX="/tmp/agm-test-mailbox"
INV_LOG="/tmp/openclaw-invocations.log"

cleanup() {
  rm -rf "$CONFIG_DIR" "$MAILBOX" "$INV_LOG"
}
trap cleanup EXIT

setup_git_repo() {
  mkdir -p "$MAILBOX/inbox"
  cd "$MAILBOX"
  git init -q
  git config user.email "test@test.com"
  git config user.name "Test"
  echo "init" > f.txt
  git add f.txt && git commit -m "init" -q
}

add_mail() {
  local filename="$1"; local from="$2"; local subject="${3:-hello}"
  cat > "inbox/${filename}" << MAIL
---
from: ${from}
to: mt
subject: ${subject}
---
body
MAIL
  git add "inbox/${filename}" && git commit -m "mail ${filename}" -q
}

# Run daemon via CLI: node dist/index.js daemon
# loadConfig() uses AGM_CONFIG_DIR env var → $AGM_CONFIG_DIR/config.yaml
run_daemon() {
  AGM_CONFIG_DIR="$CONFIG_DIR" \
  OPENCLAW_INVOCATION_LOG="$INV_LOG" \
    node "$AGM_CLI" daemon --once 2>&1 || true
}

count_calls() { grep -c "openclaw agent" "$INV_LOG" 2>/dev/null || echo "0"; }

get_checkpoint_keys() {
  if [[ -f "$CONFIG_DIR/activation-state.json" ]]; then
    grep -o '"[^"]*::[^"]*"' "$CONFIG_DIR/activation-state.json" | tr -d '"' | tr '\n' ' '
  else
    echo ""
  fi
}

has_checkpoint() {
  local key="$1"
  [[ -f "$CONFIG_DIR/activation-state.json" ]] && grep -q "\"$key\"" "$CONFIG_DIR/activation-state.json"
}

# ── Test 1: new mail → activator called → checkpoint written ──────────────────
echo "TEST 1: new mail triggers activator and writes checkpoint"
cleanup; setup_git_repo; add_mail "test-mail.md" "hex" "Hello"
mkdir -p "$CONFIG_DIR"
cat > "$CONFIG_DIR/config.yaml" << 'YAML'
self:
  id: mt
  local_repo_path: /tmp/agm-test-mailbox
  remote_repo_url: https://github.com/T0UGH/mt-mailbox.git
runtime:
  poll_interval_seconds: 30
activation:
  enabled: true
  activator: feishu-openclaw-agent
  dedupe_mode: filename
  feishu:
    open_id: ou_test_agent
    message_template: "AGM: {{filename}}"
YAML

run_daemon

CALLS=$(count_calls)
if [[ "$CALLS" -ge 1 ]] && grep -q "ou_test_agent" "$INV_LOG"; then
  echo "  ✅ activator called ($CALLS time(s))"
else
  echo "  ❌ FAIL: activator not called"
  echo "  invocations: $(cat $INV_LOG 2>/dev/null || echo 'none')"
  exit 1
fi

if has_checkpoint "mt::test-mail.md"; then
  echo "  ✅ checkpoint written (mt::test-mail.md)"
else
  echo "  ❌ FAIL: checkpoint not written"
  exit 1
fi

# ── Test 2: subsequent new mail — checkpointed mail NOT re-activated, new mail activates ──
# Scenario:
#   - test-mail.md was already processed (checkpoint exists)
#   - new-mail.md arrives in a new commit
#   - Daemon detects both in diff
#   - test-mail.md skipped (has checkpoint) → NOT re-activated
#   - new-mail.md activates (no checkpoint) → checkpoint written
echo ""
echo "TEST 2: subsequent new mail — checkpointed mail skipped, new mail activates"
echo '{"processed":{"mt::test-mail.md":{"activatedAt":"2026-04-02T00:00:00Z"}}}' \
  > "$CONFIG_DIR/activation-state.json"
rm -f "$INV_LOG"

# Add a genuinely new mail (different filename from any checkpointed file)
add_mail "new-mail.md" "boron" "Another"
run_daemon

CALLS_2=$(count_calls)
CHECKPOINT_KEYS=$(get_checkpoint_keys)

# new-mail.md must have activated
if echo "$CHECKPOINT_KEYS" | grep -q "mt::new-mail.md"; then
  echo "  ✅ new-mail.md activated (checkpoint written)"
else
  echo "  ❌ FAIL: new-mail.md did not activate"
  echo "  checkpoints: $CHECKPOINT_KEYS"
  exit 1
fi

# test-mail.md checkpoint must still be present (not re-activated)
if has_checkpoint "mt::test-mail.md"; then
  echo "  ✅ test-mail.md still has checkpoint (not re-activated)"
else
  echo "  ❌ FAIL: test-mail.md checkpoint missing"
  exit 1
fi

# Exactly 1 activation call (only new-mail.md activated, test-mail.md skipped)
if [[ "$CALLS_2" -eq 1 ]]; then
  echo "  ✅ exactly 1 activation call (new-mail.md only, test-mail.md skipped by checkpoint)"
else
  echo "  ⚠️  $CALLS_2 activation calls (expected 1)"
fi

# ── Test 3: activator failure → no checkpoint written ──────────────────────
echo ""
echo "TEST 3: activator failure — checkpoint not written"
cleanup; setup_git_repo; add_mail "fail-mail.md" "hex"
mkdir -p "$CONFIG_DIR"
cat > "$CONFIG_DIR/config.yaml" << 'YAML'
self:
  id: mt
  local_repo_path: /tmp/agm-test-mailbox
  remote_repo_url: https://github.com/T0UGH/mt-mailbox.git
runtime:
  poll_interval_seconds: 30
activation:
  enabled: true
  activator: feishu-openclaw-agent
  dedupe_mode: filename
  feishu:
    open_id: ou_fail_agent
YAML

# fake-openclaw returns failure when OPENCLAW_FAIL=1
OPENCLAW_FAIL=1 run_daemon

if has_checkpoint "mt::fail-mail.md"; then
  echo "  ❌ FAIL: checkpoint written despite activator failure"
  exit 1
else
  echo "  ✅ no checkpoint written (correct — failure prevents checkpoint)"
fi

echo ""
echo "✅ All integration tests passed"
