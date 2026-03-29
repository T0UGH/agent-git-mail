---
title: Agent Git Mail v0 正式设计文档
date: 2026-03-29
tags:
  - agent
  - git
  - mail
  - architecture
  - design
status: draft
aliases:
  - AGM v0 Design
---

# Agent Git Mail v0 正式设计文档

## 设计结论

这轮 brainstorm 已收口，v0 按下面这组约束实现，不再继续发散：

- 单 CLI：`agm`
- `agm daemon` 作为子命令
- 每个 agent 一个 daemon
- 每个 agent 一个 git repo
- 信件格式：`frontmatter + markdown`
- 文件名就是主标识
- `reply_to` 直接引用文件名
- repo 路径显式配置
- CLI 只操作已有本地 repo
- 不要求 clean tree，但提交时只精确覆盖目标文件
- `archive` 动作必须 push
- daemon 固定每 30 秒轮询一次
- daemon 维护本地 checkpoint
- daemon 默认只注入：`from`、`filename`

这份文档的目标不是继续探索，而是把 v0 的边界、约束和实现方向写死，方便后续进入命令设计和 adapter 落地。

---

## 1. 背景与目标

这套系统的目标，不是做一个“完整异步协作平台”，而是做一个：

> 足够轻、足够稳、足够容易部署的 agent 异步邮箱系统。

核心判断：这个场景更接近 **agent mailbox**，不是实时 IM，也不是复杂 workflow engine。

因此 v0 明确接受：

- **非实时**
- **pull-based 感知**
- **append-only 信件模型**
- **git 作为同步与审计底座**

30 秒延迟在这个问题里是可接受的，换来的是更低系统复杂度和更高可维护性。

---

## 2. 非目标

v0 明确不做这些事：

- 不做中心 server
- 不做实时推送系统
- 不做 obligation / urgency / decision envelope
- 不做复杂状态机（delivered / seen / replied / escalated）
- 不做 repo 自动创建
- 不做工作树 clean 检查强约束
- 不做大而全权限治理
- 不做“收件即自动理解并调度”的重代理层

一句话：

> v0 只解决“agent 之间如何可靠地留信、收信、回信”。

---

## 3. 核心对象模型

### 3.1 Repo 是邮箱

每个 agent 对应一个 git repo。

这个 repo 就是它的邮箱，不再抽象出更高一层的 mailbox server 真相源。

### 3.2 信件是唯一核心对象

每封信是一个 Markdown 文件，由两部分组成：

- YAML frontmatter
- Markdown 正文

示例：

```markdown
---
from: mt
to: hex
subject: 关于 adapter 边界的判断
created_at: 2026-03-29T04:00:00+08:00
reply_to: 2026-03-29T03-40-12-mt-to-hex.md
---

这里是正文。
```

### 3.3 文件名是主标识

v0 不单独引入 message id 字段作为协议主键。

主标识直接使用：

> **文件名**

因此：

- 引用一封信，用文件名
- 建 thread，用文件名
- checkpoint 去重，用文件名
- 注入提示里也带文件名

这样做的理由很直接：

- 少一层 id 映射
- 对人和 agent 都可读
- 与 git 文件操作天然一致

### 3.4 `reply_to` 直接引用文件名

回复是一封新信，不回写旧信。

`reply_to` 字段直接填写目标文件名，例如：

```yaml
reply_to: 2026-03-29T03-40-12-mt-to-hex.md
```

这保持了模型简单和 append-only。

---

## 4. 目录结构

每个 agent repo 的 v0 最小目录结构：

```text
inbox/
outbox/
archive/
```

含义：

- `inbox/`：收到但尚未归档的信
- `outbox/`：本 agent 发出的信
- `archive/`：已处理后归档的信

v0 不增加这些目录：

- `events/`
- `receipts/`
- `state/`
- `obligations/`
- `checkpoints/`（repo 内）
- `queue/`

原因：这些目录都容易把系统重新带回“重治理系统”。

---

## 5. CLI 形态

### 5.1 单 CLI

统一使用：

```bash
agm
```

而不是拆多个二进制或多个工具名。

### 5.2 daemon 是子命令

后台轮询进程使用：

```bash
agm daemon
```

核心判断：daemon 不是独立产品，而是同一套系统的一个运行模式。

把它保留在同一个 CLI 下面，能让认知边界更清楚：

- 一个工具
- 两类能力：命令操作 + 后台感知

