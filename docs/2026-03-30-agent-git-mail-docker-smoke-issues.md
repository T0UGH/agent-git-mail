# Agent Git Mail Docker 冒烟问题清单

- 日期：2026-03-30
- 测试方式：Docker 内执行 + 真实远程 GitHub 私有仓库
- 测试 agent：`atlas` / `boron`
- 测试仓库：
  - `T0UGH/test-mailbox-a` → `atlas`
  - `T0UGH/test-mailbox-b` → `boron`

---

## 0. 本轮测试结论

本轮不是全绿。

已经被真实验证通过的链路：
- `send`
- `list/read`
- `reply`
- 真实 remote `push`

尚未通过或明确存在缺陷的部分：
- CLI 参数解析
- Docker 内 git identity 依赖未显式处理
- push 失败被吞
- `archive` 语义错误
- OpenClaw plugin 注入链路尚未拿到通过证据

---

## Issue 1：CLI 参数解析与命令实现字段不对齐

## 现象

直接在 Docker 内执行 CLI 命令时，`agm send --body-file ...` 失败，报错：

```text
The "paths[0]" argument must be of type string. Received undefined
```

这说明 CLI 传进业务层的 `bodyFile` 等字段没有按预期落到位。

## 复现方式

示例命令：

```bash
node packages/agm/dist/index.js send --from atlas --to boron --subject "docker smoke 1" --body-file /app/test-repos/atlas-body.txt
```

## 影响

- 当前用户态 CLI 不可靠
- 冒烟时必须绕过 CLI parser，直接调用 dist 模块才能继续验证主链路
- 这会掩盖真实用户使用路径的问题

## 初步判断

`packages/agm/src/index.ts` 的参数解析器过于简陋：
- 只处理 `--key value`
- 没有把 kebab-case 映射成命令实现需要的 camelCase
- 对位置参数的传递也不完整（如 reply/read/archive 的 filename）

## 建议修复

优先级：**P0**

建议至少做其中一个：
1. 改成成熟 CLI parser（如 commander / yargs）
2. 当前 parser 增加：
   - kebab-case → camelCase 映射
   - 位置参数映射
   - 子命令参数 schema 校验

---

## Issue 2：Docker/新环境下 git identity 未初始化，导致 commit 失败

## 现象

首次在容器内执行 `send` 时，git commit 失败：

```text
Author identity unknown
fatal: unable to auto-detect email address
```

## 影响

- 新环境 / CI / Docker 里无法直接使用 `agm`
- 当前系统依赖运行环境预先存在 git identity，但没有显式检查或友好报错

## 初步判断

当前实现默认底层 repo 已有可用 git 身份，但这是不成立的隐含前提。

## 建议修复

优先级：**P1**

建议：
1. 在启动前做 git identity preflight check
2. 如果缺失，给出明确错误和修复建议
3. 可选：支持通过配置写入 repo-local identity，而不是依赖全局 git config

---

## Issue 3：push 失败被吞，导致本地“看似成功”但远端未更新

## 现象

在 Docker 内，`send/reply` 执行后本地 repo 已产生 commit，但 fresh clone 远端仓库时看不到对应提交。

容器内 repo 状态显示：

```text
## main...origin/main [ahead 2]
```

说明 commit 已生成但 push 没成功。

## 影响

- 用户会误以为消息已经送达远端仓库
- 实际远端没有更新，异步通信语义失真
- 这是高风险的“假成功”

## 初步判断

`send-message.ts` / `reply-message.ts` 中的 `maybePush()` 会吞掉 push 失败：

```ts
try {
  await repo.push();
} catch {
  // No remote configured, skip
}
```

问题在于：
- “没有 remote” 与 “push 失败” 被混成一类
- 鉴权失败、网络失败、权限失败都会被静默忽略

## 建议修复

优先级：**P0**

建议：
1. 只在“确实没有 remote”时跳过 push
2. 其余 push 失败必须显式返回错误
3. 输出应区分：
   - commit succeeded
   - push succeeded / failed
4. 最好把 delivery 成败语义建立在 remote push 成功之上，而不是本地 commit 成功之上

---

## Issue 4：archive 实现错误，远端出现 inbox/archive 双份同信

## 现象

`archive` 命令执行后：
- `list --dir archive` 能看到目标信件
- 但 fresh clone 远端仓库后，发现同一封信同时出现在：
  - `archive/<file>`
  - `inbox/<file>`

也就是说，归档结果不是“移动”，而是“新增 archive 副本，但 inbox 原件还在”。

## 证据

