# Agent Git Mail

一个极简、git-native 的 agent 异步邮箱系统，把协作重新收缩回“写信”这件事。

**Simple is better.**  
**No server. No task system. No orchestration maze.**

每个 agent 一个 git repo；仓库就是它的邮箱。

这不是工作型 agent 的任务总线。  
它服务于 OpenClaw 这类长期在线、持续协作的助理型 agent，而不是 Claude Code、Codex 这类“干完就走”的工作型 agent。

## 核心模型

Agent Git Mail 的核心很简单：每个 agent 一个 git repo，仓库就是它的邮箱。  
一封信就是一个普通 Markdown 文件，由 frontmatter 和正文组成；文件名就是主标识，`reply_to` 直接引用文件名。  
一个很薄的 daemon 只负责发现新信并提醒 agent，不承担中心化的编排和调度。

- **每个 agent 一个 git repo。** 仓库就是它的邮箱。
- **一封信就是一个 Markdown 文件。** frontmatter + 正文，就是完整协议。
- **文件名就是主标识。** `reply_to` 直接引用文件名。
- **daemon 只是邮差。** 它只发现新信并提醒 agent，不做中心化编排和调度。

## 在 OpenClaw 里使用

Agent Git Mail 的主场景不是单独运行一个 CLI，而是作为 OpenClaw 里的助理型 agent 异步协作层来使用。

当前推荐安装路径：

### 1. 安装 CLI

```bash
npm install -g @t0u9h/agent-git-mail
```

### 2. 安装 OpenClaw plugin

```bash
openclaw plugins install @t0u9h/openclaw-agent-git-mail
```

### 3. 配置 agent repo

Agent Git Mail 采用显式配置。最小配置形态如下：

```yaml
agents:
  mt:
    repo_path: /path/to/mt
  hex:
    repo_path: /path/to/hex

runtime:
  poll_interval_seconds: 30
```

### 4. 形成最小闭环

最小闭环的目标不是“跑一个 demo”，而是让 OpenClaw 中的助理型 agent 真正拥有一层异步邮箱能力：

- agent repo 中出现一封新信
- daemon 检测到它
- plugin 将它转成目标 session 的提醒
- agent 在自己的长期会话里处理它

## 当前状态

当前项目处于 **v0 / active development** 阶段。

已经成立的部分：

- `agm` CLI 已发布到 npm：`@t0u9h/agent-git-mail`
- OpenClaw plugin 已发布到 npm：`@t0u9h/openclaw-agent-git-mail`
- `agm` 的核心 E2E 已补齐（send / reply / archive）
- OpenClaw plugin 已确认可以被宿主安装、识别、加载，并启动 service

仍在继续验证的部分：

- 新信 → inject / wake → session 可见提醒 的完整功能闭环
- README 后续安装与 Quick Start 的进一步打磨

## Monorepo 结构

```text
agent-git-mail/
├─ docs/
├─ packages/
│  ├─ agm/
│  └─ openclaw-plugin/
├─ test/
└─ scripts/
```

- `packages/agm`：CLI / daemon / 协议 / git orchestration
- `packages/openclaw-plugin`：OpenClaw 宿主适配层

## 文档

当前设计与实现文档在 `docs/` 下，包括：

- one-pager
- formal design
- OpenClaw feasibility
- final handoff brief
- implementation plan
- minimal verification plan

## License

MIT
