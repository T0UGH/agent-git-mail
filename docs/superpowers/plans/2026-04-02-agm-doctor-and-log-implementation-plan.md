# AGM Doctor & Log 实现计划

**Design**: `docs/superpowers/specs/2026-04-02-agm-doctor-and-log-design.md`
**目标**: `agm doctor` + `agm log` + `events.jsonl`
**原则**: 轻量、可测试、不扩 scope

---

## 文件边界

```
packages/agm/src/
  doctor/
    index.ts              # orchestrator: 调度各 check，汇总输出 text/json
    checks/
      config.ts           # A. config 文件存在、schema、self 字段、activation 完整性
      git.ts              # B. self repo 存在、是 git repo、origin URL 一致性
      runtime.ts          # C. 最近 daemon 事件、最近 poll/activation、最近 pull timeout
      state.ts            # D. activation-state.json、checkpoint keys、waterline
    types.ts              # CheckResult { name, status, code, message, details }

  log/
    events.ts             # appendEvent() / parseEvents() / queryEvents()
    event-types.ts         # EventType 枚举 + EventRecord 接口

  cli/
    commands/
      doctor.ts           # agm doctor CLI handler
      log.ts              # agm log CLI handler

  app/
    run-daemon.ts         # 改: console.log + appendEvent() 双写
    activator/
      checkpoint-store.ts  # 改: markActivated 时写事件
```

```
packages/agm/src/config/
  paths.ts                # 改: getEventsPath() → ~/.config/agm/events.jsonl
```

```
packages/agm/test/
  doctor/
    checks/
      config.test.ts      # unit
      git.test.ts         # unit (mock GitRepo)
      runtime.test.ts     # unit (mock events.jsonl 读写)
      state.test.ts       # unit
    doctor.test.ts        # integration: 全量 doctor 汇总
  log/
    events.test.ts        # unit: append/parse/query
    cli.test.ts           # integration: agm log CLI
```

---

## 任务拆分（执行顺序）

### Phase 0 — 基础设施（先写 test，再实现）

**0.1 `src/log/event-types.ts`**
- 定义 `EventType` 枚举（`daemon_poll_started | daemon_poll_finished | new_mail_detected | activation_sent | activation_failed | activation_skipped | pull_timeout | doctor_run`）
- 定义 `EventRecord` 接口（`ts`, `type`, `level`, `self_id`, `filename?`, `message`, `details?`）
- 写 `test/log/events.test.ts`：验证 EventRecord 序列化和 JSONL append/parse

**0.2 `src/log/events.ts`**
- `getEventsPath()` → `~/.config/agm/events.jsonl`
- `appendEvent(event: EventRecord): void` — 原子写入（先 .tmp 再 rename）
- `parseEvents(opts?: { limit?: number; since?: Date; types?: EventType[] }): EventRecord[]`
- `queryLastEvent(type: EventType): EventRecord | null`
- 写 `test/log/events.test.ts`：UT + 集成测试（实际读写 /tmp 下的测试 events.jsonl）

**0.3 `src/config/paths.ts` — 改**
- 新增 `getEventsPath(): string`

---

### Phase 1 — Doctor Checks（先写 failing test）

**1.1 `src/doctor/types.ts`**
```typescript
export type CheckStatus = 'OK' | 'WARN' | 'FAIL';
export interface CheckResult {
  name: string;        // e.g. "config_schema"
  status: CheckStatus;
  code: string;        // e.g. "CONFIG_INVALID"
  message: string;    // human-readable
  details?: Record<string, unknown>;
}
```

**1.2 `src/doctor/checks/config.ts`**
- 检查 config 文件存在、schema 通过
- 检查 `self.id` / `self.local_repo_path` / `self.remote_repo_url` 非空
- 检查 activation 配置完整性（如有）
- 每个 check 返回 `CheckResult`
- 写 `test/doctor/checks/config.test.ts`

**1.3 `src/doctor/checks/git.ts`**
- 检查 `self.local_repo_path` 存在
- 检查是 git repo（`GitRepo.verify()`）
- 检查 origin remote 存在
- 检查 origin URL 与 config 一致
- 每个 check 返回 `CheckResult`
- 写 `test/doctor/checks/git.test.ts`（mock `GitRepo`）

