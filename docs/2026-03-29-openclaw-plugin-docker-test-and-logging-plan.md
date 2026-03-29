# OpenClaw Plugin Docker 测试环境与日志增强 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `openclaw-agent-git-mail` 建立隔离 Docker 测试环境，并补齐足够的 plugin / watcher 日志，让后续 mailbox 注入问题可复现、可定位、可验证，同时不再碰当前主会话。

**Architecture:** 测试环境与生产主会话彻底隔离：单独的 Docker 内 OpenClaw 实例、单独的数据/配置目录、单独的测试 session/agent。plugin 侧补“结构化关键路径日志”，覆盖 config 加载、agent 轮询、waterline、diff、新信检测、session 路由、enqueue/requestHeartbeat 调用与错误出口，但避免泛滥日志与泄露敏感内容。

**Tech Stack:** TypeScript/Node, OpenClaw plugin runtime, Docker, git CLI

---

## Scope / Non-goals

### In scope
- Docker 化的隔离 OpenClaw 测试方案
- plugin 与 watcher 关键路径日志增强
- 更新验证文档，明确“禁止主会话做注入测试”
- 最小 smoke 验证命令

### Out of scope
- 自动 session binding 完整实现优化
- 生产环境自愈/监控体系
- Feishu 渠道完整端到端自动化测试
- 长期保留 forced sessionKey 逻辑

---

## File Map

### Create
- `docs/2026-03-29-openclaw-plugin-docker-test-and-logging-plan.md` — 本计划
- `docker/openclaw-test/Dockerfile` — 隔离测试镜像
- `docker/openclaw-test/README.md` — 测试环境启动/清理说明
- `docker/openclaw-test/docker-compose.yml` — 本地一键拉起测试环境
- `docker/openclaw-test/test-openclaw.json` — 隔离 OpenClaw 配置样例（禁止指向主配置目录）

### Modify
- `docs/2026-03-29-openclaw-plugin-minimal-verification-plan.md` — 标注旧方案风险，改成隔离会话/Docker 优先
- `packages/openclaw-plugin/src/index.ts` — 增加 daemon/poll/session 路由日志；移除 verification-only 默认硬编码前先改成显式测试配置
- `packages/openclaw-plugin/src/watch-agent.ts` — 增加 repo/waterline/diff/new mail 日志与错误上下文
- `packages/openclaw-plugin/package.json` — 如需增加 docker smoke script / debug script

### Optional (only if needed after reading OpenClaw config patterns)
- `packages/openclaw-plugin/src/logger.ts` — 统一日志前缀/裁剪逻辑，避免 `index.ts` 与 `watch-agent.ts` 内联日志过多

---

## Logging Design

### Required log points
1. daemon start / stop
2. 每轮 poll 开始/结束（含耗时、agent 数量）
3. config 加载成功/失败
4. 每个 agent 的 repoPath、是否有 sessionKey、sessionKey 来源（forced/binding）
5. git pull 结果（成功/失败，失败摘要即可）
6. currentSha / lastSeen / waterline 初始化
7. diff 检出的新增文件列表
8. 对每个新文件：filename、from、将投递到哪个 sessionKey
9. enqueueSystemEvent 与 requestHeartbeatNow 调用前后
10. 所有 catch 块必须带 agent 名、阶段名、异常摘要

### Guardrails
- 不记录完整信件正文
- sessionKey 可完整打印（这是调试核心）
- repo path 可打印
- 异常日志必须带阶段上下文，不能只吞掉
- 日志默认 `info` 级别即可，不必引入复杂日志级别系统

---

## Docker Test Environment Design

### Test principles
- 禁止挂载当前 `~/.openclaw` 主配置目录
- 禁止默认指向当前生产/主 agent 会话
- 使用单独容器名、单独 volume/目录、单独 config
- 测试 repo 可挂本地临时目录，便于手工造新信

### Minimal environment contents
- Node / npm / git / openclaw CLI
- 挂载本地 `agent-git-mail` repo（只读代码 + 可写 build 产物，按实际需要）
- 单独 `OPENCLAW_HOME=/app/.openclaw-test`
- 单独 OpenClaw config：只加载测试所需 plugin
- 单独测试 repo 挂载点，如 `/app/test-repos/mt`

