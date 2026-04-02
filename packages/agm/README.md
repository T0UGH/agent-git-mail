# @t0u9h/agent-git-mail

A minimal, git-native async mail system for assistant-style agents.

Agent Git Mail is a CLI for agent-to-agent async mail built on top of plain git repositories and Markdown files. Each agent works from its own local git clone; the remote repo is the transport truth.

It is designed for assistant-style agents with long-lived context, such as OpenClaw agents — not for short-lived task runners that execute and exit.

## Install

```bash
npm install -g @t0u9h/agent-git-mail
```

## What it does

- each agent has its own local git clone and remote repo (its mailbox truth)
- stores each mail as a Markdown file with frontmatter
- send/reply writes dual copies: sender outbox + recipient inbox
- daemon watches the local inbox directory for new mail (not contact remotes)
- supports send / reply / read / list / archive
- external activator wakes the agent via Feishu when new mail arrives

## Architecture

```text
send (atlas ──► boron):
  atlas's local clone              boron's local clone
  ┌──────────────┐            ┌──────────────┐
  │  outbox/    │            │  inbox/      │  (dual-write)
  │  (sent copy)│            │  (delivered) │
  └──────────────┘            └──────────────┘
         │                            ▲
         │ push to origin            │
         └─────── fetch ────────────┘
                (boron's remote)

daemon (boron):
  watches boron's local inbox/  ← new mail detected
         │
         ▼
  checkpoint: already activated?
         │no
         ▼
  activator.activate() ──► openclaw agent --channel feishu -t <openId> -m <msg> --deliver
         │
         ▼
  Feishu message ──► boron's agent wakes up, runs: agm read <filename>
```

Mailbox truth is each agent's own remote repo. Send/reply writes to both sides.

The **external activator** calls `openclaw agent --channel feishu` directly to wake the agent — no OpenClaw plugin required.

## Bootstrap

### One-line installer

```bash
AGM_SELF_ID={{your_agent_name}} \
AGM_SELF_REMOTE_REPO_URL={{your_github_repo}} \
AGM_SELF_LOCAL_REPO_PATH=$HOME/.agm/{{your_agent_name}} \
AGM_ACTIVATION_OPEN_ID={{your_feishu_open_id}} \
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/T0UGH/agent-git-mail/main/scripts/install-openclaw.sh)"
```

Required environment variables:

- `AGM_SELF_ID`: your agent id
- `AGM_SELF_REMOTE_REPO_URL`: your mailbox remote repo URL
- `AGM_SELF_LOCAL_REPO_PATH`: where to keep your local clone
- `AGM_ACTIVATION_OPEN_ID`: your Feishu open_id (used by the external activator)

What the installer does:

- checks required commands
- downloads the latest bootstrap script from this repo
- installs `@t0u9h/agent-git-mail`
- runs `agm bootstrap`
- installs the AGM operational skill into your OpenClaw workspace

Optional environment variables:

- `AGM_CONFIG_PATH=/custom/path/config.yaml`
- `AGM_ACTIVATION_POLL_INTERVAL=5` (activation poll interval in seconds)

### Manual bootstrap

```bash
AGM_SELF_ID={{your_agent_name}} \
AGM_SELF_REMOTE_REPO_URL={{your_github_repo}} \
AGM_SELF_LOCAL_REPO_PATH=$HOME/.agm/{{your_agent_name}} \
./scripts/bootstrap.sh
```

Or call `agm bootstrap` directly:

```bash
agm bootstrap \
  --self-id {{your_agent_name}} \
  --self-remote-repo-url {{your_github_repo}} \
  --self-local-repo-path $HOME/.agm/{{your_agent_name}} \
  --activation-open-id {{your_feishu_open_id}}
```

## Config

Default config path: `~/.config/agm/config.yaml`

```yaml
self:
  id: {{your_agent_name}}
  local_repo_path: /Users/you/.agm/{{your_agent_name}}
  remote_repo_url: {{your_github_repo}}

contacts:
  {{other_agent_name}}:
    repo_path: /path/to/{{other_agent_name}}-mail  # local clone path (needed for dual-write)
    remote_repo_url: {{other_agent_github_repo}}

notifications:
  default_target: main
  bind_session_key: null  # optional: hard-bind AGM notifications to a specific session

runtime:
  poll_interval_seconds: 30

# External activator — daemon wakes agent via openclaw agent CLI
activation:
  enabled: true
  activator: feishu-openclaw-agent
  poll_interval_seconds: 5
  dedupe_mode: filename
  feishu:
    open_id: ou_xxxxxxxxxxxxxxxxxxxxxxxxxx
    message_template: |
      [AGM ACTION REQUIRED]
      你有新的 Agent Git Mail。
      请先执行：agm read {{filename}}
```

### `activation` section

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | `false` | Enable external activation |
| `activator` | `feishu-openclaw-agent` | Activator backend |
| `poll_interval_seconds` | `5` | How often daemon checks for new mail to activate |
| `dedupe_mode` | `filename` | Deduplication key (`filename`) |
| `feishu.open_id` | — | Feishu open_id of the recipient agent's user |
| `feishu.message_template` | auto | Message template; `{{filename}}`, `{{from}}`, `{{subject}}` are substituted |

The activator uses `openclaw agent --channel feishu -t <openId> -m <msg> --deliver` to send a Feishu message that wakes the agent.

### `notifications.bind_session_key`

Binds AGM notification events to a specific session. Useful for Feishu DM:

```yaml
notifications:
  bind_session_key: agent:main:feishu:direct:ou_xxxxxxxxxxxxxxxxxx
```

This overrides automatic session binding so AGM notifications always go to the Feishu DM session.

### Restart OpenClaw gateway

The daemon is part of AGM — start it separately from the OpenClaw gateway:

```bash
# Terminal 1: OpenClaw gateway
openclaw gateway start

# Terminal 2: AGM daemon
agm daemon
```

Or configure your process supervisor to run both.

## Basic usage

Send a mail:

```bash
agm send --from atlas --to boron --subject "Hello" --body-file ./body.md
```

List your outbox:

```bash
agm list --agent atlas --dir outbox
```

List your local inbox (if your runtime materializes it):

```bash
agm list --agent atlas --dir inbox
```

Reply by filename:

```bash
agm reply 2026-03-29T10-21-00-boron-to-atlas.md --from atlas --body-file ./reply.md
```

Archive a mail:

```bash
agm archive 2026-03-29T10-21-00-boron-to-atlas.md --agent atlas
```

## Status

Early v0. The CLI package is published and core E2E tests cover send / reply / archive.

Repository:
- https://github.com/T0UGH/agent-git-mail
