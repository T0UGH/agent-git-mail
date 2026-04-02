# AGM Doctor and Log Design

**Goal**

为 AGM 补齐一套面向 agent 的轻量诊断面，降低 daemon / activator / config / git 相关问题的排查成本。第一阶段重点不是做 mailbox 浏览器，而是让 agent 能快速判断：系统有没有在工作、卡在哪一层、下一步该看什么。

---

## 1. 背景与问题

当前 AGM 已经有：
- CLI 基础原语（send / reply / read / list / archive / bootstrap / daemon）
- external activator
- checkpoint / waterline
- Docker 集成测试

但在真实使用中，排障仍然很痛，主要因为缺两类可观测性：

1. **Doctor 面**：缺少统一健康检查入口。
   - config 是否正确
   - repo / remote 是否正确
   - activation 配置是否完整
   - runtime 最近是否真的跑过
   - 最近一次 activation 成功还是失败

2. **Log 面**：缺少结构化运行事件。
   - daemon 有没有 poll
   - 有没有发现新信
   - activation 是 sent / failed / skipped
   - 是否发生 pull timeout

如果没有这两层，问题排查会退化成：翻代码、猜状态、读零散 stdout、手工拼因果链。

---

## 2. 设计目标

第一版目标：

- 提供一个 **agent-readable** 的 `agm doctor`
- 提供一个基于结构化事件的 `agm log`
- 让 `doctor` 不只是静态 lint，而是能给出轻量 runtime 判断
- 保持范围克制，不把它做成全量运维面板

---

## 3. 非目标

第一版不做：

- mailbox 浏览器 / thread explorer
- 自动修复（`doctor --fix`）
- 花哨的人类交互界面
- 完整 raw stderr/stdout 聚合平台
- 全量运维 dashboard

这轮重点是：**先有可信诊断闭环。**

---

## 4. 方案选择

### 方案 A：纯静态 doctor
仅检查 config / path / git / command availability。

**问题**：这只能解决“配没配好”，解决不了“为什么刚才没收到信”。排障价值不够。

### 方案 B：静态 doctor + 轻量 runtime state（推荐）
同时检查：
- config / path / git / binary
- 最近 daemon 事件
- 最近 activation 成败
- checkpoint / waterline 状态

**优点**：最贴近真实痛点，且范围仍可控。

### 方案 C：一步做成完整 ops 面板
把 doctor / log / mailbox state / status 一次做全。

**问题**：scope 太大，容易把第一版做散。

**结论：选 B。**

---

## 5. 命令设计

### 5.1 `agm doctor`

#### 默认行为

```bash
agm doctor
```

输出应优先面向 agent，要求：
- 稳定
- 低歧义
- 易于脚本消费
- 不依赖彩色 prose 才能读懂

建议输出形态：

```text
CHECK config         OK
CHECK self_repo      OK
CHECK git_remote     OK
CHECK openclaw_bin   OK
CHECK activation     WARN  missing feishu.open_id
CHECK daemon_recent  FAIL  no daemon activity in last 10m
CHECK last_activate  FAIL  last activation failed: openclaw not found
CHECK waterline      OK
CHECK checkpoint     OK
SUMMARY fail=2 warn=1 ok=6
```

#### 分项子命令

```bash
agm doctor config
agm doctor git
agm doctor runtime
agm doctor activation
```

设计原则：
- 默认总检降低使用门槛
- 分项子命令方便后续扩展和深入排查

#### 机器输出

```bash
agm doctor --json
```

`--json` 不是另一套逻辑，而是同一诊断模型的结构化表达。

### 5.2 `agm log`

#### 默认行为

```bash
agm log
```

默认查看 **结构化事件日志**，不是原始 stdout dump。

后续预留：
- `--tail <n>`
- `--since <duration|timestamp>`
- `--follow`
- `--raw`

但这些不要求第一版全部做完。

---

## 6. 事件日志设计

### 6.1 存储位置

第一版先务实，日志/state 统一放在：

```text
~/.config/agm/
```

建议新增：

```text
~/.config/agm/events.jsonl
```

理由：
- 当前已有 config / activation-state 也在这里
- 先把能力做出来，避免在目录哲学上浪费时间
- 后续如果需要，再迁到更严格的 runtime/state 目录

### 6.2 格式

使用 JSONL，一行一个事件。

建议事件模型：

```json
{
  "ts": "2026-04-02T21:00:00.000Z",
  "type": "activation_failed",
  "level": "error",
  "self_id": "mt",
  "filename": "2026-04-02T...md",
  "message": "activation failed",
  "details": {
    "activator": "feishu-openclaw-agent",
    "error": "openclaw not found"
  }
}
```