### First validation target
先验证：
- 容器内 plugin 能 loaded
- daemon 在跑
- 手工 commit 新信后，日志能清楚显示完整链路

不要第一步就追 Feishu 真发消息；先确认隔离环境里的日志闭环和 session 事件闭环。

---

## Chunk 1: 日志增强

### Task 1: 明确日志点与输出格式

**Files:**
- Modify: `packages/openclaw-plugin/src/index.ts`
- Modify: `packages/openclaw-plugin/src/watch-agent.ts`

- [ ] **Step 1: 在计划层先锁定日志格式**

目标：统一使用 `[agm]` 前缀，日志包含 `stage=<...>`、`agent=<...>`、必要时 `sessionKey=<...>`。

示例：
```ts
ctx.logger.info(`[agm] stage=poll_start agentCount=${entries.length}`);
ctx.logger.info(`[agm] stage=route agent=${name} sessionKey=${sessionKey} source=${source}`);
ctx.logger.info(`[agm] stage=new_mail agent=${agentName} file=${filename} from=${from}`);
```

- [ ] **Step 2: 给 `pollOnce()` 补 daemon/poll/config/route 日志**

要覆盖：
- config load success/fail
- entries count
- sessionKey 来源：forced / binding / missing
- enqueue/requestHeartbeat 前后

- [ ] **Step 3: 给 `watchAgentOnce()` 补 repo/waterline/diff/new mail 日志**

要覆盖：
- repo verify fail
- git pull fail 摘要
- currentSha / lastSeen
- `lastSeen` 不存在时写水线
- diff 结果
- extractFrom fail 时的文件名

- [ ] **Step 4: 把 silent catch 改成带上下文日志**

禁止继续出现“catch 后什么都不说”。

- [ ] **Step 5: Build 验证**

Run:
```bash
cd /Users/wangguiping/workspace/agent-git-mail
npm run build --workspace @t0u9h/openclaw-agent-git-mail
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/openclaw-plugin/src/index.ts packages/openclaw-plugin/src/watch-agent.ts
git commit -m "feat(openclaw-plugin): add poll and delivery logs"
```

---

## Chunk 2: 去掉危险默认测试路径

### Task 2: 把 forced sessionKey 从硬编码主会话改为显式测试配置

**Files:**
- Modify: `packages/openclaw-plugin/src/index.ts`
- Modify: `docs/2026-03-29-openclaw-plugin-minimal-verification-plan.md`

- [ ] **Step 1: 写一个失败检查点：没有显式测试配置时不得默认 forced 到主会话**

实现目标：
- 默认值必须是 `null`
- 若要 forced，只能通过显式测试配置/环境变量注入

- [ ] **Step 2: 最小实现显式测试配置入口**

候选二选一即可（YAGNI）：
- `process.env.AGM_FORCED_SESSION_KEY`
- 或测试专用 config 字段（仅文档化，不扩展协议太多）

推荐优先环境变量，避免污染正式配置结构。

- [ ] **Step 3: 日志中明确标识 `source=forced-env` / `source=binding` / `source=missing`**

- [ ] **Step 4: 更新最小验证文档，明确写死禁令**

必须加入：
- 禁止使用当前主会话
- 必须使用隔离测试会话 / Docker / 独立实例

- [ ] **Step 5: Build 验证**

