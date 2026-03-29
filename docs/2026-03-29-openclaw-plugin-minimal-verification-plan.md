---
title: OpenClaw Plugin 最小可行验证方案
date: 2026-03-29
tags:
  - agent
  - openclaw
  - plugin
  - verification
status: draft
---

# OpenClaw Plugin 最小可行验证方案

## 目标

本轮不是验证 `Agent Git Mail` 的全部 OpenClaw 集成能力，而是验证一个最小闭环：

> **当 repo 中出现一封新信时，OpenClaw plugin 能否把它转成目标 session 的可见提醒。**

这轮验证明确采取 **半人工路径**，故意绕过自动 session binding，优先降低变量数量。

---

## 为什么采用半人工验证

如果直接验证完整链路：

- plugin load
- daemon service 启动
- 自动 session binding
- 新信检测
- system event 注入
- heartbeat wake
- session 侧可见

变量太多，不利于定位问题。

因此本轮先收缩成：

> **先证明“能打进去”，再证明“能自动找到该打给谁”。**

也就是：

- 先手工指定一个目标 sessionKey
- 再让 plugin 在发现新信时，尝试对这个已知 session 做 inject / wake

---

## 验证范围

### 本轮要验证

1. plugin 能被 OpenClaw 正常加载
2. plugin service 能正常启动
3. plugin 能检测到 repo 中的新信事件
4. plugin 能把一条新信事件送到一个**已知 sessionKey**
5. 目标 session 能看见这条提醒

### 本轮明确不验证

1. 自动 session binding 是否正确
2. 多 session 竞争与过滤策略
3. 完整长期 daemon 稳定性
4. 复杂错误恢复逻辑
5. 完整 Happy path 之外的所有边缘场景

---

## 通过标准

本轮通过，至少需要同时满足以下 3 类证据：

### 证据 A：plugin/load 证据
- OpenClaw 启动后，日志中能看到 plugin 被加载
- 日志中能看到 plugin service 启动

### 证据 B：新信检测证据
- 在 repo 里制造一封新信后，plugin/watcher 日志明确记录检测到了新文件
- 最好能记录：`from`、`filename`

### 证据 C：session 可见证据
- 目标 session 收到可见提醒（system event / wake 后能在会话里看到）
- 或至少有 OpenClaw 侧日志可明确证明 inject 成功并进入目标 session

没有 C，则本轮不算通过。

---

## 验证对象

### 被验证组件
- `packages/openclaw-plugin`

### 前置条件
- `packages/agm` 的基础 CLI/daemon 逻辑已通过本地测试
- 已有一个本地可运行的 OpenClaw 环境
- 已知一个可用的目标 sessionKey

---

## 验证步骤

## Step 1：拿到一个已知 sessionKey

目标：先拿到一个可用的、当前活跃的 OpenClaw sessionKey。

建议来源：
- `openclaw status`
- 现有 direct session
- 当前 MT/主会话对应的 sessionKey

要求：
- 这个 sessionKey 是可确认存在的
- 最好是当前能直接观察到输出的主会话

输出：
- 记录本轮验证使用的 `sessionKey`

---

## Step 2：临时绕过自动 session binding

目标：减少变量，先不验证 `session_start/session_end` 自动绑定。

建议做法：
- 在 plugin 里提供一个**仅用于验证**的临时入口
- 例如通过配置或临时常量，直接指定：

```ts
forcedSessionKey = "<known-session-key>"
```

然后在新信事件触发时：
- 如果 `forcedSessionKey` 存在，则直接对它 inject / wake
- 不走自动 binding 查表

要求：
- 这条逻辑必须明确标注为“verification-only / 临时验证入口”
- 后续不应默认保留为正式方案主路径

输出：
- 记录 forced sessionKey 的接法

---

## Step 3：验证 plugin load / service start

目标：证明 plugin 真正在 OpenClaw 宿主内启动。

执行：
1. 启动 OpenClaw 或重启使 plugin 生效
2. 查看 OpenClaw 日志

期望：
- plugin load 成功
- service 启动成功
- 没有 import error / runtime shape mismatch / hook registration error

需要保留的证据：
- 启动日志片段

若这一步失败：
- 不进入后续验证
- 先修 plugin 宿主接入问题

---

## Step 4：手工制造一封新信

目标：制造一个最小的新信事件。

要求：
- 该信必须符合 v0 协议
- 文件放入目标 repo 的 `inbox/`
- 通过 git commit 进入历史，使 watcher 可以通过 `A inbox/*.md` 看到它

建议最小样例：

```md
---
from: hex
to: mt
subject: verification ping
created_at: 2026-03-29T15:30:00+08:00
expects_reply: false
---

verification body
```

然后：
1. 写入 `inbox/<filename>.md`
2. `git add -- <file>`
3. `git commit -m "agm: verification mail"`

输出：
- commit SHA
- 文件名

---

## Step 5：观察 watcher / plugin 日志

目标：确认 plugin 真检测到了这封新信。

期望至少出现以下信息中的一部分：
- 检测到 `A inbox/*.md`
- 提取到 `filename`
- 提取到 `from`
- 即将对目标 session inject

没有这一步证据，则说明问题可能在：
- git 水位
- diff 逻辑
- repo 选择
- daemon/service 未真正运行

输出：
- 日志片段

---

## Step 6：观察目标 session 是否收到提醒

目标：这是本轮最核心的一步。

期望：
- 目标 session 出现一条可见提醒
- 内容至少包含：
  - `from`
  - `filename`

示例：

```text
New agent git mail: from=hex, file=2026-03-29T15-30-00-hex-to-mt.md
```

如果插件日志说 inject 了，但 session 里没有任何可见结果：
- 本轮仍然不能判定通过
- 需要进一步区分：
  - inject 是否成功但未显示
  - wake 是否没触发
  - sessionKey 是否无效

输出：
- session 可见截图 / 日志 / 控制台证据

---

## 判定规则

### 判定为通过（PASS）
同时满足：
- plugin load/service start 证据存在
- watcher 检测新信证据存在
- 目标 session 可见提醒证据存在

### 判定为不通过（FAIL）
以下任一成立：
- plugin 未正常加载
- service 未启动
- 新信未被检测到
- inject/wake 没有任何证据
- session 侧无可见提醒

---

## 常见失败点与排查顺序

### 1. plugin 根本没加载
先查：
- plugin 注册路径
- package build 产物
- OpenClaw plugin 注册错误

### 2. service 启动了，但 watcher 没动作
先查：
- repo 路径是否正确
- git 水位是否已存在且位置正确
- 是否真的有新 commit

### 3. watcher 检测到新信，但 session 无提醒
先查：
- forced sessionKey 是否正确
- inject 调用是否真实命中该 session
- wake 调用是否生效

---

## 后续升级路径

如果本轮通过，下一轮再验证：

### Phase 2：自动 session binding
验证：
- `session_start/session_end` 是否能稳定维护 agent → sessionKey 映射
- 不依赖 forced sessionKey 也能走通闭环

### Phase 3：完整主链路验证
验证：
- 自动 binding + daemon + inject + wake + session 可见 的完整路径

---

## 当前建议

> 不要直接让执行方去“自己想办法验证 OpenClaw plugin 全链路”。
>
> 先按这个最小可行验证方案执行，拿到真实证据，再决定下一步。