**1.4 `src/doctor/checks/runtime.ts`**
- 读取 `events.jsonl`（最近 N 分钟内）
- `daemon_recent`: 最近 N 分钟有 `daemon_poll_started` 事件 → OK，否则 FAIL
- `last_activation`: 最近一条 activation 事件是 `activation_sent` → OK，`activation_failed` → FAIL，`none` → WARN
- `pull_timeout_recent`: 最近 N 分钟有 `pull_timeout` → WARN
- 写 `test/doctor/checks/runtime.test.ts`（mock events.ts 读写）

**1.5 `src/doctor/checks/state.ts`**
- 检查 `~/.config/agm/activation-state.json` 存在且可解析
- checkpoint key 格式合理（`::` 分隔）
- waterline 文件可读
- 写 `test/doctor/checks/state.test.ts`

---

### Phase 2 — Doctor Orchestrator

**2.1 `src/doctor/index.ts`**
- `runDoctor(opts?: { group?: 'config' | 'git' | 'runtime' | 'state'; json?: boolean }): CheckResult[]`
- 按 group 调度对应 check 模块
- 汇总所有结果
- `--json` 模式：直接输出 `JSON.stringify(results, null, 2)`
- text 模式：按 design 格式输出（`CHECK name STATUS` + `SUMMARY` 行）

**2.2 `src/cli/commands/doctor.ts`**
- `agm doctor [config|git|runtime|state] [--json]`
- 调用 `runDoctor()`
- 写 `test/doctor/doctor.test.ts`

---

### Phase 3 — Log CLI

**3.1 `src/cli/commands/log.ts`**
- `agm log [--tail <n>] [--since <duration>] [--type <event_type>] [--json]`
- 调用 `parseEvents()` / `queryEvents()`
- 默认 text 表格输出（`ts | type | level | message`）
- `--json` 输出原始 JSONL 行
- 写 `test/log/cli.test.ts`

---

### Phase 4 — Daemon 写事件（最小侵入）

**4.1 `src/app/run-daemon.ts` — 改**
- 引入 `appendEvent()` from `log/events.ts`
- `daemon_poll_started` — 每次 poll 开始时写
- `daemon_poll_finished` — 每次 poll 结束时写（带 `mail_count` details）
- `new_mail_detected` — 发现新邮件时写
- `pull_timeout` — pull 超时时写

**4.2 `src/activator/checkpoint-store.ts` — 改**
- `markActivated()` 时写 `activation_sent`
- activation 失败时写 `activation_failed`
- `activation_skipped` — `hasActivated()` 返回 true 时被调用方写入

**4.3 `src/cli/commands/doctor.ts` — 改**
- `doctor_run` — doctor 每次运行时写事件

---

## 测试策略

### Unit Tests（本地）
- `test/doctor/checks/*.test.ts` — 每个 check 模块独立测试，mock 外部依赖（fs、GitRepo、events）
- `test/log/events.test.ts` — 事件 append/parse/query，用 `AGM_CONFIG_DIR=/tmp/agm-test-events` 隔离

### Integration Tests（Docker）
- `test/doctor/doctor.test.ts` — 全量 doctor 跑一遍，用 fake config/git repo
- `test/log/cli.test.ts` — agm log CLI 跑一遍，验证 JSONL 读写

### 验证命令

```bash
# 本地 unit tests
cd packages/agm && npm test

# Docker integration tests
bash test/docker/run.sh

# 手动验证
export AGM_CONFIG_DIR=/tmp/agm-test
mkdir -p $AGM_CONFIG_DIR

# 写一条测试事件
node -e "
import { appendEvent } from './dist/log/events.js';
appendEvent({ ts: new Date().toISOString(), type: 'doctor_run', level: 'info', self_id: 'test', message: 'test run' });
"

# doctor 跑一遍
node dist/index.js doctor
node dist/index.js doctor --json
node dist/index.js doctor config
node dist/index.js doctor git
node dist/index.js doctor runtime
node dist/index.js doctor state

# log 跑一遍
node dist/index.js log
node dist/index.js log --json
node dist/index.js log --tail 5
```

---

## 主要风险点

1. **Daemon 双写性能**：每次 poll 写事件文件可能成为 IO 瓶颈。第一版用原子 rename，后续如需要再优化。
2. **events.jsonl 无限增长**：第一版不实现 rotation，由用户手动清理。以后再加 `--max-size` 或 logrotate。
3. **runtime check 的时间窗口**：N 分钟内无事件算 FAIL，这个阈值需要调优。先硬编码 10min，后续可 config。
4. **checkpoint-store 写事件耦合**：把 `activation_skipped` 事件写入点放在 `hasActivated()` 调用方（run-daemon），而不是 `checkpoint-store` 内部，避免模块职责混乱。
