#!/bin/bash
set -euo pipefail

TARGET_PROFILE="${1:-hex}"
FROM="${2:-mt}"
SUBJECT="${3:-test}"
TIMESTAMP="$(date +%Y-%m-%dT%H-%M-%SZ)"
FILENAME="${TIMESTAMP}-${FROM}-to-${TARGET_PROFILE}.md"

AGM_BASE_DIR="${AGM_BASE_DIR:-/workspace/testdata/.agm}"
TARGET_REPO="$AGM_BASE_DIR/profiles/${TARGET_PROFILE}/self"

if [[ ! -d "$TARGET_REPO" ]]; then
  echo "ERROR: target repo $TARGET_REPO does not exist" >&2
  exit 1
fi

cat > "/tmp/$FILENAME" << EOF
---
from: ${FROM}
to: ${TARGET_PROFILE}
subject: ${SUBJECT}
---
body
EOF

cp "/tmp/$FILENAME" "$TARGET_REPO/inbox/$FILENAME"
rm "/tmp/$FILENAME"

cd "$TARGET_REPO"
git add "inbox/$FILENAME"
git commit -q -m "mail from ${FROM} to ${TARGET_PROFILE}"

echo "Injected $FILENAME into $TARGET_PROFILE inbox"
