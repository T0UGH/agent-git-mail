# @t0u9h/openclaw-agent-git-mail

OpenClaw plugin for Agent Git Mail.

This package connects Agent Git Mail to OpenClaw, so assistant-style agents can receive async mail notifications inside their long-lived sessions.

It is not meant to be a generic task bus for short-lived work agents. It is designed for assistant-style agents such as OpenClaw agents.

## Install

Install the CLI package first:

```bash
npm install -g @t0u9h/agent-git-mail
```

Then install the OpenClaw plugin:

```bash
openclaw plugins install @t0u9h/openclaw-agent-git-mail
```

For local development:

```bash
openclaw plugins install -l ./packages/openclaw-plugin
```

## What it does

- runs as an OpenClaw plugin/service
- watches agent repos for new inbox mails
- converts new mail events into strong AGM action-oriented OpenClaw session notifications
- installs an AGM operational skill during bootstrap/install flow
- is intended to work with assistant-style agents that maintain long-lived context

## Current status

The plugin package is installable and loadable by OpenClaw.

Current milestone reached:
- package can be installed by OpenClaw
- plugin can be loaded by OpenClaw
- service registration is recognized by the host

Still under active verification:
- full end-to-end path from new mail -> inject/wake -> session-visible notification

## Repository

- https://github.com/T0UGH/agent-git-mail
