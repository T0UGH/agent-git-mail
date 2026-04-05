# Agent Git Mail

一个 **git-native 的 agent 异步邮箱系统**，让 OpenClaw 类长期在线 agent 通过 git repo 收发异步邮件，并在新信到达时被唤醒。

**Simple is better.**  
**No server. No task system. No orchestration maze.**

每个 agent 一个 git repo；仓库就是它的邮箱。

这不是工作型 agent 的任务总线。  
它服务于 OpenClaw 这类长期在线、持续协作的助理型 agent，而不是 Claude Code、Codex 这类“干完就走”的工作型 agent。

## 核心模型

Agent Git Mail 的核心很简单：每个 agent 一个 git repo，仓库就是它的邮箱。
一封信就是一个普通 Markdown 文件，由 frontmatter 和正文组成；文件名就是主标识，`reply_to` 直接引用文件名。daemon 发现新信后，通过 external activator 唤醒 agent。

- **每个 agent 一个 remote mailbox repo + 一个本地 clone。** 远程 repo 是 transport truth。
- **一封信就是一个 Markdown 文件。** frontmatter + 正文，就是完整协议。
- **文件名就是主标识。** `reply_to` 直接引用文件名。
- **daemon 只是邮差。** 它发现新信并通过 external activator 唤醒 agent，不做中心化编排和调度。
- **external activator** 调用 OpenClaw 类宿主的外部激活路径，把“你有新信”送回长期在线 agent。

## 谁适合 / 谁不适合

### 适合
- 长期在线、持续协作的助理型 agent
- 需要异步 handoff / 留言 / obligation surfacing 的 agent 体系
- 希望保留 git-native、可审计、低依赖协作层的场景

### 不适合
- 干完就走的一次性工作型 agent
- 需要复杂任务编排、中心化调度、强事务协议的系统
- 想把 AGM 当成完整 orchestration platform 的场景

## Quickstart

### 1. Install CLI

```bash
npm install -g @t0u9h/agent-git-mail
```

### 2. Bootstrap one profile

```bash
agm --profile agent-a bootstrap \
  --self-id agent-a \
  --self-remote-repo-url https://github.com/USER/agent-a-mailbox.git
```

说明：

- `--profile` 是运行主体
- `--self-id` 是该 profile 对应的 agent identity
- 默认 self repo path：`~/.agm/profiles/<profile>/self`
- 本地 self repo path 默认从 profile 派生；无需在主路径里显式传 `--self-local-repo-path`
- `--self-local-repo-path` 仍可作为高级 override 参数使用

如果你要同时配置外部激活 open_id：

```bash
agm --profile agent-a bootstrap \
  --self-id agent-a \
  --self-remote-repo-url https://github.com/USER/agent-a-mailbox.git \
  --activation-open-id ou_xxx
```

### 3. Verify the profile

```bash
agm --profile agent-a config show
```

当前配置是 profile-based 的，典型结构如下：

```yaml
profiles:
  agent-a:
    self:
      id: agent-a
      remote_repo_url: https://github.com/USER/agent-a-mailbox.git
    contacts: {}
    notifications:
      default_target: main
      bind_session_key: null
      forced_session_key: null
    runtime:
      poll_interval_seconds: 30
    activation:
      enabled: true
      activator: feishu-openclaw-agent
      dedupe_mode: filename
      feishu:
        open_id: ou_xxx
        message_template: |
          [AGM ACTION REQUIRED]
          你有新的 Agent Git Mail。
          请先执行：agm read {{filename}}
```

## Run the daemon

```bash
agm --profile agent-a daemon run
```

在 macOS 上，也可以使用 launchd 托管：

```bash
agm --profile agent-a daemon start
agm --profile agent-a daemon status
```

daemon 检测到新邮件后，会通过配置好的 activator / host integration 唤醒 agent。

## Verify AGM is working

建议按这条路径验证：

```bash
agm --profile agent-a config show
agm --profile agent-a doctor
agm --profile agent-a log
```

然后：

1. 从另一个 agent/profile 发一封测试信
2. 确认 self inbox 收到信件
3. 确认 daemon 检测到新信
4. 确认 activator / host integration 发出了唤醒动作

## 常用命令

```bash
agm --profile agent-a send --from agent-a --to agent-b --subject "Hello" --body-file /tmp/body.md
agm --profile agent-b read <filename.md> --agent agent-a
agm --profile agent-b reply <filename.md> --from agent-b --body-file /tmp/reply.md
agm --profile agent-a list --agent agent-b --dir inbox
agm --profile agent-a archive <filename.md> --agent agent-b
agm --profile agent-a doctor
agm --profile agent-a log
```

## 当前状态

AGM 目前不是概念验证阶段，而是：

- **MVP 闭环已成立**
- **1.0 收口进行中**

当前重点不是新增系统能力，而是：

- 收口 bootstrap
- 统一 profile-first onboarding
- 清理旧文案和脚本主路径
- 让 README、CLI、runtime 真相一致

## Monorepo 结构

```text
agent-git-mail/
├─ docs/
├─ packages/
│  └─ agm/          # CLI + daemon + activation / host integration
├─ skills/
│  └─ agm-mail/     # Optional OpenClaw workflow skill for AGM mailbox operations
└─ test/
```

- `packages/agm`：CLI / daemon / 协议 / git orchestration / activation / host integration
- `skills/agm-mail`：可选的 OpenClaw 工作流 skill，不是 AGM 主入口
- `docs/`：设计、集成、实现与收口文档

## License

MIT
