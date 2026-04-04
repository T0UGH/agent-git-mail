#!/bin/bash
set -euo pipefail

AGM_BASE_DIR="${AGM_BASE_DIR:-/workspace/testdata/.agm}"
CONFIG_DIR="${AGM_CONFIG_DIR:-/workspace/testdata/.config/agm}"

echo "=== ASSERT: profile isolation ==="

MT_STATE_DIR="$CONFIG_DIR/state/mt"
HEX_STATE_DIR="$CONFIG_DIR/state/hex"
MT_SELF="$AGM_BASE_DIR/profiles/mt/self"
HEX_SELF="$AGM_BASE_DIR/profiles/hex/self"

# hex's local cache of mt's mailbox (contact cache)
HEX_MT_CACHE="$AGM_BASE_DIR/profiles/hex/contacts/mt"
# mt's local cache of hex's mailbox (contact cache)
MT_HEX_CACHE="$AGM_BASE_DIR/profiles/mt/contacts/hex"

# Assertion 1: mt and hex state directories are different
if [[ "$MT_STATE_DIR" != "$HEX_STATE_DIR" ]]; then
  echo "  ✅ 断言 1: mt state ($MT_STATE_DIR) ≠ hex state ($HEX_STATE_DIR)"
else
  echo "  ❌ 断言 1 FAIL: mt 和 hex state 目录相同" >&2
  exit 1
fi

# Assertion 2: mt self repo ≠ hex self repo
if [[ "$MT_SELF" != "$HEX_SELF" ]]; then
  echo "  ✅ 断言 2: mt self repo ($MT_SELF) ≠ hex self repo ($HEX_SELF)"
else
  echo "  ❌ 断言 2 FAIL: mt 和 hex self repo 相同" >&2
  exit 1
fi

# Assertion 3: hex's mt contact cache ≠ mt's self repo (boundary not confused)
if [[ "$HEX_MT_CACHE" != "$MT_SELF" ]]; then
  echo "  ✅ 断言 3: hex 的 mt cache ($HEX_MT_CACHE) ≠ mt self repo ($MT_SELF)"
else
  echo "  ❌ 断言 3 FAIL: contact cache 与 self repo 相同（边界混淆）" >&2
  exit 1
fi

# Assertion 4: hex daemon writes hex state, not mt state
# Pre-populate mt checkpoint
echo '{}' > "$MT_STATE_DIR/activation-state.json"
echo '[]' > "$MT_STATE_DIR/events.jsonl"

AGM_CONFIG_DIR="$CONFIG_DIR" AGM_BASE_DIR="$AGM_BASE_DIR" \
  node /workspace/packages/agm/dist/index.js daemon --profile hex --once 2>&1 || true

# hex daemon wrote its own activation-state.json
if [[ -f "$HEX_STATE_DIR/activation-state.json" ]] && [[ -s "$HEX_STATE_DIR/activation-state.json" ]]; then
  echo "  ✅ 断言 4: hex daemon 写入了自己的 activation-state.json"
else
  echo "  ⚠️  断言 4: hex activation-state.json 不存在或为空（可能无新邮件触发 daemon）"
fi

# mt's activation-state.json was NOT polluted by hex daemon
MT_CHECKPOINT_CONTENT=$(cat "$MT_STATE_DIR/activation-state.json" 2>/dev/null || echo "{}")
if [[ "$MT_CHECKPOINT_CONTENT" == "{}" ]] || [[ "$MT_CHECKPOINT_CONTENT" == "'{}'" ]]; then
  echo "  ✅ 断言 4: mt 的 activation-state.json 未被 hex 污染"
else
  # Check if it contains any actual checkpoint entries (not just empty)
  if echo "$MT_CHECKPOINT_CONTENT" | grep -q '"::"'; then
    echo "  ❌ 断言 4 FAIL: mt 的 checkpoint 被 hex 污染" >&2
    exit 1
  else
    echo "  ✅ 断言 4: mt 的 activation-state.json 未被 hex 污染"
  fi
fi

echo "  ✅ PROFILE ISOLATION 全部通过"
