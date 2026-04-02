#!/bin/bash
# Run AGM integration tests in Docker.
# Usage: bash test/docker/run.sh
# Requires: Docker installed locally.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGM_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
IMAGE_NAME="agm-integration-test:$(id -u)"

# Build image (uses dist/ already built on host)
echo "Building AGM integration test image..."
docker build \
  -f "$SCRIPT_DIR/Dockerfile" \
  -t "$IMAGE_NAME" \
  "$AGM_DIR" \
  2>&1 | tail -3

# Run integration tests
echo ""
echo "Running integration tests in isolated container..."
docker run --rm \
  -v "$AGM_DIR:/workspace/packages/agm:ro" \
  "$IMAGE_NAME" \
  bash /workspace/packages/agm/test/docker/run.sh
