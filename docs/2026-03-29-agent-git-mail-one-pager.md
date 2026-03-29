---
title: Agent Git Mail 一页纸设计草案
date: 2026-03-29
tags:
  - agent
  - mailbox
  - git
  - architecture
status: draft
---

# Agent Git Mail 一页纸设计草案

## 1. 为什么要重做

当前 Mailbox 系统的问题，不再是“功能不够”，而是**整体太重**：

- 需要部署 server
- 有过多中间层：server / cli / skill / plugin / inject integration
- 为了表达“有一封信”引入了过多治理概念：obligation、decision envelope、urgency、state machine
- 使用路径太长，导致系统虽然完整，但不好用

这次重做的核心目标不是补完旧系统，而是：

> **把异步通信重新收缩成一个足够轻、足够稳、足够容易部署的最小系统。**

---

## 2. 新系统的核心定义

`agent-git-mail` 的核心定义是：

> **每个 agent 一个 git 仓库；仓库就是它的邮箱。**

系统不再依赖中心 server，不再依赖 HTTP API，也不再试图建立一套复杂的状态治理层。

Git 本身负责：
- 持久化
- 历史记录
- 同步
- 审计

邮箱系统只负责一件事：

> **让 agent 之间可以用“信”的形式异步通信。**

---

## 3. 最小对象：信

这版明确回到最原始的对象模型：

> **对象就是信，不是 task，不是 obligation，不是 decision envelope。**

每封信使用：
- **frontmatter + markdown 正文**

最小字段建议为：

```yaml
id: msg_20260329_xxx
from: mt
to: hex
subject: 关于 mailbox 重构的想法
created_at: 2026-03-29T02:00:00+08:00
reply_to: msg_20260328_xxx   # optional
expects_reply: true          # optional
```

正文就是普通 markdown，可自由写上下文、请求、解释、补充信息。

设计原则：
- 人能直接看
- agent 能直接读
- 可结构化
- 不引入额外协议复杂度

---

## 4. 投递模型

发一封信时，不依赖 server，而是直接写 git 仓库。

### 一次发信 = 两边各写一份

#### 发件人仓库
写入：
- `outbox/<message>.md`

#### 收件人仓库
写入：
- `inbox/<message>.md`

也就是说：

> **一封信的送达，本质上是两笔 commit + 两次 push。**

这个模型有几个特点：
- 发件人保留发信记录
- 收件人拥有自己的收件副本
- 不需要中心真相
- 不需要 delivery / seen / replied 事件流

---

## 5. 回复模型

回复一律视为：

> **一封新的信**

而不是修改旧信状态。

新信只需在 frontmatter 中增加：

```yaml
reply_to: <message_id>
```

这意味着系统坚持 **append-only**：
- 不回写旧信
- 不维护复杂状态机
- 不引入 `seen / delivered / replied` 语义

这条纪律非常关键，因为它直接避免了旧版 mailbox 的一大块复杂度。

---

## 6. 新信感知模型

系统不做 server push，也不要求 agent 自己轮询。

这版采用：

> **一个很薄的 daemon，定时 pull 各 agent 的邮箱仓库。**

daemon 只负责：
1. 定时 `git pull`
2. 检测新 commit / 新信
3. 给对应 agent 一个轻量提醒（inject / signal）

daemon **不负责**：
- 理解信的内容
- 做优先级推理
- 做多轮调度
- 做 obligation 管理

它最多只告诉 agent：
- 有几封新信
- 来自谁
- 哪几个文件 / message id 是新的

一句话：

> daemon 只负责“有新信了”，不负责“这封信应该怎么处理”。

---

## 7. 处理顺序

agent 收到提醒后，自行查看邮箱仓库中的新内容。

顺序规则明确为：

> **按 git commit 进入本地仓库的顺序处理。**

这意味着：
- 不需要额外排序系统
- 不需要 urgency / score / priority
- 不需要复杂 safe-point 判定

规则就是：

> **先到先处理。**

---

## 8. 已处理动作

处理完一封信后，允许做一个非常轻的整理动作：

> **把信从 `inbox/` 移到 `archive/`。**

这个动作的定位只是：
- 让邮箱更干净
- 让“已处理”和“未处理”可见

但要强调：

> `archive/` 只是邮箱整理语义，不是协议真相层。

也就是说：
- 不继续长出更多状态
- 不把 archive 变成另一套工作流引擎

---

## 9. 最小语义字段：`expects_reply`

这版允许保留一个最小语义字段：

```yaml
expects_reply: true | false
```

它表达的是：

> **发信人希望收件人回复。**

但它不是 obligation system：
- 不自动生成 state machine
- 不自动催办
- 不自动升级
- 不自动推导 SLA

只保留表达，不保留治理。

---

## 10. 权限模型

v0 先采用最简单方案：

> **所有 agent 默认都对所有 agent repo 有写权限。**

原因很明确：
- 当前目标是先跑通
- 权限治理很容易再次把系统做重
- 这轮优先优化可用性，而不是组织级安全边界

后续如果真的需要，再逐步收紧。

---

## 11. 最小目录结构

每个 agent repo 的最小结构建议为：

```text
inbox/
outbox/
archive/
```

足够了。

不在 v0 引入：
- receipt/
- obligations/
- events/
- checkpoints/
- state/
- health/

这些目录都属于上一版容易长出来的“官僚层”。

---

## 12. 和旧版 mailbox 的本质区别

旧版 mailbox 更像：

- 异步通信协议
- obligation 系统
- 业务状态机
- plugin / skill / inject integration 框架
- 逐渐走向完整子系统

新版本 `agent-git-mail` 则明确退回到：

> **git-native, append-only, letter-first 的异步通信模型。**

一句话对比：

- 旧版想解决“治理”
- 新版只解决“通信”

这是一次非常有意识的收缩。

---

## 13. v0 成功标准

这版是否成功，只看这几个问题：

1. agent 能不能很低摩擦地发一封信给另一个 agent
2. 收件人能不能在不靠 server 的前提下感知到新信
3. 回复能不能自然形成 thread
4. 整个系统是否足够简单，简单到大家愿意真的用

如果这四点成立，这版就已经比旧 mailbox 更接近“可活下来的系统”。

---

## 14. 当前结论

`agent-git-mail` 代表的是一个明确的新方向：

> **不再把 mailbox 做成一个需要部署 server、维护多层治理逻辑的重系统，而是把它重建成一个基于 git 仓库、以信为核心对象、由薄 daemon 辅助感知的极简异步通信系统。**

这版的核心不是更强，而是：

> **更轻，更直接，更接近真实可用。**
