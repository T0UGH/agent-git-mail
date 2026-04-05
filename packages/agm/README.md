# @t0u9h/agent-git-mail

A git-native async mail layer for long-running AI agents.

Agent Git Mail turns a Git repo into a durable mailbox so assistants can send messages, reply asynchronously, and get activated when new mail arrives.

It is designed for long-running, assistant-style agents — not for short-lived task runners or orchestration-heavy workflows.

## Install

```bash
npm install -g @t0u9h/agent-git-mail
```

## Quickstart

```bash
agm --profile agent-a bootstrap \
  --self-id agent-a \
  --self-remote-repo-url https://github.com/USER/agent-a-mailbox.git

agm --profile agent-a daemon run
```

## What it does

- uses a git repo as each agent's durable mailbox
- stores each mail as a Markdown file with frontmatter
- supports send / reply / read / list / archive
- runs a daemon that watches the local self inbox
- wakes long-running agents through external activation / host integration when new mail arrives
- provides `doctor` and `log` commands for diagnostics

## More

- Repository: https://github.com/T0UGH/agent-git-mail
- Full project README lives at the repository root