字段原则：
- `ts`：必填，ISO 时间戳
- `type`：稳定事件类型
- `level`：`info|warn|error`
- `message`：简短摘要
- `details`：扩展字段
- 常见诊断键（如 `self_id` / `filename`）尽量平铺，减少下游解析成本

### 6.3 第一版事件类型

建议最小集合：
- `daemon_poll_started`
- `daemon_poll_finished`
- `new_mail_detected`
- `activation_sent`
- `activation_failed`
- `activation_skipped_checkpoint`
- `pull_timeout`
- `doctor_run`

必要时再补：
- `config_load_failed`
- `self_repo_missing`
- `git_remote_mismatch`

---

## 7. Doctor 检查模型

### 7.1 检查分组

第一版建议分 4 组。

#### A. config
检查：
- config 文件是否存在
- schema 是否通过
- `self.id`
- `self.local_repo_path`
- `self.remote_repo_url`
- activation 配置是否完整

#### B. git
检查：
- self repo path 是否存在
- 是否是 git repo
- origin 是否存在
- origin URL 是否与 config 一致

#### C. runtime
检查：
- 最近 N 分钟是否有 daemon 事件
- 最近一次 poll 是否执行
- 最近一次 activation 是否 sent / failed
- 是否有 pull timeout

#### D. state
检查：
- `activation-state.json` 是否存在且可解析
- checkpoint key 是否格式合理
- waterline 是否存在 / 是否可读

### 7.2 输出语义

每个 check 返回统一状态：
- `OK`
- `WARN`
- `FAIL`

并附带：
- code
- short message
- optional details

例如：

```json
{
  "name": "daemon_recent",
  "status": "FAIL",
  "code": "NO_RECENT_DAEMON_ACTIVITY",
  "message": "no daemon activity in last 10m",
  "details": {
    "window_minutes": 10
  }
}
```

这样未来：
- 人可读输出可由它渲染
- `--json` 可直接回传同一数据结构
- agent 也能稳定消费这些 code/message

---

## 8. Runtime 因果定位边界

第一版 doctor 要做到的是 **lightweight causality**，不是完整 root-cause engine。

也就是说，它至少能帮忙回答：
- daemon 最近有没有跑
- 有没有发现新邮件
- activation 最近成功还是失败
- 问题更像是 config 层、git 层还是 runtime 层

但它不需要第一版就做到：
- 自动判断所有异常的最优修复步骤
- 复杂跨事件相关性分析
- 全历史事件聚合分析

---

## 9. CLI 边界与实现建议

### `agm doctor`
本质上是一个 orchestrator：
- 读取 config
- 调不同 check 模块
- 汇总结果
- 输出 text / json

建议后续实现边界：
- `src/doctor/checks/config.ts`
- `src/doctor/checks/git.ts`
- `src/doctor/checks/runtime.ts`
- `src/doctor/checks/state.ts`
- `src/doctor/index.ts`

### `agm log`
本质上是事件读取器：
- 读 `events.jsonl`
- 过滤 / 截断 / 格式化

建议边界：
- `src/log/events.ts`：append / parse / query
- `src/cli/commands/log.ts`
- daemon/runtime 调用统一 writer

### daemon 写事件
不要到处 `console.log + 另写一份文件逻辑`。
建议统一成：
- console 继续保留简短输出
- 同时走一个 `appendEvent()`

这样 `doctor` 和 `log` 才有统一事实源。

---

## 10. 第一版范围（拍板）

### 必做
- `agm doctor`
- `agm doctor --json`
- `agm doctor config|git|runtime|activation`
- `agm log`
- `events.jsonl`
- daemon / activation 路径写结构化事件

### 可选但不强求
- `agm log --tail`
- `agm log --since`

### 暂缓
- `agm log --follow`
- `agm log --raw`
- `doctor --fix`
- mailbox/thread 诊断视图

---

## 11. 验收标准

这轮设计算落地，至少要满足：

1. `agm doctor` 能输出稳定诊断结果，而不是零散 print
2. `agm doctor --json` 可被 agent 稳定消费
3. `agm doctor` 不只做静态 lint，还能反映最近 runtime 状态
4. `agm log` 能看到 daemon / activation 的结构化事件
5. 事件日志成为 doctor/runtime 的共同事实源
6. 第一版 scope 保持在 A+B（daemon/activator + config/git），不扩成 mailbox 浏览器

---

## 12. 推荐结论

这轮应该把 AGM 的可观测性收成一个很明确的产品判断：

- **`doctor` 是轻量 runtime doctor，不是纯 config lint**
- **`log` 是结构化事件面，不是 stdout 垃圾桶**
- **第一版优先给 agent 用，不优先做漂亮的人类交互**

这条线做对了，后面再扩 mailbox-state / raw logs / auto-fix 才有基础。
