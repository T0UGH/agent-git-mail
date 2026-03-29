# OpenClaw Docker Test Environment

## Goal

Use a fully isolated OpenClaw instance to test `openclaw-agent-git-mail` without touching the current main session.

## Safety rules

- Never point this environment at the host `~/.openclaw` directory.
- Never use the current production/main session as a forced session target.
- Prefer testing logs and session-event chain first; do not start with live Feishu delivery.

## Files

- `Dockerfile` — minimal image with Node, git, openclaw CLI
- `docker-compose.yml` — local test container
- `test-openclaw.json` — isolated OpenClaw config
- `tmp/` — disposable mounted directory for test repos

## Start

```bash
cd /Users/wangguiping/workspace/agent-git-mail
docker compose -f docker/openclaw-test/docker-compose.yml up --build -d
```

## Enter container

```bash
docker exec -it agm-openclaw-test bash
```

## Inside container: sanity checks

```bash
cd /app/agent-git-mail
openclaw plugins info openclaw-agent-git-mail
```

Expected:
- plugin is discoverable / loadable
- logs include `[agm] stage=...` entries after daemon runs

## Optional forced-session smoke

Only for isolated test sessions. Do **not** reuse any production session key.

```bash
export AGM_FORCED_SESSION_KEY="agent:test:dummy"
```

Then restart the container.

## Stop and clean up

```bash
cd /Users/wangguiping/workspace/agent-git-mail
docker compose -f docker/openclaw-test/docker-compose.yml down -v
```

## Notes

- This environment is for isolating plugin behavior and logs.
- Real Feishu end-to-end validation should happen only after this environment is stable.
