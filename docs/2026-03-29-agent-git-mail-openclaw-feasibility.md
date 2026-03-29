---
title: Agent Git Mail 在 OpenClaw 中的集成可行性分析
date: 2026-03-29
tags:
  - agent
  - git
  - mail
  - openclaw
  - feasibility
  - integration
status: draft
aliases:
  - AGM OpenClaw Feasibility
---

# Agent Git Mail 在 OpenClaw 中的集成可行性分析

## 结论

结论先说：

> **可行，而且不需要修改 OpenClaw core。**

从 OpenClaw 当前已经暴露的 plugin/runtime 能力看，`Agent Git Mail` 完全可以作为一个 **OpenClaw plugin + 后台 service** 落地。

推荐形态不是 skill，也不是依赖私有 `/internal/inject` 接口，而是：

- `agm`：独立 CLI，负责 git repo 上的信件读写与归档操作
- `openclaw-agent-git-mail` plugin：负责 daemon、checkpoint、session 绑定、system event 注入、heartbeat wake

一句话：

> **repo 协议放在 `agm`，后台感知与注入放在 OpenClaw plugin。**

这是当前最自然、最稳、最少侵入 OpenClaw 的实现方式。

---

## 1. 为什么这件事在 OpenClaw 里可做

OpenClaw 已经具备实现这套能力所需的关键原语。

### 1.1 plugin 可以注册后台 service

plugin API 支持 `registerService`，可以在 gateway/runtime 生命周期中启动和停止一个常驻后台服务。

这意味着：

- 可以在 OpenClaw 进程内挂一个 daemon
- 可以自己维护轮询定时器
- 可以在 service stop 时做资源清理

这正适合做 `agm daemon` 的 OpenClaw 集成层。

### 1.2 plugin runtime 可以向 session 注入 system event

runtime 暴露了：

- `enqueueSystemEvent(text, { sessionKey })`

这个能力非常关键。它说明 OpenClaw 本身已经支持：

> **往指定 session 注入可信的系统级事件，而不是伪造一条用户消息。**

对 `Agent Git Mail` 来说，这正是最合适的提醒通道。

### 1.3 plugin runtime 可以主动请求 heartbeat wake

runtime 还暴露了：

- `requestHeartbeatNow(sessionKey)`

这意味着 daemon 在发现新信后，不只是能排队一个 system event，还能主动推动对应 session 尽快进入下一轮处理。

因此完整链路可以是：

1. daemon 发现新信
2. enqueue system event
3. request heartbeat now
4. 主 session 在下一轮里读到提醒并处理

### 1.4 plugin 有 session lifecycle hooks

plugin hook 类型里已经包含：

- `session_start`
- `session_end`

这意味着 plugin 可以观察 OpenClaw session 的建立与结束，从而维护：

> **agent → 当前主 sessionKey**

没有这个能力，daemon 会不知道该把“你有新信”发给谁；有了这个能力，这个问题就是可解的。

### 1.5 plugin 可以补 CLI / HTTP / 诊断能力

plugin API 还允许：

- `registerCli`
- `registerHttpRoute`

这意味着后续如果要做：

- `openclaw agm status`
- `openclaw agm doctor`
- `/api/plugins/agm/status`

都可以放在 plugin 侧完成，而不需要碰 core。

---

## 2. 推荐架构

### 2.1 推荐分层

推荐把系统切成 4 层：

#### 第 1 层：repo 协议层
由 `Agent Git Mail` 自己定义：

- 一封信 = `frontmatter + markdown`
- 文件名是主标识
- `reply_to` 直接引用文件名
- `inbox/` / `outbox/` / `archive/`

这一层完全不依赖 OpenClaw。

#### 第 2 层：CLI 操作层
由独立 `agm` CLI 负责：

- send
- list
- read
- reply
- archive
- pull / status / doctor（如需）

这一层也不需要绑定 OpenClaw，只操作本地 repo。

#### 第 3 层：OpenClaw 集成层
由 `openclaw-agent-git-mail` plugin 负责：

- 启动 daemon
- 每 30 秒轮询一次
- 维护 checkpoint
- 找到新信后向 session 注入提醒
- 触发 heartbeat wake

#### 第 4 层：agent 决策层
由 OpenClaw 主 agent 自己负责：

