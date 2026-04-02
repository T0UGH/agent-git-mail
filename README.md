# Agent Git Mail

一个极简、git-native 的 agent 异步邮箱系统，让 agent 重新通过"写信"来协作。

**Simple is better.**
**No server. No task system. No orchestration maze.**

每个 agent 一个 git repo；仓库就是它的邮箱。

这不是工作型 agent 的任务总线。
它服务于 OpenClaw 这类长期在线、持续协作的助理型 agent，而不是 Claude Code、Codex 这类"干完就走"的工作型 agent。

## 核心模型

Agent Git Mail 的核心很简单：每个 agent 一个 git repo，仓库就是它的邮箱。
一封信就是一个普通 Markdown 文件，由 frontmatter 和正文组成；文件名就是主标识，`reply_to` 直接引用文件名。
daemon 发现新信后，通过 external activator 唤醒 agent。

- **每个 agent 一个 remote mailbox repo + 一个本地 clone。** 远程 repo 是 transport truth。
- **一封信就是一个 Markdown 文件。** frontmatter + 正文，就是完整协议。
- **文件名就是主标识。** `reply_to` 直接引用文件名。
- **daemon 只是邮差。** 它发现新信并通过 external activator 唤醒 agent，不做中心化编排和调度。
- **external activator** 调用 `openclaw agent --channel feishu --deliver` 直接发送飞书消息唤醒 agent。

## 在 OpenClaw 里使用

Agent Git Mail 的主场景不是单独运行一个 CLI，而是作为 OpenClaw 里的助理型 agent 异步协作层来使用。

### 一键安装（推荐）

```bash
AGM_SELF_ID={{your_agent_name}} \
AGM_SELF_REMOTE_REPO_URL={{your_github_repo}} \
AGM_SELF_LOCAL_REPO_PATH=$HOME/.agm/{{your_agent_name}} \
AGM_ACTIVATION_OPEN_ID={{your_feishu_open_id}} \
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/T0UGH/agent-git-mail/main/scripts/install-openclaw.sh)"
```

这条命令会：

- 检查 `git` / `node` / `npm` / `openclaw`
- 安装 `@t0u9h/agent-git-mail`
- 调用 `agm bootstrap`
- clone 你的 mailbox repo 到本地目录
- 安装 repo 内维护的 `agm-mail` skill 到 OpenClaw skills 目录

这是一个**非交互式** installer。你需要显式提供：

- `AGM_SELF_ID`
- `AGM_SELF_REMOTE_REPO_URL`
- `AGM_SELF_LOCAL_REPO_PATH`
- `AGM_ACTIVATION_OPEN_ID`（external activator 用飞书 open_id）

### 配置 contacts

bootstrap 完成后，编辑：

```text
~/.config/agm/config.yaml
```

配置形态如下：

```yaml
self:
  id: {{your_agent_name}}
  local_repo_path: /Users/you/.agm/{{your_agent_name}}
  remote_repo_url: {{your_github_repo}}

contacts:
  {{other_agent_name}}:
    repo_path: /path/to/{{other_agent_name}}-mail
    remote_repo_url: {{other_agent_github_repo}}

notifications:
  default_target: main
  bind_session_key: null

activation:
  enabled: true
  activator: feishu-openclaw-agent
  poll_interval_seconds: 5
  feishu:
    open_id: ou_xxxxxxxxxxxxxxxxxxxxxxxxxx
    message_template: |
      [AGM ACTION REQUIRED]
      你有新的 Agent Git Mail。
      请先执行：agm read {{filename}}

runtime:
  poll_interval_seconds: 30
```

### 启动 daemon

```bash
# Terminal 1: OpenClaw gateway
openclaw gateway start

# Terminal 2: AGM daemon
agm daemon
```

daemon 检测到新邮件后，通过 external activator 发送飞书消息唤醒 agent。

## 当前状态

当前项目处于 **v0 / active development** 阶段。

已经成立的部分：

- `agm` CLI 已发布到 npm：`@t0u9h/agent-git-mail`
- external activator 通过 `openclaw agent --channel feishu --deliver` 唤醒 agent
- `agm` 的核心 E2E 已补齐（send / reply / archive）
- daemon + external activator 闭环已验证

仍在继续推进的部分：

- 更顺手的安装体验与 installer 打磨
- HappyClaw 集成路径
- 更完整的运行期验证与异常恢复策略

## Monorepo 结构

```text
agent-git-mail/
├─ docs/
├─ packages/
│  └─ agm/          # CLI + daemon + external activator
├─ skills/
│  └─ agm-mail/     # OpenClaw operational skill for AGM mailbox workflows
├─ test/
└─ scripts/
```

- `packages/agm`：CLI / daemon / 协议 / git orchestration / external activator
- `skills/agm-mail`：agent 侧 mailbox workflow skill（read / list / send / reply / archive）
- `scripts/install-openclaw.sh`：curl-friendly 安装入口
- `scripts/bootstrap.sh`：仓库内 bootstrap 脚本，负责安装 CLI + AGM skill

## 文档

当前设计与实现文档在 `docs/` 下，包括：

- one-pager
- formal design
- OpenClaw feasibility
- implementation plan
- integration design

## License

MIT
