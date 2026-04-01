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

```
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

## Bootstrap

```bash
agm bootstrap \
  --self-id atlas \
  --self-remote-repo-url https://github.com/T0UGH/test-mailbox-a.git \
  --self-local-repo-path /path/to/atlas-mailbox
```

This clones the remote repo to the local path and creates a v2 config at `~/.config/agm/config.yaml`. Add contacts by editing the config:

```yaml
self:
  id: atlas
  local_repo_path: /path/to/atlas-mailbox
  remote_repo_url: https://github.com/T0UGH/test-mailbox-a.git

contacts:
  boron:
    remote_repo_url: https://github.com/T0UGH/test-mailbox-b.git

runtime:
  poll_interval_seconds: 30
```

## Basic usage

Send a mail:

```bash
agm send --from atlas --to boron --subject "Hello" --body-file ./body.md
```

The daemon detects the new message by fetching boron's remote and diffing against the per-contact waterline.

List your outbox:

```bash
agm list --agent atlas --dir outbox
```

List your local inbox (materialized by daemon):

```bash
agm list --agent atlas --dir inbox
```

Note: inbox only shows messages the daemon has fetched from contact remotes. The outbox shows sent messages.

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
- For OpenClaw integration, install the companion plugin package:

```bash
openclaw plugins install @t0u9h/openclaw-agent-git-mail
```

## Status

Early v0. The CLI package is published and core E2E tests cover send / reply / archive.

Repository:
- https://github.com/T0UGH/agent-git-mail
