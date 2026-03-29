---
title: Agent Git Mail v0 Final Handoff Brief
date: 2026-03-29
tags:
  - agent
  - git
  - mail
  - handoff
  - implementation
status: active
---

# Agent Git Mail v0 Final Handoff Brief

## 1. 目标

开始实现 `Agent Git Mail` v0。

当前阶段目标不是继续脑暴，而是：

> 基于已拍板方案，产出 implementation plan，并准备进入建仓后的实现阶段。

---

## 2. 已拍板约束

以下内容已拍板，不要重开：

### 技术选型

- 语言：**TypeScript / Node**
- Git 操作：**直接调系统 `git` CLI**，不使用 git 库作为主实现
- 仓库形态：**monorepo**
- monorepo 只保留两个 package：
  - `packages/agm`
  - `packages/openclaw-plugin`
- 当前**不做 `shared` 层**

### 协议与数据模型

- 每个 agent 一个 git repo
- 信件格式：**`frontmatter + markdown`**
- **文件名就是主标识**
- `reply_to` **直接引用文件名**
- 文件名采用：**时间戳可读型**
- 若同秒冲突，可补一个短随机尾巴

### frontmatter 6 字段

```yaml
from:
to:
subject:
created_at:
reply_to:
expects_reply:
```

补充约束：
- `reply_to` 可选
- `expects_reply` 显式写 `true/false`

### 命令面

v0 命令清单：

- `agm config`
- `agm send`
- `agm reply`
- `agm read`
- `agm list`
- `agm archive`
- `agm daemon`

### 配置

v0 配置保持极简：

```yaml
agents:
  mt:
    repo_path: /path/to/mt
  hex:
    repo_path: /path/to/hex

runtime:
  poll_interval_seconds: 30
```

约束：
- repo 路径显式配置
- 不加多余配置项

### 正文输入方式

- 主路径：**`--body-file`**
- stdin 可作为兼容入口，但不作为主心智模型

### daemon / 新信检测

- daemon 固定 **30 秒**轮询
- **不做自定义 checkpoint 文件**
- **明确采用本地 git ref 作为水位方案**，例如 `refs/agm/last-seen`
- git ref 属于 daemon 本地运行态表达，**不进入 repo 协议层**
- 新信判定规则：diff 中的 **`A inbox/*.md`**
- 首次启动：**默认只建水位，不补历史**

### 命令行为纪律

- **`archive` 必须 push**，不能只做本地归档
- **提交必须精确到目标文件**，不能顺手带上其他脏改动

### OpenClaw 集成边界

- `agm` 是 CLI/daemon 本体
- `openclaw-plugin` 是 OpenClaw 宿主适配层
- `openclaw-plugin` 可以依赖 `agm`
- `agm` 不能依赖 `openclaw-plugin`

---

## 3. 当前推荐目录结构

```text
agent-git-mail/
├─ docs/
├─ packages/
│  ├─ agm/
│  └─ openclaw-plugin/
├─ test/
└─ scripts/
```

### `packages/agm`
负责：
- CLI
- config
- send / reply / read / list / archive
- daemon
- git CLI 封装
- frontmatter / filename / repo 规则

### `packages/openclaw-plugin`
负责：
- session 绑定
- system event 注入
- heartbeat wake
- 调用 `agm` 或依赖 `agm` 暴露出的少量能力

---

## 4. 推荐实现顺序

建议按下面顺序规划 implementation plan：

1. monorepo 基础骨架
2. `packages/agm` 的 config / schema / filename / frontmatter
3. git 封装层
4. `send / reply / read / list / archive`
5. `daemon` 与 git ref 水位
6. `packages/openclaw-plugin` 的最小接入验证

不要一上来先做复杂 plugin 行为，也不要先做多余工具命令。

---

## 5. 最值得先做 spike 的点

建议优先验证这些风险点：

1. **git ref 水位方案是否顺手**
   - `refs/agm/last-seen`
   - `git diff old..new` + `A inbox/*.md`

2. **daemon 首次启动策略**
   - 没有 ref 时直接建立水位，不补历史

3. **OpenClaw plugin 最小注入链路**
   - session 绑定
   - enqueue system event
   - request heartbeat now

---

## 6. 不要再重开的议题

以下内容已不建议继续讨论：

- 要不要 server
- 要不要 obligation / urgency / thread governance
- 要不要 shared 包
- 要不要 repo auto-discovery
- 要不要复杂 config schema
- 要不要自定义 checkpoint.json

当前应该进入 implementation plan，而不是继续概念发散。

---

## 7. 参考文档

- `docs/2026-03-29-agent-git-mail-one-pager.md`
- `docs/2026-03-29-agent-git-mail-v0-formal-design.md`
- `docs/2026-03-29-agent-git-mail-openclaw-feasibility.md`

---

## 8. 对 Hex 的请求

请基于这份 handoff brief 和上述 design docs：

1. review 这份 handoff brief 是否准确反映当前拍板
2. 如果准确，回一封 review 信确认
3. 如有实现层风险或缺失，请指出，但不要重开大设计
4. 然后再产出 implementation plan
