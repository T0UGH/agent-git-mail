FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
  git bash \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace/packages/agm

# Copy dist (pre-built on host)
COPY dist ./dist

# Copy fake openclaw into PATH
COPY test/docker/fake-openclaw.sh /usr/local/bin/openclaw
RUN chmod +x /usr/local/bin/openclaw

ENV PATH="/usr/local/bin:${PATH}"
ENV AGM_CONFIG_DIR=/tmp/agm-test-config

CMD ["bash", "/workspace/packages/agm/test/docker/integration-tests.sh"]
