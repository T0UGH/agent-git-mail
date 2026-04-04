#!/bin/bash
set -euo pipefail

TESTDATA="/workspace/testdata"
AGM_DIR="$TESTDATA/.agm"
CONFIG_DIR="$TESTDATA/.config/agm"
REPOS_DIR="$TESTDATA/repos"

mkdir -p "$AGM_DIR/profiles/mt/contacts" "$AGM_DIR/profiles/hex/contacts"
mkdir -p "$CONFIG_DIR/state/mt" "$CONFIG_DIR/state/hex"
mkdir -p "$REPOS_DIR/mt-remote.git" "$REPOS_DIR/hex-remote.git"

# Clean any previous state (survives docker compose down -v)
rm -rf "$AGM_DIR/profiles/mt/self" "$AGM_DIR/profiles/hex/self"
rm -rf "$REPOS_DIR/mt-remote.git" "$REPOS_DIR/hex-remote.git"
mkdir -p "$REPOS_DIR/mt-remote.git" "$REPOS_DIR/hex-remote.git"

# Initialize bare remote repos
cd "$REPOS_DIR/mt-remote.git" && git init -q --bare
cd "$REPOS_DIR/hex-remote.git" && git init -q --bare

# Clone and set up mt self repo
git clone "$REPOS_DIR/mt-remote.git" "$AGM_DIR/profiles/mt/self"
cd "$AGM_DIR/profiles/mt/self"
git config user.email "mt@test.com"
git config user.name "MT"
mkdir -p inbox outbox archive
touch f.txt
git add . && git commit -q -m "init"

# Clone and set up hex self repo
git clone "$REPOS_DIR/hex-remote.git" "$AGM_DIR/profiles/hex/self"
cd "$AGM_DIR/profiles/hex/self"
git config user.email "hex@test.com"
git config user.name "Hex"
mkdir -p inbox outbox archive
touch f.txt
git add . && git commit -q -m "init"

# Write config.yaml
cp /workspace/fixtures/config.yaml "$CONFIG_DIR/config.yaml"

echo "Bootstrap complete"
