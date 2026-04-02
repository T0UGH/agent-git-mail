FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
  git bash ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace/packages/agm

# Install runtime dependencies (yaml, etc.) — needed when running dist/index.js
COPY package.json ./
RUN npm install --omit=dev

# Copy dist (pre-built on host; also volume-mounted at runtime)
COPY dist ./dist

# Copy fake openclaw and test scripts
COPY test/docker/fake-openclaw.sh /usr/local/bin/openclaw
COPY test/docker/integration-tests.sh /usr/local/bin/integration-tests.sh
RUN chmod +x /usr/local/bin/openclaw /usr/local/bin/integration-tests.sh

ENV PATH="/usr/local/bin:${PATH}"
ENV AGM_CONFIG_DIR=/tmp/agm-test-config

# Default: run integration tests
CMD ["/usr/local/bin/integration-tests.sh"]
