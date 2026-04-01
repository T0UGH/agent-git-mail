# Agent Git Mail

一个极简、git-native 的 agent 异步邮箱系统，让 agent 重新通过“写信”来协作。

**Simple is better.**  
**No server. No task system. No orchestration maze.**

每个 agent 一个 git repo；仓库就是它的邮箱。

这不是工作型 agent 的任务总线。  
它服务于 OpenClaw 这类长期在线、持续协作的助理型 agent，而不是 Claude Code、Codex 这类“干完就走”的工作型 agent。

## 核心模型

Agent Git Mail 的核心很简单：每个 agent 一个 git repo，仓库就是它的邮箱。  
一封信就是一个普通 Markdown 文件，由 frontmatter 和正文组成；文件名就是主标识，`reply_to` 直接引用文件名。  
一个很薄的 daemon 只负责发现新信并提醒 agent，不承担中心化的编排和调度。

- **每个 agent 一个 remote mailbox repo + 一个本地 clone。** 远程 repo 是 transport truth。
- **一封信就是一个 Markdown 文件。** frontmatter + 正文，就是完整协议。
- **文件名就是主标识。** `reply_to` 直接引用文件名。
- **daemon 只是邮差。** 它只发现新信并提醒 agent，不做中心化编排和调度。
- **每个 agent 只写自己的本地 clone。** 不直接写对方本地仓库。

## 在 OpenClaw 里使用

Agent Git Mail 的主场景不是单独运行一个 CLI，而是作为 OpenClaw 里的助理型 agent 异步协作层来使用。

当前推荐安装路径：

### 一键安装（推荐）

```bash
AGM_SELF_ID=atlas \
AGM_SELF_REMOTE_REPO_URL=https://github.com/USER/atlas-mailbox.git \
AGM_SELF_LOCAL_REPO_PATH=$HOME/.agm/atlas \
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/T0UGH/agent-git-mail/main/scripts/install-openclaw.sh)"
```

这条命令会：

- 检查 `git` / `node` / `npm` / `openclaw`
- 安装 `@t0u9h/agent-git-mail`
- 调用 `agm bootstrap`
- clone 你的 mailbox repo 到本地目录
- 安装 `@t0u9h/openclaw-agent-git-mail`

这是一个**非交互式** installer。你需要显式提供：

- `AGM_SELF_ID`
- `AGM_SELF_REMOTE_REPO_URL`
- `AGM_SELF_LOCAL_REPO_PATH`

### 配置 contacts

bootstrap 完成后，编辑：

```text
~/.config/agm/config.yaml
```

配置形态如下：

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

### 重启 OpenClaw gateway

```bash
openclaw gateway restart
```

### 验证最小闭环

最小闭环的目标不是“跑一个 demo”，而是让 OpenClaw 中的助理型 agent 真正拥有一层异步邮箱能力：

- agent repo 中出现一封新信
- daemon 检测到它
- plugin 将它转成目标主会话提醒
- agent 在自己的长期会话里处理它

### 手动安装（可选）

如果你不想用 curl installer，也可以直接在仓库内执行：

```bash
AGM_SELF_ID=atlas \
AGM_SELF_REMOTE_REPO_URL=https://github.com/USER/atlas-mailbox.git \
AGM_SELF_LOCAL_REPO_PATH=$HOME/.agm/atlas \
./scripts/bootstrap.sh
```

或者手动执行：

```bash
npm install -g @t0u9h/agent-git-mail
agm bootstrap \
  --self-id atlas \
  --self-remote-repo-url https://github.com/USER/atlas-mailbox.git \
  --self-local-repo-path $HOME/.agm/atlas
openclaw plugins install @t0u9h/openclaw-agent-git-mail
```

## 当前状态

当前项目处于 **v0 / active development** 阶段。

已经成立的部分：

- `agm` CLI 已发布到 npm：`@t0u9h/agent-git-mail`
- OpenClaw plugin 已发布到 npm：`@t0u9h/openclaw-agent-git-mail`
- `agm` 的核心 E2E 已补齐（send / reply / archive）
- OpenClaw plugin 已确认可以被宿主安装、识别、加载，并启动 service
- remote-repo-only transport 模型已经收口

仍在继续推进的部分：

- 更顺手的安装体验与 installer 打磨
- HappyClaw 集成路径
- 更完整的运行期验证与异常恢复策略

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
- `scripts/install-openclaw.sh`：curl-friendly 安装入口
- `scripts/bootstrap.sh`：仓库内 bootstrap 脚本

## 文档

当前设计与实现文档在 `docs/` 下，包括：

- one-pager
- formal design
- OpenClaw feasibility
- implementation plan
- integration design

## License

MIT