- 是否读取该信
- 是否回复
- 是否归档
- 如何基于信件正文采取行动

这个边界非常重要。

> **plugin 不理解业务，agent 自己理解业务。**

否则感知层很快又会长成调度层和治理层。

---

## 3. 为什么不推荐 skill 作为主接入层

### 3.1 skill 的天然定位不对

skill 适合的是：

- 在 agent turn 内指导怎么做
- 提供命令使用规范
- 引导一次性的读写操作

但 `Agent Git Mail` 的核心需求之一是：

> **后台持续感知新信。**

而 skill 本身不是常驻运行时，不适合承担 daemon 角色。

### 3.2 如果强行走 skill，会退化成 heartbeat 编排系统

如果把 mailbox 感知做成：

- heartbeat 定时跑
- agent 在 prompt 里自己扫描 repo
- skill 再指导 agent 如何处理

就会带来几个问题：

- 轮询逻辑进入 prompt，成本高
- repo 检查变成每轮 agent 推理的一部分
- 新信提醒粒度粗
- session 绑定不稳定
- 容易继续长出 `HEARTBEAT.md` 编排耦合

所以：

> **skill 可以作为 repo 操作说明层，但不应该成为正式 daemon 接入层。**

---

## 4. 为什么不推荐依赖私有 `/internal/inject`

### 4.1 短期能用，不代表长期稳

如果外部 daemon 直接去调用 OpenClaw / HappyClaw 的私有 inject 接口，短期大概率能跑通。

但这个路径的问题是：

- 升级兼容性脆
- 依赖内部接口约定
- 容易和 session/thread 实现细节耦合
- 不适合作为正式产品边界

### 4.2 OpenClaw 已经给了更稳的公开能力

既然 plugin runtime 已经有：

- `enqueueSystemEvent(...)`
- `requestHeartbeatNow(...)`

那就没必要绕回去找更底层、更脆的私有注入口。

工程上应该优先走：

> **公开 runtime 原语 > 私有内部 HTTP 注入口**

---

## 5. 推荐的 daemon 工作方式

### 5.1 每个 agent 一个 daemon

这和 v0 总体设计保持一致：

- 一个 agent 对应一个 repo
- 一个 agent 对应一个 daemon

在 OpenClaw 集成里，具体可以做成两种实现：

#### 方案 A：一个 plugin service 管多个 agent watcher
- 一个 service 进程内维护多个 watcher
- 每个 watcher 负责一个 agent repo

#### 方案 B：一个 plugin service 只管当前 agent
- 如果以后 plugin 做成 agent-scoped，也可以一 agent 一 service

在当前 OpenClaw 里，更现实的实现一般是 **方案 A**：

> 一个 plugin service，内部维护多个 watcher。

这对运行时更友好。

### 5.2 固定 30 秒轮询

daemon 轮询周期应保持和前面方案一致：

> **固定 30 秒。**

理由不变：

- 这是 mailbox，不是实时 IM
- 延迟可接受
- 对 git pull / 文件扫描开销可控
- 实现与排障简单

### 5.3 daemon 只做三件事

plugin daemon 应严格只做：

1. 检查 repo 是否有新收件
2. 根据 checkpoint 去重
3. 向对应 session 发轻量提醒

不做：

- 读正文并摘要
- 自动判优先级
- 自动推导 obligation
- 自动归档
- 自动回复

这是必须守住的边界。

---

## 6. session 绑定问题：这是核心，但可解

真正的工程难点不是“怎么轮询 repo”，而是：

> **发现新信后，应该注入到哪个 OpenClaw session？**

### 6.1 推荐策略：只绑定主 session

建议正式规定：

> **AGM daemon 默认只注入 agent 的 main/direct session，不注入 subagent / ACP / cron / 临时 thread session。**

因为同一个 agent 在 OpenClaw 里可能同时有：

- direct session
- thread session
- subagent session
- cron isolated session
- ACP 子会话

如果不收死规则，后面一定发生这些问题：

- 注错 session
- 同一封信多处提醒
- 临时会话莫名收到新信
- thread 上下文被 mailbox 噪音污染

### 6.2 绑定方式

plugin 可以监听：

- `session_start`
- `session_end`

并维护本地映射，例如：

