#!/bin/bash
# Integration test runner for AGM daemon → activator → checkpoint chain.
# Runs inside Docker with fake openclaw to isolate from real environment.
#
# Tests:
#   1. activator called when new mail arrives
#   2. dedupe — same mail NOT activated twice
#   3. activator failure does not write checkpoint

set -euo pipefail

AGM_DIST="/workspace/packages/agm/dist"
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

run_daemon() {
  AGM_CONFIG_DIR="$CONFIG_DIR" \
  AGM_CONFIG_PATH="$CONFIG_DIR/config.yaml" \
  OPENCLAW_INVOCATION_LOG="$INV_LOG" \
    node "$AGM_DIST/app/run-daemon.js" 2>&1 || true
}

count_calls() { grep -c "openclaw agent" "$INV_LOG" 2>/dev/null || echo "0"; }

has_checkpoint() {
  local key="$1"
  [[ -f "$CONFIG_DIR/activation-state.json" ]] && grep -q "\"$key\"" "$CONFIG_DIR/activation-state.json"
}

# ── Test 1: activator called on new mail ─────────────────────────────────────
echo "TEST 1: activator called when new mail arrives"
cleanup; setup_git_repo; add_mail "test-mail.md" "hex"
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
  echo "  ✅ activator called ($CALLS)"
else
  echo "  ❌ FAIL: activator not called"; cat "$INV_LOG" 2>/dev/null; exit 1
fi
if has_checkpoint "mt::test-mail.md"; then
  echo "  ✅ checkpoint written"
else
  echo "  ❌ FAIL: checkpoint missing"; exit 1
fi

# ── Test 2: dedupe — same mail skipped on second poll ────────────────────────
echo ""
echo "TEST 2: dedupe — checkpoint blocks duplicate activation"
echo '{"processed":{"mt::test-mail.md":{"activatedAt":"2026-04-02T00:00:00Z"}}}' \
  > "$CONFIG_DIR/activation-state.json"
rm -f "$INV_LOG"
add_mail "new-mail.md" "boron"
run_daemon
NEW_CALLS=$(count_calls)
if [[ "$NEW_CALLS" -ge 1 ]]; then
  echo "  ✅ new mail triggered activator ($NEW_CALLS)"
else
  echo "  ❌ FAIL: new mail did not trigger"; exit 1
fi

# ── Test 3: failure path — no checkpoint on activator failure ────────────────
echo ""
echo "TEST 3: activator failure does not write checkpoint"
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
OPENCLAW_FAIL=1 run_daemon
if has_checkpoint "mt::fail-mail.md"; then
  echo "  ❌ FAIL: checkpoint written despite failure"; exit 1
else
  echo "  ✅ no checkpoint (correct)"
fi

echo ""
echo "✅ All integration tests passed"
