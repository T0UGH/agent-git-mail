# OpenClaw Plugin Docker 会话可见性排查交接文档

- 日期：2026-03-30
- 交接对象：Hex
- 目标仓库：`/Users/wangguiping/workspace/agent-git-mail`
- 当前分支：`main`
- 最近修复提交：`99b9581` (`fix: harden agm cli and mailbox flow`)

---

## 1. 本次任务目标

本轮任务的最终目标不是仅验证 `agent-git-mail` 本体，而是要在 **Docker 中把 OpenClaw + AGM plugin 的“真实会话可见提醒”链路测通**。

完整目标链路：

1. 真实远程 GitHub mailbox repo 中出现一封新信
2. AGM plugin 在 Docker 内 OpenClaw 中检测到该新信
3. plugin 调用 OpenClaw 宿主接口投递系统事件
4. 该事件被 **真实 active session runtime** 消费
5. session transcript / session 可见输出中能看到提醒内容

目前做到第 3 步已经有证据；第 4~5 步还没闭环。

---

## 2. 关键仓库 / 路径

## 2.1 业务仓库

- 仓库：`/Users/wangguiping/workspace/agent-git-mail`
- GitHub：`https://github.com/T0UGH/agent-git-mail`

## 2.2 Docker 测试目录

- `docker/openclaw-test/`

关键文件：
- `docker/openclaw-test/docker-compose.yml`
- `docker/openclaw-test/Dockerfile`
- `docker/openclaw-test/test-openclaw.json`
- `docker/openclaw-test/tmp/`（测试时生成临时配置与测试文件）

## 2.3 真实远程测试仓库

本轮使用两个真实 GitHub 私有仓库：

- `T0UGH/test-mailbox-a` → agent `atlas`
- `T0UGH/test-mailbox-b` → agent `boron`

本地 clone 工作目录：
- `/Users/wangguiping/workspace/agent-git-mail/tmp-smoke/atlas`
- `/Users/wangguiping/workspace/agent-git-mail/tmp-smoke/boron`

容器挂载目录：
- `/app/test-repos/atlas`
- `/app/test-repos/boron`

## 2.4 容器名

- `agm-openclaw-test`

---

## 3. 已经完成并验证通过的内容

## 3.1 AGM 本体主链路已通过

已经在 **Docker + 真实远程 GitHub 仓库** 下验证通过：

- `send` ✅
- `read/list` ✅
- `reply` ✅
- `archive` ✅
- fresh clone 远端一致性 ✅

这部分不是猜测，已经实际跑通过。

## 3.2 已修复的问题

已提交到仓库：`99b9581`

修复内容：

1. **CLI 参数解析**
   - 修复 kebab-case → camelCase
   - 修复 `reply/read/archive` 的位置参数映射

2. **push 失败吞错**
   - 现在仅在“无 remote”时跳过 push
   - 有 remote 但 push 失败会显式报错

3. **archive 真 move**
   - 由只提交 `archive/<file>` 改为提交 staged rename
   - 解决 inbox/archive 双份残留问题

4. **git identity / mailbox preflight**
   - commit 前检查 repo-local `user.name/user.email`
   - 自动确保 `inbox/outbox/archive` 目录存在

相关测试新增/更新：
- `packages/agm/test/cli-args.test.ts`
- `packages/agm/test/push-behavior.test.ts`
- `packages/agm/test/preflight.test.ts`
- `packages/agm/test/archive.test.ts`

---

## 4. AGM plugin 当前已验证到什么程度

## 4.1 plugin 已真正加载

不是纸面配置，而是已经执行过：

```bash
openclaw plugins install -l /app/agent-git-mail/packages/openclaw-plugin
```

之后插件能在列表中看到，状态为 loaded。

## 4.2 plugin 轮询与检测链路已通

日志里已经拿到以下证据：

- `stage=poll_start`
- `stage=config_loaded agents=2`
- `stage=route ...`
- `stage=git_pull_ok`
- `stage=waterline_state`
- `stage=diff_parsed`
- `stage=new_mail_detected`
- `stage=deliver_prepare`
- `stage=enqueue_done`
- `stage=heartbeat_requested`

也就是说，到 **OpenClaw 宿主 system-event / heartbeat 请求边界** 为止，AGM plugin 是通的。

---

## 5. 当前真正的卡点

## 核心结论

**卡点不在 AGM 本体，也不在 plugin detect/enqueue。**

当前唯一关键卡点是：

> **Docker 里的 OpenClaw 没有一个被验证过的、真正活着的 session runtime 来消费 system event。**

表现为：

1. `enqueue_done` 日志存在
2. `heartbeat_requested` 日志存在
3. 但目标 session：
   - `sessions.json.updatedAt` 不变化
   - `sessionFile` 不写入
   - 没有可见提醒证据

---

## 6. 为什么之前的“造 session”方案不成立

之前尝试过：
- 手工往 `sessions.json` 里写入一个 `agent:test:dummy` entry
- 为它创建一个 `sessionFile`

结果：
- `openclaw sessions --json` 能看到这个 session
- 但再次触发来信后：
  - `updatedAt` 不变
  - `sessionFile` 仍然 0 行

这已经证明：

> **session entry ≠ active session runtime**

也就是说，仅有 session 元数据不等于会话真的活着、能消费 system event。

---

## 7. Docker 内 OpenClaw 宿主层已定位出的关键问题

## 7.1 gateway / CLI pairing 问题已打通

之前容器里一直卡：
- `unauthorized: gateway token mismatch`
- `pairing required`

现状：
- gateway auth token 已确认
- CLI device pairing repair 已完成
- `openclaw gateway call health` 已经能在容器里正常返回

### 关键文件

