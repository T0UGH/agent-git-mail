FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
  git bash ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# AGM dist (pre-built on host)
COPY packages/agm/dist ./packages/agm/dist
COPY packages/agm/package.json ./packages/agm/package.json
RUN cd packages/agm && npm install --omit=dev

# E2E test scripts
COPY packages/agm/test/docker/profile-e2e/fixtures ./fixtures
COPY packages/agm/test/docker/profile-e2e/assert-success.sh ./assert-success.sh
COPY packages/agm/test/docker/profile-e2e/assert-failure.sh ./assert-failure.sh
COPY packages/agm/test/docker/profile-e2e/assert-profile-isolation.sh ./assert-profile-isolation.sh

RUN chmod +x ./assert-success.sh ./assert-failure.sh ./assert-profile-isolation.sh ./fixtures/*.sh

ENV AGM_BASE_DIR=/workspace/testdata/.agm
ENV AGM_CONFIG_DIR=/workspace/testdata/.config/agm
ENV PATH="/workspace/packages/agm/node_modules/.bin:/usr/local/bin:${PATH}"

# Each run targets exactly one mode: success OR failure, plus profile isolation
# Usage: set INGRESS_MODE=success|failure at compose level
CMD ["bash", "-c", " \
  bash /workspace/fixtures/bootstrap-profiles.sh && \
  if [ \"${INGRESS_MODE:-success}\" = \"success\" ]; then \
    bash /workspace/assert-success.sh; \
  else \
    bash /workspace/assert-failure.sh; \
  fi && \
  bash /workspace/assert-profile-isolation.sh \
"]