---

## 6. Repo 配置原则

### 6.1 repo 路径显式配置

每个 agent 的 repo 路径必须显式配置。

不做：

- 自动猜路径
- 根据 agent 名隐式推导固定目录
- 后台偷偷 clone

### 6.2 CLI 只操作已有本地 repo

`agm` 的职责是操作已经存在的本地 repo。

不负责：

- 创建远端仓库
- clone 仓库
- 初始化组织结构
- 修复缺失权限

理由：

- 把环境管理问题与信件协议问题分开
- 降低 CLI 的副作用和部署复杂度
- 保持工具边界清晰

---

## 7. 写入与提交模型

### 7.1 不要求 clean tree

v0 不要求目标 repo 是 clean tree。

原因：

- 现实里 agent 的 repo 可能同时被其他流程更新
- 把 clean tree 作为硬门槛，会把工具变得难用

### 7.2 但提交必须精确到目标文件

虽然不要求 clean tree，但 CLI 的 git 操作必须：

> **只提交本次目标文件，不顺手把别的脏改动一起带上。**

也就是说，提交粒度必须精确控制到文件级。

这是一个非常关键的工程纪律。

否则系统会很快出现：

- 无关文件被误提交
- daemon/checkpoint 文件污染 repo 历史
- 多 agent 并行操作互相踩脏改动

### 7.3 `archive` 必须 push

归档不是纯本地整理动作。

只要执行 `archive`，就必须完成对应的 push，让远端状态同步。

理由：

- `archive` 是共享可见状态的一部分
- 如果只本地 archive，不 push，会导致其他观察者仍看到旧 inbox 状态

因此：

> `archive` 是一个带同步语义的动作。

---

## 8. daemon 模型

### 8.1 每个 agent 一个 daemon

v0 采用：

> **每个 agent 一个 daemon**

而不是一个全局 daemon 管所有 agent。

好处：

- 故障域清晰
- checkpoint 独立
- 注入目标清晰
- 运维模型简单

### 8.2 轮询周期固定为 30 秒

daemon 固定每 30 秒轮询一次。

这是本轮 brainstorm 的明确拍板，不再继续讨论 5 秒 / 10 秒 / 动态 backoff / 准实时推送。

原因：

- 场景是 agent mailbox，不是实时系统
- 30 秒足够低延迟
- 对 git pull / 文件扫描 / 注入链路来说压力可控
- 实现和排障都更简单

### 8.3 daemon 负责什么

daemon 只负责：

1. 周期性检查 repo 变化
2. 发现新的收件文件
3. 基于 checkpoint 去重
4. 向对应 agent 注入一个轻量提示

daemon 不负责：

- 解析正文语义
- 做优先级判断
- 自动归档
- 自动回复
- 维护 obligation

一句话：

> daemon 是“新信探测器”，不是“邮件调度大脑”。

---

## 9. checkpoint 模型

### 9.1 git 水位是 daemon 本地状态

daemon 必须维护自己的本地运行态水位。

v0 明确采用：

> **本地 git ref 作为水位方案**，例如 `refs/agm/last-seen`

这个 git ref 不写回 repo 协议层，不作为共享真相。

### 9.2 git 水位的作用

主要用于：

- 去重
- 避免重复注入
- 记录上次已经观察过的新信边界

### 9.3 为什么 git 水位不进入协议层

因为一旦把这类运行态信息提升为 repo 协议的一部分：

- 会污染邮箱历史
- 会和“只提交目标信件文件”的纪律冲突
- 会把运行时状态误提升为协议状态

结论：

> git 水位属于 daemon 运行时，不属于邮箱协议。

---

## 10. 注入模型

### 10.1 默认只注入最小字段

daemon 默认只向 agent 注入：

- `from`
- `filename`

不默认注入：

- subject
- 正文摘要
- urgency
- thread 状态
- expects_reply
- 其他推理结果

### 10.2 为什么只注入这两个字段

因为注入层的目标只是：

> 告诉 agent “有新信，去看文件”。

不是把注入消息本身做成一套新的富协议。

只保留 `from + filename` 有几个好处：

- 低噪音
- 易稳定
- 避免注入消息和源文件语义漂移
- 保持 agent 的读取入口始终指向 repo 真相

---

## 11. 处理与归档语义

### 11.1 处理顺序

默认按 daemon 发现并注入的新信顺序处理。

