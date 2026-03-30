# Agent Git Mail 冒烟测试计划

> 目标：先验证 `agent-git-mail` 的最小功能闭环，再验证 OpenClaw plugin 集成闭环。

## 1. 本轮测试目标

本轮不追求覆盖所有边界条件，只验证两层核心能力：

1. **CLI / git-native mail 闭环可用**
   - 能发信
   - 能收信 / 列信
   - 能回信
   - 能归档
   - daemon / waterline 不会重复报同一封旧信

2. **OpenClaw plugin 最小集成闭环可用**
   - plugin 能加载
   - service 能启动
   - repo 中出现新信后，plugin 能检测到
   - plugin 能把新信转成目标 session 的可见提醒

---

## 2. 测试分层

### Layer A：CLI / repo 层
验证 `packages/agm`。

### Layer B：OpenClaw plugin 层
验证 `packages/openclaw-plugin`。

原则：
- **先过 Layer A，再做 Layer B**
- 如果 Layer A 不通，Layer B 结果没有解释价值

---

## 3. 环境准备

## 3.1 测试角色

- sender agent：`hex`
- receiver agent：`mt`

## 3.2 测试 repo

准备两个独立 git repo：
- `mt-repo`
- `hex-repo`

每个 repo 至少包含：
- `inbox/`
- `archive/`

要求：
- 都是干净工作树
- 都能正常 `git add / commit`
- OpenClaw plugin 配置中的 agent -> repo_path 映射明确可读

## 3.3 证据要求

每个用例至少保留以下一种证据：
- 命令输出
- git log / git status
- repo 文件路径与内容
- OpenClaw 日志片段
- session 可见提醒

---

## 4. Layer A：CLI / repo 冒烟用例

## Case A1：send 基本发信

**目标**：证明 `agm send` 能把一封新信写进目标 repo 的 `inbox/`，并形成 git 提交。

**步骤**：
1. 在 `hex` 身份下执行 `agm send --from hex --to mt ...`
2. 检查 `mt-repo/inbox/` 是否出现新文件
3. 检查 frontmatter 是否完整（`from/to/subject/created_at` 等）
4. 检查 git 历史中是否出现对应 commit

**通过标准**：
- `mt inbox/` 出现新文件
- 文件 frontmatter 合法
- git commit 存在

---

## Case A2：list / read 收信可见

**目标**：证明收件方能看到刚收到的信。

**步骤**：
1. 在 `mt` 身份下执行列信命令（如 `agm list --agent mt --dir inbox`）
2. 必要时读取该信正文
3. 校验 subject / from / filename 一致

**通过标准**：
- 列表里能看到新信
- 关键信息与发信结果一致

---

## Case A3：reply 基本回信

**目标**：证明 `agm reply` 能正确生成回信，并与原信建立关联。

**步骤**：
1. 用 A1 产出的 filename 作为 reply 目标
2. 以 `mt` 身份执行 `agm reply <filename> --from mt ...`
3. 检查 `hex-repo/inbox/` 是否出现回信
4. 校验回信 frontmatter 中的 `reply_to` 是否指向原始 filename

**通过标准**：
- `hex inbox/` 出现回信文件
- `reply_to` 正确指向原信
- git commit 存在

---

## Case A4：archive 基本归档

**目标**：证明 `agm archive` 只影响本地工作视图，不破坏原始通信关系。

**步骤**：
1. 以 `mt` 身份归档 A1 中收到的信
2. 检查文件是否从 `inbox/` 移到 `archive/`
3. 检查 git commit 是否存在
4. 检查 reply 关系文件不受影响

**通过标准**：
- 文件成功进入 `archive/`
- git commit 存在
- 原信标识和回信链不被破坏

---

## Case A5：daemon 新信检测

**目标**：证明 daemon 能检测到“新增信件”，而不是全量重扫所有历史。

**步骤**：
1. 启动 daemon
2. 记录当前 waterline
3. 人工新增一封新信（通过 `agm send` 或直接 commit）
4. 观察 daemon 日志

**通过标准**：
- 日志能识别出新增 inbox 文件
- 能区分“新信”与“旧历史”
- 同一封旧信不会重复触发通知

---

## Case A6：waterline 幂等性

**目标**：证明重启 daemon 后不会把旧信再次当成新信。

**步骤**：
1. 完成 A5 后停止 daemon
2. 重新启动 daemon
3. 不新增任何信件，观察日志
4. 再新增一封新信，观察日志

**通过标准**：
- 重启后旧信不重复上报
- 新增信件仍能被识别

---

## 5. Layer B：OpenClaw plugin 集成冒烟用例

## Case B1：plugin load / service start

**目标**：证明 OpenClaw 能正确安装、加载并启动 plugin service。

**步骤**：
1. 安装本地 plugin 或使用已安装版本
2. 启动 / 重启 OpenClaw gateway
3. 查看日志

**通过标准**：
- 日志中出现 plugin load 成功
- 日志中出现 service start 成功
- 没有 shape mismatch / import error / runtime error

---

## Case B2：新信事件检测

**目标**：证明 plugin 能从 repo 变化里检测出新信。

**步骤**：
1. 保持目标 session 活跃
2. 在 sender 侧发一封新信到 receiver repo
3. 查看 plugin 日志

**通过标准**：
- 日志明确记录检测到新文件
- 至少包含 filename / from / to 之一

---

## Case B3：session 可见提醒

**目标**：证明 plugin 不只是“检测到”，而是真的把提醒送进 OpenClaw 会话。

**步骤**：
1. 选定一个已知 sessionKey 或当前主会话
2. 触发一封新信
3. 观察目标 session

**通过标准**：
- 目标 session 中出现可见提醒
- 提醒内容至少能定位到信件（如 filename / from / subject）

---

## Case B4：端到端最小闭环

**目标**：验证“发信 -> plugin 检测 -> session 看见提醒”整条路径。

**步骤**：
1. `hex -> mt` 发一封新信
2. plugin 检测并 inject / wake
3. `mt` 会话内看到提醒
4. `mt` 使用 CLI 读取并回信

**通过标准**：
- session 能看到提醒
- 收件方能基于提醒完成回信
- 回信能回到 sender repo

---

## 6. 判定标准

## PASS
必须至少满足：

- Layer A：A1 / A2 / A3 / A4 全部通过
- Layer A：A5 / A6 至少通过一个（最好两个都过）
- Layer B：B1 / B2 / B3 全部通过

## FAIL
以下任一成立则本轮不通过：
- send / reply / archive 任一主链路失败
- daemon 无法稳定识别新信
- plugin 虽加载成功，但 session 没有可见提醒

---

## 7. 推荐执行顺序

1. A1 send
2. A2 list/read
3. A3 reply
4. A4 archive
5. A5 daemon detection
6. A6 waterline idempotency
7. B1 plugin load
8. B2 new-mail detection
9. B3 session visible notification
10. B4 end-to-end minimal closure

---

## 8. 这轮最重要的验收点

如果只能挑 3 个最高优先级结果，我会看：

1. **send / reply / archive 是否真的通**
2. **daemon 是否只报新信、不重复报旧信**
3. **plugin 能否把新信变成 session 里可见提醒**

这 3 个过了，`agent-git-mail` 才算真正具备最小可用性。