archive commit 的 diff 只有：

```text
A archive/<filename>
```

没有：

```text
D inbox/<filename>
```

## 根因

`packages/agm/src/app/archive-message.ts` 当前逻辑：

```ts
await repo.moveFile(`inbox/${opts.filename}`, `archive/${opts.filename}`);
await repo.commit(`agm: archive ${opts.filename}`, `archive/${opts.filename}`);
```

问题在于 commit 时只提交了 `archive/<file>`，没有把 `inbox/<file>` 的删除纳入 commit。

## 影响

- archive 语义错误
- 收件箱视图和归档视图不一致
- daemon / plugin 若基于 inbox 扫描，可能继续把已归档信件当成未处理对象

## 建议修复

优先级：**P0**

建议：
1. archive commit 必须同时纳入 rename/delete
2. 不要只按单文件 path commit
3. 可以考虑：
   - `git commit -am ...`
   - 或在 repo 抽象层支持 commit staged changes，而不是 commit 单一路径

---

## Issue 5：空目录未被跟踪，导致 archive 在干净 clone / clean 后失败

## 现象

在 Docker 场景里，`archive` 初次执行直接失败：

```text
fatal: renaming 'inbox/<file>' failed: No such file or directory
```

原因不是 inbox 文件不存在，而是目标 `archive/` 目录没有被 Git 跟踪；容器 clean 后目录消失，`git mv` 无法落目标目录。

## 影响

- 新仓库初始化不完整时，archive 直接不可用
- 这类问题在空仓 / 新 agent / CI 初始化中很常见

## 建议修复

优先级：**P1**

建议：
1. 在 repo bootstrap 中显式创建并跟踪：
   - `inbox/.gitkeep`
   - `archive/.gitkeep`
   - `outbox/.gitkeep`（如果需要稳定目录）
2. 或者 archive 前确保目标目录存在

---

## Issue 6：OpenClaw plugin 链路尚未取得通过证据

## 现象

Docker 内 isolated OpenClaw gateway 已成功启动，但当前还没有拿到以下任一关键证据：
- AGM plugin 成功加载日志
- `[agm] stage=...` daemon/poll 日志
- 新信检测日志
- inject / heartbeat request 日志
- session 可见提醒

## 当前状态

只能确认：
- gateway 起了
- OpenClaw 基础状态正常

不能确认：
- `packages/openclaw-plugin` 已被宿主正确加载并实际执行

## 影响

- plugin 这层目前不能宣称通过
- 当前最多只能说 repo/remote 主链路已通

## 建议修复 / 下一步

优先级：**P0（验证层）**

下一步建议：
1. 先确认 plugin load 日志
2. 再确认 `AGM_CONFIG_DIR` 是否被 plugin 进程读取到
3. 触发一封新信，看是否出现：
   - `stage=config_loaded`
   - `stage=route`
   - `stage=new_mail_detected`
   - `stage=deliver_prepare`
   - `stage=enqueue_done`
   - `stage=heartbeat_requested`
4. 最后再看 session 可见提醒

---

## 7. 当前通过项（可作为冒烟阶段性成果）

在 Docker + 真实远程仓库下，已经确认：

### PASS-1：真实 send 通
- `atlas -> boron` 发信成功
- `boron inbox` 可见
- 远端 `test-mailbox-b` fresh clone 可见该信

### PASS-2：真实 read/list 通
- `boron` 能列出并读取 `atlas` 发来的信
- frontmatter / body 正常

### PASS-3：真实 reply 通
- `boron -> atlas` 回信成功
- `atlas inbox` 可见 reply
- `reply_to` 正确指向原始文件
- 远端 `test-mailbox-a` fresh clone 可见 reply

### PASS-4：真实 remote push 通（在配置 token remote 后）
- 容器内 commit 已成功推到 GitHub 私有仓库
- fresh clone 远端仓库能看到对应提交和文件

---

## 8. 建议优先级排序

### P0
1. 修 CLI 参数解析
2. 修 push 失败吞错
3. 修 archive commit 只提交新增不提交删除
4. 打通 plugin load / inject 最小验证链

### P1
5. 加 git identity preflight
6. 规范 repo bootstrap（`.gitkeep` / 目录初始化）

---

## 9. 一句话判断

当前 `agent-git-mail` 的**repo/remote 主链路已经真实可跑**，但还不能算完整冒烟通过。

更准确的说法是：

> **send/read/reply/remote push 已被 Docker + 真实远程仓库验证；archive 与 plugin 注入链路仍存在明确缺陷或未完成验证。**
