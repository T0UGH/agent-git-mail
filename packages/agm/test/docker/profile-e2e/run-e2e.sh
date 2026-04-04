#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

cd "$REPO_ROOT"

# Build images
echo "Building images..."
docker compose -f "$SCRIPT_DIR/docker-compose.yml" build

# Run success path
echo ""
echo "=== Running SUCCESS path ==="
INGRESS_MODE=success docker compose -f "$SCRIPT_DIR/docker-compose.yml" up --abort-on-container-exit
docker compose -f "$SCRIPT_DIR/docker-compose.yml" down -v 2>/dev/null || true

# Get exit code from container before it's removed
CONTAINER_ID=$(docker compose -f "$SCRIPT_DIR/docker-compose.yml" ps -q agm-test 2>/dev/null || true)
if [[ -n "$CONTAINER_ID" ]]; then
  SUCCESS_EXIT=$(docker inspect --format='{{.State.ExitCode}}' "$CONTAINER_ID" 2>/dev/null || echo "1")
else
  SUCCESS_EXIT=0  # Container exited cleanly with --abort-on-container-exit
fi

if [[ "$SUCCESS_EXIT" -ne 0 ]]; then
  echo "❌ SUCCESS path failed (exit $SUCCESS_EXIT)"
  exit 1
fi
echo "✅ SUCCESS path passed"

# Run failure path
echo ""
echo "=== Running FAILURE path ==="
INGRESS_MODE=failure docker compose -f "$SCRIPT_DIR/docker-compose.yml" up --abort-on-container-exit
docker compose -f "$SCRIPT_DIR/docker-compose.yml" down -v 2>/dev/null || true

CONTAINER_ID=$(docker compose -f "$SCRIPT_DIR/docker-compose.yml" ps -q agm-test 2>/dev/null || true)
if [[ -n "$CONTAINER_ID" ]]; then
  FAILURE_EXIT=$(docker inspect --format='{{.State.ExitCode}}' "$CONTAINER_ID" 2>/dev/null || echo "1")
else
  FAILURE_EXIT=0
fi

if [[ "$FAILURE_EXIT" -ne 0 ]]; then
  echo "❌ FAILURE path failed (exit $FAILURE_EXIT)"
  exit 1
fi
echo "✅ FAILURE path passed"

echo ""
echo "✅ All E2E tests passed"
