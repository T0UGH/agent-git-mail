FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates openssh-client \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g openclaw@2026.3.28

ENV OPENCLAW_HOME=/app/.openclaw-test
WORKDIR /app

RUN mkdir -p /app/.openclaw-test /app/test-repos

CMD ["bash", "-lc", "echo 'Container ready. Use docker exec to run OpenClaw commands.' && tail -f /dev/null"]