Run same build command as Task 1
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/openclaw-plugin/src/index.ts docs/2026-03-29-openclaw-plugin-minimal-verification-plan.md
git commit -m "fix(openclaw-plugin): remove dangerous default forced session key"
```

---

## Chunk 3: Docker 隔离测试环境

### Task 3: 创建最小 Docker 测试环境骨架

**Files:**
- Create: `docker/openclaw-test/Dockerfile`
- Create: `docker/openclaw-test/docker-compose.yml`
- Create: `docker/openclaw-test/test-openclaw.json`
- Create: `docker/openclaw-test/README.md`

- [ ] **Step 1: 先确定镜像职责最小化**

镜像只负责：
- 提供 openclaw CLI + node + git
- 使用单独 `OPENCLAW_HOME`
- 加载本地 plugin

不要顺手塞太多诊断工具。

- [ ] **Step 2: 编写 `Dockerfile`**

要求：
- 选择稳定 Node 基础镜像
- 安装 git
- 安装 openclaw CLI
- 设置 `WORKDIR /app`
- 预留 `/app/.openclaw-test`

- [ ] **Step 3: 编写 `test-openclaw.json`**

要求：
- 插件只包含测试所需项
- 数据目录与主环境隔离
- 不引用宿主 `~/.openclaw/openclaw.json`

- [ ] **Step 4: 编写 `docker-compose.yml`**

要求：
- 挂载 `agent-git-mail` repo
- 挂载测试 repo 目录
- 传入 `OPENCLAW_HOME=/app/.openclaw-test`
- 如需 forced sessionKey，使用环境变量注入，不写死在源码

- [ ] **Step 5: 编写 `README.md` 说明启动/停止/清理命令**

至少包含：
```bash
docker compose -f docker/openclaw-test/docker-compose.yml up --build
docker compose -f docker/openclaw-test/docker-compose.yml down -v
```

- [ ] **Step 6: 验证容器可启动**

Expected:
- `openclaw plugins info openclaw-agent-git-mail` 可执行
- plugin 可 loaded 或至少错误信息明确

- [ ] **Step 7: Commit**

```bash
git add docker/openclaw-test
git commit -m "test(openclaw-plugin): add docker test environment"
```

---

## Chunk 4: Docker 内最小 smoke 验证

### Task 4: 用隔离环境重跑最小新信检测链路

**Files:**
- Modify: `docker/openclaw-test/README.md`
- Optional Modify: `packages/openclaw-plugin/package.json`

- [ ] **Step 1: 准备容器内测试 repo**

要求：
- 初始化 git repo
- 配置 `agm` 所需最小目录结构
- 先启动 daemon，让 waterline 正常建立

- [ ] **Step 2: 在 waterline 建立后再 commit 一封测试信**

要求：
- 文件名带 `forced-sessionkey-test`
- commit 精确到目标文件

- [ ] **Step 3: 采集日志证据**

必须看到：
- poll start
- route source
- currentSha / lastSeen
- detected new mail
- enqueue + heartbeat request

- [ ] **Step 4: 记录 smoke 验证步骤到 README**

让下一次执行不需要重新口头解释。

- [ ] **Step 5: Commit**

```bash
git add docker/openclaw-test/README.md packages/openclaw-plugin/package.json
git commit -m "test(openclaw-plugin): document docker smoke verification"
```

---

## Verification Checklist

### Code verification
```bash
cd /Users/wangguiping/workspace/agent-git-mail
npm run build --workspace @t0u9h/openclaw-agent-git-mail
```
Expected: PASS

### Docker verification
```bash
cd /Users/wangguiping/workspace/agent-git-mail
docker compose -f docker/openclaw-test/docker-compose.yml up --build
```
Expected:
- 容器启动成功
- OpenClaw 测试实例使用独立配置目录
- plugin 状态与日志可观察

### Functional smoke verification
- daemon 启动后建立 waterline
- 新 commit 被 watcher 检测到
- 日志能定位到 route + enqueue + heartbeat
- 全程不触碰当前生产主会话

---

## Success Criteria

计划完成后，必须同时满足：
1. plugin 有足够日志支撑排查，不再依赖猜测
2. forced sessionKey 不再默认指向当前主会话
3. 有一套可重复使用的 Docker 隔离测试环境
4. 最小 smoke 流程可重跑，并能留下明确证据链

---

## Notes for Executor

- 本任务先做“可排查、可隔离”，不是先追求所有真实渠道打通
- 若 Docker 内真实 Feishu 集成复杂，先把 session 事件链路和日志链路跑通
- 任何一步如果想把当前主会话再次拿来当测试目标，立即停止；这是已知事故复发条件
