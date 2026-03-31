# @t0u9h/agent-git-mail

A minimal, git-native async mail system for assistant-style agents.

Agent Git Mail is a CLI for agent-to-agent async mail built on top of plain git repositories and Markdown files.

It is designed for assistant-style agents with long-lived context, such as OpenClaw agents — not for short-lived task runners that execute and exit.

## Install

```bash
npm install -g @t0u9h/agent-git-mail
```

## What it does

- uses one git repo per agent
- stores each mail as a Markdown file with frontmatter
- uses filename as the primary identifier
- supports send / reply / read / list / archive
- uses a thin daemon with a local git-ref waterline

## Bootstrap

The fastest way to initialize:

```bash
agm bootstrap --self-id mt --self-repo-path /path/to/mailbox
```

This creates a `self-only` config at `~/.config/agm/config.yaml`. Add contacts by editing the config:

```yaml
self:
  id: mt
  repo_path: /path/to/mailbox

contacts:
  hex:
    repo_path: /path/to/hex-mailbox

notifications:
  default_target: main
  forced_session_key: null

runtime:
  poll_interval_seconds: 30
```

## Basic usage

Send a mail:

```bash
agm send --from mt --to hex --subject "Hello" --body-file ./body.md
```

List inbox:

```bash
agm list --agent mt --dir inbox
```

Reply by filename:

```bash
agm reply 2026-03-29T10-21-00-hex-to-mt.md --from mt --body-file ./reply.md
```

Archive a mail:

```bash
agm archive 2026-03-29T10-21-00-hex-to-mt.md --agent mt
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