- gateway 配置：
  - `/app/.openclaw-test/.openclaw/openclaw.json`
- pairing / token：
  - `/app/.openclaw-test/.openclaw/identity/device-auth.json`
  - `/app/.openclaw-test/.openclaw/devices/paired.json`
  - `/app/.openclaw-test/.openclaw/devices/pending.json`

### 现状意义

这说明：
- **Docker 内 CLI ↔ gateway 通信链已基本打通**
- 后续可以真正用 CLI/RPC 去创建和检查 session

## 7.2 真实 active session runtime 仍未跑起来

这是当前的真正 blocker。

尝试过：

```bash
openclaw agent --session-id agm-smoke-visible --message "hello"
openclaw agent --local --session-id agm-visible-local -m "hello"
```

遇到的问题：
- 缺 provider auth
- 具体报错里明确提到 Docker 内 agent 缺 `anthropic` 可用 auth/profile

所以目前还没有成功在 Docker 里拉起一个真正活的 agent session。

---

## 8. 目前最重要的工程判断

这件事已经可以分层判断：

### AGM 本体
**已通过**

### AGM plugin 到宿主边界
**已通过**

### plugin 最终用户可见性（真实 session 中看到提醒）
**未闭环**

更准确说：
- 不是 AGM 明确失败
- 是 Docker 内 OpenClaw 宿主的 **session runtime / event consumption** 还没被真正打通验证

---

## 9. Hex 接手后最应该做什么

## 目标收口

Hex 接手后不要再围着 AGM repo 逻辑打转，重点切到：

> **在 Docker 内让 OpenClaw 自己跑出一个真实 active session runtime。**

只有这一步通了，后面“plugin 可见提醒”验证才成立。

## 推荐执行顺序

### Step 1：先让 Docker 内 `openclaw agent` 真能跑起来

目标：
- 在容器内成功执行一次 `openclaw agent ...`
- 生成真实 session
- session 的 `sessionFile` 不为空
- `updatedAt` 会变化

重点排查：
- provider auth/profile 缺失
- agent 运行依赖是否在容器里完整
- 默认模型配置是否要求 Anthropic，但容器里无 Anthropic auth

建议优先动作：
1. 找出容器里 agent auth 预期路径
2. 看宿主真实 OpenClaw 的 auth 是否能映射/复制进容器
3. 若 Anthropic 不可用，考虑把 Docker 内默认模型临时切到已有可用 provider

### Step 2：创建一个真正的测试 session

要求：
- 由 OpenClaw 自己创建，不要手写 `sessions.json`
- 能看到对应 `sessionFile` 真实写入
- `openclaw sessions --json` 中 age/updatedAt 变化合理

### Step 3：把 AGM plugin 路由到该真实 sessionKey

当前 plugin 通过环境变量：
- `AGM_FORCED_SESSION_KEY=agent:test:dummy`

后续要改成：
- 指向一个真实存在且活跃的 sessionKey

### Step 4：再次发一封真实信

路径：
- `atlas -> boron`
- 继续用真实 GitHub remote repo

验证：
- AGM stage 日志仍出现 `new_mail_detected / enqueue_done / heartbeat_requested`
- 同时 session transcript / session file 真正变化

### Step 5：拿到最终证据

最终只有拿到下面任一证据，才能宣称 plugin 在 Docker 中测通：

1. `sessionFile` 中出现 plugin 注入的提醒文本
2. `updatedAt` 变化且 transcript 能看到 system event 文本
3. 通过官方会话读取路径确认会话中有可见提醒

---

## 10. 当前可复用的命令/事实

## 10.1 plugin 安装命令

```bash
docker exec agm-openclaw-test bash -lc 'openclaw plugins install -l /app/agent-git-mail/packages/openclaw-plugin'
```

## 10.2 查看 AGM 日志

```bash
docker exec agm-openclaw-test bash -lc 'node -e "const fs=require(\"fs\"); const d=fs.readFileSync(\"/tmp/agm-gateway.log\",\"utf8\"); const lines=d.split(/\\n/).filter(l=>l.includes(\"[plugins] [agm]\")); console.log(lines.slice(-50).join(\"\\n\"));"'
```

## 10.3 当前已知有效的 gateway 配置文件

```text
/app/.openclaw-test/.openclaw/openclaw.json
```

里面有：
- gateway auth token
- plugin install/load 配置

## 10.4 当前 session store 路径

```text
/app/.openclaw-test/.openclaw/agents/main/sessions/sessions.json
```

## 10.5 真实远程测试 repo

- `https://github.com/T0UGH/test-mailbox-a.git`
- `https://github.com/T0UGH/test-mailbox-b.git`

agent 映射：
- `atlas` -> `test-mailbox-a`
- `boron` -> `test-mailbox-b`

---

## 11. 当前不要再重复做的事

Hex 接手后，**不要重复这些已经证明不够的动作**：

1. **不要再手工塞 `sessions.json` 当成真实 session**
   - 已证伪：entry 存在不等于 runtime 存在

2. **不要再把 `enqueue_done` 当成最终成功**
   - 它只证明到了宿主 system-event 边界

3. **不要再重复 AGM 本体 send/reply/archive 的业务测试**
   - 这些已经过了
   - 现在 bottleneck 不在 AGM 本体

---

## 12. 目前最短结论（给接手人）

> AGM 本体已通过；plugin 已验证到 OpenClaw 宿主边界（detect -> enqueue -> heartbeat request）。
> 当前唯一关键 blocker 是：Docker 内没有成功跑起一个真实 active session runtime 来消费 system event，导致“最终会话可见提醒”还没有被证实。
> 接手重点应从 AGM 逻辑转向 Docker 内 OpenClaw agent session 的真实启动与消费链验证。