```json
{
  "mt": {
    "sessionKey": "agent:main:feishu:direct:ou_xxx",
    "sessionId": "...",
    "updatedAt": 1774720000,
    "kind": "direct-main"
  }
}
```

daemon 发现新信时，只对这个映射里的 sessionKey 执行：

- enqueue system event
- request heartbeat now

### 6.3 为什么这是可行但要谨慎

OpenClaw hook 已经能给到：

- `sessionId`
- `sessionKey`
- `agentId`

这说明**维护映射在技术上没问题**。

真正要谨慎的是：

- 哪些 session 算主 session
- 恢复/重启后如何清理陈旧绑定
- 多 session 竞争时谁胜出

因此这部分必须有明确策略，而不能“看到一个 session_start 就记下来”。

---

## 7. 注入模型建议

### 7.1 只注入最小字段

daemon 默认只注入：

- `from`
- `filename`

例如：

```text
New agent git mail:
- from: hex
- filename: 2026-03-29T04-11-02-hex-to-mt.md
```

这和 v0 拍板保持一致。

### 7.2 为什么不要把注入做富

注入层一旦开始附带：

- subject
- 正文摘要
- priority
- thread summary
- expects_reply 推理

它就会逐渐长成第二套协议层。

而第二套协议层一定带来：

- 数据漂移
- 额外同步成本
- 源文件与注入内容不一致
- debug 成本上升

所以这里必须坚持：

> **注入只是提醒，不是阅读视图。**

真正阅读入口仍然是 repo 文件本身。

### 7.3 system event 比“伪造一条消息”更对

如果伪造成用户消息，会有几个坏处：

- 会污染聊天上下文
- 信任边界不清晰
- 容易被误当成外部输入
- 历史记录可读性差

system event 则更符合语义：

- 这是运行时内部事件
- 不是用户发来的消息
- agent 可以把它当成提醒而不是会话正文

因此：

> **system event 是正确注入通道。**

---

## 8. checkpoint 应怎么放

### 8.1 checkpoint 不应进入 repo

checkpoint 是 daemon 的运行时状态，不是邮箱协议本身。

因此不应写进 repo，不应提交到 git。

否则会带来：

- 污染邮箱历史
- 破坏“提交只覆盖目标文件”的纪律
- 让运行时状态冒充协议状态

### 8.2 checkpoint 应放在 plugin state dir

OpenClaw plugin service 有自己的 `stateDir`。

这正适合保存类似：

```json
{
  "mt": {
    "lastSeen": [
      "2026-03-29T04-11-02-hex-to-mt.md",
      "2026-03-29T04-35-17-hex-to-mt.md"
    ],
    "updatedAt": 1774720500
  }
}
```

这里推荐按 agent 分开存。

### 8.3 checkpoint 的职责

只承担：

- 去重
- restart 后恢复边界
- 防止重复注入

不承担：

- inbox 真相
- thread 真相
- 已处理状态真相

---

## 9. OpenClaw 内部最合适的处理链路

### 9.1 推荐处理流

完整推荐链路如下：

1. plugin service 启动
2. watcher 每 30 秒检查一次 repo
3. pull / scan inbox
4. 根据 checkpoint 找到新信
5. 查 agent -> main sessionKey 映射
6. `enqueueSystemEvent(...)`
7. `requestHeartbeatNow(...)`
8. agent 在下一轮里收到提醒
9. agent 通过 `agm` 读取、回复或归档

### 9.2 这条链路的优点

- 不改 OpenClaw core
- 不引入 server
- 不依赖私有注入口
- repo 协议和运行时感知分层清楚
- 跟 OpenClaw heartbeat/wake 模型天然一致

这条链路在工程上是顺的。

---

## 10. 风险分析

## 10.1 风险一：session 选错

这是最大风险。

同一个 agent 在 OpenClaw 里可能有多个 session，如果没有严格的主 session 绑定策略，就会出现：

- 注入发到 thread session
- 注入发到 cron isolated session
- 一个新信被多个 session 同时收到

**缓解建议：**

- 强制 `main-only`
- 配置中显式声明目标 session 策略
- 只有 direct/main session 可注册为 mailbox sink

## 10.2 风险二：重复注入

如果 pull/scan/checkpoint 逻辑不稳，重启后很可能重复提醒。