v0 不额外定义 urgency / score / SLA。

### 11.2 已处理的体现

处理完成后，可将信件从 `inbox/` 移到 `archive/`。

这表示：

- inbox 是待处理视图
- archive 是已处理视图

但 archive 只是整理语义，不扩展成复杂协议状态。

### 11.3 回复不等于归档

回复是一封新信。

是否 archive 原信，是另一个动作，不自动绑定成状态机。

这样可以避免协议里长出：

- replied-but-not-done
- waiting-followup
- acknowledged
- 等等等等

---

## 12. 设计取舍

### 12.1 为什么不是实时系统

因为这类 agent 协作，本质上更像异步工作邮件，不是在线聊天。

实时化会立刻引入：

- 常驻连接
- server push
- delivery state
- reconnect / ordering / duplicate 处理

这会让系统复杂度暴涨，而收益有限。

### 12.2 为什么接受 git 作为底座

git 天然提供：

- 持久化
- 版本历史
- diff
- 分布式同步
- 可审计性

对“留信”这种 append-only 场景，git 的形态是顺手的。

### 12.3 为什么坚持最小注入

工程上一个常见坑是：

> 本来只是提醒层，后来偷偷长成第二套协议层。

只注入 `from + filename`，就是为了把这个坑提前堵死。

---

## 13. v0 成功标准

v0 是否成立，看这几条：

1. agent 能稳定发信到目标 repo
2. 收件方 daemon 能在 30 秒量级内感知新信
3. agent 能用文件名稳定建立 reply thread
4. archive 动作能正确同步远端
5. 整套系统不依赖中心 server 仍然可用
6. 实现复杂度明显低于上一代 mailbox

只要这几条成立，v0 就是成功的。

---

## 14. Monorepo 仓库结构决策

v0 仓库结构正式收口为：

> **monorepo，但只保留两个 package：`agm` 与 `openclaw-plugin`。**

不额外引入 `shared` / `core` / `protocol` 包。

原因：

- 当前阶段 `agm` 与 OpenClaw plugin 会一起演化，monorepo 更利于快速推进
- 但两者职责边界清楚，不需要为了“也许未来会复用”提前抽共享层
- 当前判断重复代码很少：`agm` 是 CLI/daemon 本体，plugin 是 OpenClaw 宿主适配层
- 过早引入 `shared` 很容易变成杂物层和过早抽象

### 14.1 目录结构定稿

```text
agent-git-mail/
├─ docs/
├─ packages/
│  ├─ agm/
│  └─ openclaw-plugin/
├─ test/
└─ scripts/
```

### 14.2 职责边界

#### `packages/agm`
负责：

- CLI
- config
- send / reply / read / list / archive
- daemon
- git CLI 封装
- frontmatter / filename / repo 规则

#### `packages/openclaw-plugin`
负责：

- session 绑定
- system event 注入
- heartbeat wake
- 调用 `agm` 或依赖 `agm` 暴露出的少量能力

### 14.3 依赖方向

必须保持：

- `openclaw-plugin` **可以依赖** `agm`
- `agm` **不能依赖** `openclaw-plugin`

也就是说：

> `agm` 是本体，plugin 是宿主适配层；不能让本体知道 OpenClaw 的存在。

### 14.4 为什么现在不做 `shared`

当前不引入 `shared` 的原因不是“永远不需要”，而是：

- 当前重复代码预期很少
- 现在抽共享层大概率属于想象复用，不是事实复用
- 先按真实依赖建模，比按未来幻想建模更稳

如果后续真的出现稳定、纯协议级、无宿主污染的共享逻辑，再按事实抽成独立包也不晚。

---

## 15. 下一步

这份正式设计文档之后，下一层应该进入：

1. **implementation plan**：按 monorepo + 双 package 结构拆实现顺序
2. **命令清单设计**：`agm config / send / reply / read / list / archive / daemon`
3. **OpenClaw plugin adapter 草图**：daemon 如何把 `from + filename` 注入到 OpenClaw runtime
4. **config schema 与 git 水位方案细化**：repo 路径显式配置 + git ref 水位

当前不建议再回到“要不要 server / 要不要 obligation / 要不要实时推送 / 要不要 shared 包”这类已经拍板过的话题。

这轮该进入实现设计，而不是继续概念发散。

---

## 相关文档

- [[2026-03-29-agent-git-mail-one-pager]]
