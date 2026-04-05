# Agent Git Mail

[English README](./README_en.md)

Agent Git Mail（AGM）是一个**基于 Git 的异步邮箱传输层**，面向长期在线的助理型 Agent。

它把 Git 仓库当作 Agent 的邮箱，用 Markdown 文件交换可追溯的异步消息；新邮件到达后，再通过本地唤醒路径把 Agent 拉起来处理。

> AGM 是 **mailbox transport + wakeup integration layer**，不是完整的 Agent runtime。

**Simple is better.**  
**没有中心化 server，没有任务编排器，也不打算把系统做成工作流迷宫。**

## 适合什么场景

- 长期在线 Agent 之间的异步消息交接
- 需要 Git 历史、审计和可回溯性的场景
- 已经有宿主唤醒路径的 assistant runtime
- 想用低依赖方案先把异步 mailbox 跑起来的系统

## AGM 不是什么

AGM **不**想做下面这些东西：

- 不是 IM 系统
- 不是低延迟消息总线
- 不是任务队列
- 不是工作流编排器
- 不是通用多 Agent runtime
- 也不是 obligation tracking、session management、上层 assistant protocol 的替代品

如果你需要强投递保证、中心化调度、复杂重试，或者大规模 fleet coordination，AGM 不是对的那一层。

## 为什么用 Git

AGM 选择 Git，不是为了“实时消息”，而是看中了这些特性：

- 可持久化、可审计的历史记录
- 简单的复制与备份模型
- 熟悉的托管与鉴权工作流
- append-mostly 的协作基础
- 在低基础设施前提下也能成立的异步交换底座

有得必有失，这里的 trade-off 很明确：

> Git 擅长 durability 和 traceability，不擅长 low-latency messaging。

## 核心模型

AGM 故意把核心模型压得很小：

- **一个 agent，一个 mailbox repo**
- **一条消息，一个 Markdown 文件**
- **frontmatter + body = transport payload**
- **daemon 负责发现新信并触发唤醒路径**

一个典型部署大致是这样：

1. 每个 agent 拥有一个 remote mailbox repo
2. 本地 runtime 维护这个 mailbox 的 local clone
3. send / reply 通过 Git 写入消息文件
4. daemon 在本地 mailbox 视图中发现新信
5. host-specific activator 唤醒长期在线 assistant runtime

### 架构总览

```text
sender/runtime
    |
    | 通过 AGM CLI 写入消息
    v
receiver mailbox repo (Git remote)
    |
    | 同步到本地 clone
    v
AGM daemon
    |
    | 发现新信
    v
activator / host integration
    |
    | 唤醒 assistant host
    v
long-running assistant agent
```

这里最重要的是边界：

- **mailbox transport** 负责消息持久化与同步
- **daemon / activator** 负责新信发现与唤醒
- **assistant runtime / skill layer** 负责 obligation、解释、工作流与具体动作

这三层是故意拆开的。

## 消息模型

一条消息就是一个 Markdown 文件。

- **文件名**是 canonical message id
- **frontmatter** 存协议字段和元数据
- **body** 存消息正文
- `reply_to` 引用另一条消息标识

AGM 的 transport primitive 很轻，但协议语义还是要说清楚。

README 层面至少有这些约束和预期：

- filename 在 AGM 1.0 中同时承担物理文件名和 canonical message id
- `reply_to`、dedupe、checkpoint correlation 都基于 filename
- `reply_to` 构成显式的消息关系
- mailbox 操作应尽量按 **idempotent** 的思路设计
- 并发写入仍可能产生 Git 级别冲突，需要 runtime / tooling 处理
- “seen”“obligation cleared”“action completed” 这类高层语义属于上层协议，不属于原始 transport primitive

## 交付语义

AGM 1.0 中，`send` / `reply` 不是单一的 success / fail 两态。

它们至少区分两层结果：

- **local success**：发送方本地副本创建成功
- **delivery success**：接收方 inbox 副本交付成功

这意味着 partial failure 是 AGM 1.0 的正式结果，而不是实现细节。

## Trade-offs 与 Non-goals

AGM 是一个有明确取舍的系统。它优先选择简单性和可审计性，而不是完整性。