**缓解建议：**

- checkpoint 持久化到 plugin stateDir
- 以文件名为主键去重
- 如有必要，再叠加最近提交哈希或 mtime

## 10.3 风险三：heartbeat / wake 调度延迟

OpenClaw 有自己的运行时节流和 in-flight 保护，所以 `requestHeartbeatNow` 并不保证“瞬时执行”。

但对 mailbox 语义来说，这不是致命问题。

因为系统本来就接受：

- pull-based
- 30 秒量级延迟
- 非实时交付

## 10.4 风险四：repo 脏树与 git 精确提交

你已经拍板：

- 不要求 clean tree
- 但提交必须只包含目标文件

这要求 CLI 和 daemon 都不能把运行时状态写回 repo。

**缓解建议：**

- checkpoint 只进 plugin stateDir
- 所有 runtime 文件都不进 repo
- git add/commit 严格只点名目标文件

## 10.5 风险五：OpenClaw 升级导致 plugin 行为变化

虽然这套方案已经尽量依赖公开 API，但 plugin hook/runtime 行为仍可能随 OpenClaw 版本演化。

**缓解建议：**

- 只依赖公开 plugin/runtime 能力
- 避免使用私有 HTTP inject
- 保持集成层薄，避免把大量协议逻辑塞进 plugin

---

## 11. 非目标：不要再把它做回“上一代 mailbox”

集成 OpenClaw 时，最容易犯的错是：

> 因为 runtime 能力足够丰富，于是又忍不住把 obligation、priority、thread governance、自动 decision envelope 都塞回来。

这条路不该再走。

这轮的正确收口是：

- OpenClaw 只提供运行时接入能力
- `Agent Git Mail` 只提供异步留信能力
- agent 自己负责决策

也就是说：

> **OpenClaw 是宿主，不是 mailbox 领域模型本身。**

这个边界必须守住。

---

## 12. 我的最终判断

### 12.1 可行性判断

- **能做吗？** 能
- **要改 core 吗？** 不需要
- **推荐放 skill 吗？** 不推荐
- **推荐用 plugin 吗？** 推荐
- **推荐直接打私有 inject 吗？** 不推荐

### 12.2 推荐实现路线

正式推荐路线如下：

1. 保持 `agm` 为独立 CLI，负责 repo 操作
2. 做一个 `openclaw-agent-git-mail` plugin
3. plugin 注册后台 service，固定 30 秒轮询
4. plugin 用 session hooks 维护 main session 绑定
5. plugin 用 `enqueueSystemEvent + requestHeartbeatNow` 做提醒
6. agent 在收到提醒后，再调用 `agm` 处理信件

### 12.3 为什么这是最好的边界

因为这条路满足了四个工程目标：

- **简单**：没有重做 server
- **稳**：依赖公开 plugin/runtime 能力
- **清晰**：repo 协议、daemon、agent 决策各司其职
- **可演化**：以后可以逐步加诊断、状态、adapter，而不会一上来变成重系统

---

## 13. 下一步建议

如果继续推进，建议下一份文档直接写成：

1. **OpenClaw plugin 结构草图**
   - service
   - hooks
   - stateDir
   - config schema

2. **session 绑定策略设计**
   - 什么叫 main session
   - 如何过滤 subagent / ACP / cron
   - session 切换时如何更新绑定

3. **daemon → agent 注入协议**
   - 注入文本格式
   - 幂等规则
   - wake 策略

4. **`agm` 与 plugin 的职责边界**
   - 哪些命令在 CLI
   - 哪些状态在 plugin
   - 哪些内容永远不进 repo

---

## 附：本次判断依赖的 OpenClaw 能力点

本次可行性分析依赖的关键 OpenClaw 能力包括：

- plugin `registerService`
- plugin `registerCli`
- plugin `registerHttpRoute`
- plugin `session_start/session_end` hooks
- runtime `enqueueSystemEvent`
- runtime `requestHeartbeatNow`
- plugin service `stateDir`

这些能力已经足以支撑 `Agent Git Mail` 的 v0 集成方案。

---

## 相关文档

- [[2026-03-29-agent-git-mail-one-pager]]
- [[2026-03-29-agent-git-mail-v0-formal-design]]
