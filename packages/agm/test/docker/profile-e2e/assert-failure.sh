#!/bin/bash
set -euo pipefail

AGM_CLI="/workspace/packages/agm/dist/index.js"
CONFIG_DIR="${AGM_CONFIG_DIR:-/workspace/testdata/.config/agm}"
AGM_BASE_DIR="${AGM_BASE_DIR:-/workspace/testdata/.agm}"
INGRESS_LOG="/tmp/fake-ingress/requests.jsonl"

echo "=== ASSERT: failure path ==="

# Clean ingress log
> "$INGRESS_LOG"

# Clean hex state
> "$CONFIG_DIR/state/hex/activation-state.json" 2>/dev/null || true
> "$CONFIG_DIR/state/hex/events.jsonl" 2>/dev/null || true

# Inject test mail
bash /workspace/fixtures/inject-mail.sh hex mt "Failure test"

# Run daemon (hex profile)
AGM_CONFIG_DIR="$CONFIG_DIR" AGM_BASE_DIR="$AGM_BASE_DIR" \
  node "$AGM_CLI" daemon --profile hex --once 2>&1 || true

# Condition-based wait: wait for fake-ingress to receive at least 1 request
WAIT_COUNT=0
MAX_WAIT=30
until [[ -s "$INGRESS_LOG" ]] && [[ $(wc -l < "$INGRESS_LOG" 2>/dev/null || echo 0) -ge 1 ]]; do
  sleep 1
  WAIT_COUNT=$((WAIT_COUNT + 1))
  if [[ $WAIT_COUNT -ge $MAX_WAIT ]]; then
    echo "  ❌ FAIL: timeout waiting for fake-ingress to receive request (${MAX_WAIT}s)" >&2
    exit 1
  fi
done
echo "  ✅ fake-ingress received request after ~${WAIT_COUNT}s"

# Assertion 1: fake-ingress received request
REQUEST_COUNT=$(wc -l < "$INGRESS_LOG" 2>/dev/null || echo "0")
if [[ "$REQUEST_COUNT" -ge 1 ]]; then
  echo "  ✅ 断言 1: fake-ingress 收到 $REQUEST_COUNT 次请求"
else
  echo "  ❌ 断言 1 FAIL: fake-ingress 未收到请求" >&2
  exit 1
fi

# Assertion 2: fake-ingress recorded failure mode
if grep -q '"mode":"failure"' "$INGRESS_LOG"; then
  echo "  ✅ 断言 2: fake-ingress 记录了 failure 响应"
else
  echo "  ❌ 断言 2 FAIL: fake-ingress 未记录 failure 模式" >&2
  exit 1
fi

# Assertion 3: checkpoint NOT written (file should be empty or contain only "{}")
# The daemon should NOT write checkpoint when ingress returns failure
ACTIVATION_FILE="$CONFIG_DIR/state/hex/activation-state.json"
if [[ -f "$ACTIVATION_FILE" ]] && [[ -s "$ACTIVATION_FILE" ]]; then
  # Check if file contains any processed entries (look for "processed" key with content)
  if grep -q '"processed":{}' "$ACTIVATION_FILE" 2>/dev/null; then
    echo "  ✅ 断言 3: checkpoint 未写入（activation-state.json 为空）"
  else
    echo "  ❌ 断言 3 FAIL: checkpoint 不应写入但文件有内容: $(cat $ACTIVATION_FILE)" >&2
    exit 1
  fi
else
  echo "  ✅ 断言 3: checkpoint 未写入（文件为空）"
fi

# Assertion 4: events.jsonl has activation_failed
# Condition-based wait for activation_failed event
WAIT_COUNT=0
until grep -q "activation_failed" "$CONFIG_DIR/state/hex/events.jsonl" 2>/dev/null; do
  sleep 1
  WAIT_COUNT=$((WAIT_COUNT + 1))
  if [[ $WAIT_COUNT -ge $MAX_WAIT ]]; then
    echo "  ❌ 断言 4 FAIL: events.jsonl 没有 activation_failed (timeout after ${MAX_WAIT}s)" >&2
    exit 1
  fi
done
echo "  ✅ 断言 4: events.jsonl 出现 activation_failed"

echo "  ✅ FAILURE PATH 全部通过"