### Trade-offs

- 延迟高于专用消息系统
- 一部分运维复杂度会转移到 Git repo 管理上
- 更适合小规模部署，不适合大规模 fleet
- 唤醒可靠性依赖具体 integration mode
- 顺序性受 Git sync 和协议处理影响，而不是由中心 broker 保证

### Non-goals

AGM 不打算内建以下能力：

- 所有 agent workflow 的中心化状态真相
- 队列调度或优先级派发
- 内建重试编排
- 全局顺序保证
- 大规模 mailbox fleet 管理
- 完整的 assistant behavior semantics

如果你的场景需要这些能力，要么叠在 AGM 上层，要么换 transport。

## 适用场景 / 不适用场景

### 适合

- 长期在线的助理型 Agent
- agent 与 agent、human 与 agent 之间的异步 handoff
- 更看重 auditability 而不是速度的小中规模系统
- 已经有 wakeup / activation path 的 OpenClaw-like assistant host

### 不适合

- 干完即走的短生命周期 coding agent
- 高吞吐的多 Agent 执行系统
- 强中心化编排的平台
- 需要严格 queue semantics 或低延迟投递的系统

## Quickstart

### 1. 安装 CLI

```bash
npm install -g @t0u9h/agent-git-mail
```

### 2. Bootstrap 一个 profile

```bash
agm --profile agent-a bootstrap \
  --self-id agent-a \
  --self-remote-repo-url https://github.com/USER/agent-a-mailbox.git
```

说明：

- `--profile` 是本地 runtime profile
- `--self-id` 是绑定到该 profile 的 agent identity
- 默认 self repo path：`~/.agm/profiles/<profile>/self`
- 本地 self repo path 默认从 profile 派生，除非显式 override
- `--self-local-repo-path` 仍保留为高级覆盖参数

如果你还想配置外部激活 open_id：

```bash
agm --profile agent-a bootstrap \
  --self-id agent-a \
  --self-remote-repo-url https://github.com/USER/agent-a-mailbox.git \
  --activation-open-id ou_xxx
```

### 3. 验证 profile

```bash
agm --profile agent-a config show
```

典型 profile 结构如下：

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

## 运行 daemon

```bash
agm --profile agent-a daemon run
```

在 macOS 上，也可以使用 launchd 托管：

```bash
agm --profile agent-a daemon start
agm --profile agent-a daemon status
```

检测到新邮件后，daemon 会触发配置好的 activator / host integration。

## Wakeup 模型

AGM 的 mailbox storage 和 agent wakeup 有关联，但它们不是同一层。

AGM 本身**不声称自己是实时通知系统**。它只是基于 mailbox discovery 提供一个可用的 wakeup integration path。

这意味着：

- 新信发现可以基于 polling，也可以基于宿主集成
- 投递延迟依赖 runtime 配置
- 唤醒是否成功依赖 host activator 路径
- assistant 侧依然需要 dedupe / idempotency 设计
- daemon 首次运行默认只建立 waterline，不补发历史 wakeup

如果你需要 broker 级别的通知保证，AGM 不是合适抽象。

## 验证 AGM 是否工作正常

建议按这条路径验证：

```bash
agm --profile agent-a config show
agm --profile agent-a doctor
agm --profile agent-a log
```

然后做一次端到端验证：

1. 从另一个 profile 发一封测试信
2. 确认 receiver mailbox 中出现该消息
3. 确认 daemon 检测到新消息
4. 确认 activator 发出唤醒动作
5. 确认接收侧 assistant host 能看到这次唤醒

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

AGM 已经完成 1.0 contract closure。

当前更适合把它理解为：

- 一个边界清楚的 Git-backed async mailbox transport
- 核心 contract、CLI 语义、daemon first-run、activation retry、doctor 诊断都已对齐并验证通过
- 后续工作主要是 1.1 级别的 failure classification 和 event taxonomy polish，而不是重新定义系统边界

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

- `packages/agm`：CLI、daemon、protocol、Git orchestration、activation、host integration
- `skills/agm-mail`：可选的 OpenClaw workflow skill，不是 AGM 的核心 transport 入口
- `docs/`：设计、集成、实现与收口文档

## License

MIT
