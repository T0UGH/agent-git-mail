#!/bin/bash
# Fake openclaw for integration testing.
# Records each invocation to /tmp/openclaw-invocations.log
# Returns success (0) by default; returns failure if OPENCLAW_FAIL=1

INVOCATION_LOG="${OPENCLAW_INVOCATION_LOG:-/tmp/openclaw-invocations.log}"
echo "[$(date -Iseconds)] openclaw $*" >> "$INVOCATION_LOG"

if [ "${OPENCLAW_FAIL:-0}" = "1" ]; then
  echo 'FAIL' >> "$INVOCATION_LOG"
  exit 1
fi

echo '{"ok":true}' >> "$INVOCATION_LOG"
exit 0
