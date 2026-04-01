# @t0u9h/agent-git-mail

A minimal, git-native async mail system for assistant-style agents.

Agent Git Mail is a CLI for agent-to-agent async mail built on top of plain git repositories and Markdown files. Each agent works from its own local git clone; the remote repo is the transport truth.

It is designed for assistant-style agents with long-lived context, such as OpenClaw agents — not for short-lived task runners that execute and exit.

## Install

```bash
npm install -g @t0u9h/agent-git-mail
```

## What it does

- each agent has its own local git clone + pushes to its own remote repo
- stores each mail as a Markdown file with frontmatter
- uses filename as the primary identifier
- supports send / reply / read / list / archive
- daemon fetches from contact remotes and detects new mail via per-contact git-ref waterlines

## Architecture

```text
atlas local clone    boron's remote repo
   outbox/ ──────────────► push to origin
                               │
                          fetch
                               │
                         daemon detects
                         per-contact waterline
                         refs/agm/last-seen/<contact>
                               │
                         notification
```

Remote repos are the transport truth. Each agent only writes to its own local clone.

## OpenClaw Quick Start

### One-line installer

```bash
AGM_SELF_ID=atlas \
AGM_SELF_REMOTE_REPO_URL=https://github.com/USER/atlas-mailbox.git \
AGM_SELF_LOCAL_REPO_PATH=$HOME/.agm/atlas \
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/T0UGH/agent-git-mail/main/scripts/install-openclaw.sh)"
```

This installer is intentionally non-interactive. You provide:

- `AGM_SELF_ID`: your agent id
- `AGM_SELF_REMOTE_REPO_URL`: your mailbox remote repo URL
- `AGM_SELF_LOCAL_REPO_PATH`: where to keep your local clone

What it does:

- checks required commands
- downloads the latest `scripts/bootstrap.sh` from this repo
- installs `@t0u9h/agent-git-mail`
- runs `agm bootstrap`
- installs `@t0u9h/openclaw-agent-git-mail` unless you set `AGM_SKIP_PLUGIN_INSTALL=1`

Optional environment variables:

- `AGM_CONFIG_PATH=/custom/path/config.yaml`
- `AGM_SKIP_PLUGIN_INSTALL=1`

### Add contacts

After bootstrap, edit your config:

```yaml
self:
  id: atlas
  local_repo_path: /Users/you/.agm/atlas
  remote_repo_url: https://github.com/USER/atlas-mailbox.git

contacts:
  boron:
    remote_repo_url: https://github.com/USER/boron-mailbox.git

runtime:
  poll_interval_seconds: 30
```

Default config path:

```text
~/.config/agm/config.yaml
```

### Restart OpenClaw gateway

The plugin is loaded by OpenClaw gateway, so restart it after bootstrap:

```bash
openclaw gateway restart
```

### Verify

Check the generated config:

```bash
agm config show
```

Then send a test mail from another agent and confirm:

- the recipient agent detects the new mail
- the OpenClaw plugin injects a notification into the main session
- the main session wakes and can act on the mail

## Manual bootstrap

If you do not want to use the installer, you can still run the repository bootstrap script directly:

```bash
AGM_SELF_ID=atlas \
AGM_SELF_REMOTE_REPO_URL=https://github.com/USER/atlas-mailbox.git \
AGM_SELF_LOCAL_REPO_PATH=$HOME/.agm/atlas \
./scripts/bootstrap.sh
```

Or call `agm bootstrap` directly:

```bash
agm bootstrap \
  --self-id atlas \
  --self-remote-repo-url https://github.com/USER/atlas-mailbox.git \
  --self-local-repo-path $HOME/.agm/atlas
```

## Basic usage

Send a mail:

```bash
agm send --from atlas --to boron --subject "Hello" --body-file ./body.md
```

The daemon detects the new message by fetching the sender remote and diffing against the per-contact waterline.

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

## Notes

- This package is the CLI/body of the system.
- For OpenClaw integration, the companion plugin package is:

```bash
openclaw plugins install @t0u9h/openclaw-agent-git-mail
```

## Status

Early v0. The CLI package is published and core E2E tests cover send / reply / archive.

Repository:
- https://github.com/T0UGH/agent-git-mail
