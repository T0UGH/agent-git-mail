# AGM 外部激活器实现计划

**状态**：draft
**基于**：`2026-04-02-agm-external-activator-final-design.md`
**目标**：实现最小闭环——AGM daemon 发现新邮件 → Feishu 激活消息 → OpenClaw agent 被唤醒

---

## 1. 要退出主路径的 plugin 代码

### 1.1 `packages/openclaw-plugin/` 目录

**处理：保留目录，退出主路径**

- 删除 `packages/openclaw-plugin/src/index.ts` 中的 daemon 注册逻辑
- 删除 `packages/openclaw-plugin/src/watch-agent.ts`（daemon 功能已移到 AGM）
- 移除 `openclaw.plugin.json` 中的 `agent-git-mail-daemon` service entry
- 保留 `session-binding.ts`（session binding 逻辑仍被 plugin 用于消息路由，但不作为 daemon 使用）
- plugin 的 `index.ts` 只保留 session-binding 和 route 逻辑

### 1.2 `packages/openclaw-plugin/src/service.ts`

**删除**，daemon 功能不再通过 plugin 暴露。

### 1.3 `packages/openclaw-plugin/src/notify.ts`

**删除**，notification 逻辑被新的 `AgmActivator` 替代。

### 1.4 配置文件清理

- `~/.openclaw/openclaw.json` 中的 `plugins.installs.agent-git-mail` 条目**保留但不启用**（历史记录）
- `plugins.entries.openclaw-agent-git-mail` 保持 `enabled: false`

### 1.5 npm 不再发布 `openclaw-agent-git-mail`

后续只维护 `@t0u9h/agent-git-mail`。

---

## 2. AGM daemon 新增模块

### 2.1 目录结构

```
packages/agm/src/
  activator/
    index.ts          # AgmActivator 接口 + 工厂函数
    types.ts          # AgmActivator interface + ActivationResult
    feishu-openclaw-agent.ts   # 第一版：Feishu activator 实现
    checkpoint-store.ts         # activation state 持久化
```

### 2.2 `activator/types.ts`

```typescript
export interface ActivationInput {
  selfId: string;
  filename: string;
  from: string;
  subject?: string | null;
  message: string;  // 渲染后的激活消息
}

export interface ActivationResult {
  ok: boolean;
  activator: string;
  externalId?: string | null;
  error?: string | null;
}

export interface AgmActivator {
  name: string;
  activate(input: ActivationInput): Promise<ActivationResult>;
}
```

### 2.3 `activator/checkpoint-store.ts`

- 文件路径：`~/.config/agm/activation-state.json`
- 结构：`{ processed: Record<filename, { activatedAt: string }> }`
- 操作：
  - `hasActivated(filename): boolean`
  - `markActivated(filename): void`
- 与 inbox 检测在同一轮完成（先查 checkpoint，再决定是否激活）

### 2.4 `activator/feishu-openclaw-agent.ts`

实现 `AgmActivator` 接口：

```typescript
export interface FeishuActivatorConfig {
  openId: string;              // 目标 agent 飞书 openId
  messageTemplate: string;      // 支持 {{filename}}、{{from}}、{{subject}} 插值
}

export function createFeishuOpenclawAgent(
  config: FeishuActivatorConfig
): AgmActivator {
  return {
    name: 'feishu-openclaw-agent',
    async activate(input) {
      const message = renderTemplate(config.messageTemplate, input);
      // 执行：openclaw agent --channel feishu -t "<openId>" -m "<message>" --deliver
      const result = await execAsync(
        `openclaw agent --channel feishu -t "${config.openId}" -m "${escape(message)}" --deliver`
      );
      return { ok: result.exitCode === 0, activator: 'feishu-openclaw-agent', externalId: null };
    },
  };
}
```

### 2.5 `activator/index.ts`

- 从 config 读取 `activation` 节
- 根据 `activator` 字段创建对应 activator 实例
- 提供 `createActivator(config): AgmActivator` 工厂函数

---

## 3. Activator 接口设计

### 3.1 接口契约

```typescript
interface AgmActivator {
  name: string;
  activate(input: ActivationInput): Promise<ActivationResult>;
}
```

### 3.2 设计原则

- AGM daemon 只依赖接口，不依赖具体实现
- 扩展时只需：
  1. 在 `activator/` 下新增 `xxx-activator.ts`
  2. 在 `activator/index.ts` 的工厂函数中加一个分支
  3. 在 config schema 中加对应配置节

### 3.3 扩展示例（未来）

```
activator/
  index.ts                    # 工厂函数
  types.ts                   # 接口
  feishu-openclaw-agent.ts   # 当前实现
  telegram-openclaw-agent.ts  # 未来扩展
  webhook-activator.ts        # 未来扩展
```

---

## 4. Feishu activator 第一版落地细节

### 4.1 Config schema 变更

在 `ConfigSchema` 中增加：

```typescript
activation: z.object({
  enabled: z.boolean().default(false),
  activator: z.enum(['feishu-openclaw-agent']).default('feishu-openclaw-agent'),
  poll_interval_seconds: z.number().default(5),
  dedupe_mode: z.literal('filename').default('filename'),
  feishu: z.object({
    open_id: z.string(),
    message_template: z.string().default(
      '[AGM ACTION REQUIRED]\n你有新的 Agent Git Mail。\n请先执行：agm read {{filename}}'
    ),
  }),
}).optional(),
```

### 4.2 `openclaw agent` 命令可行性确认

需验证：
- `openclaw agent --channel feishu -t "<openId>" -m "<msg>" --deliver` 在目标机器上是否可执行
- 需要飞书 channel 已配置且 agent 有权限
- 命令是同步执行还是异步（影响 daemon 是否需要 await）

### 4.3 消息模板插值

```typescript
function renderTemplate(template: string, input: ActivationInput): string {
  return template
    .replace('{{filename}}', input.filename)
    .replace('{{from}}', input.from)
    .replace('{{subject}}', input.subject ?? '');
}
```

---

## 5. Checkpoint / 去重方案

### 5.1 存储位置

`~/.config/agm/activation-state.json`

### 5.2 读写时机

**写入时机**：activator 调用成功后，立即写入 checkpoint
**读取时机**：每轮 daemon poll 发现新文件后，先查 checkpoint 是否已激活

```
poll →
  inbox 新文件列表 →
    filter(未在 checkpoint 中) →
      对每个文件调用 activator.activate() →
        成功 → 写入 checkpoint
```

### 5.3 竞态处理

daemon 是单进程，poll_interval 默认为 5s，暂无竞态风险。
若未来多实例，需加文件锁（当前范围外）。

---

## 6. 最小验证步骤

### 6.1 前置条件

- `mt` 的 `~/.config/agm/config.yaml` 中 `activation` 节已配置（enable=true，feishu.open_id=leo 的 openId）
- `leo` 的 OpenClaw 飞书 DM 正常

### 6.2 验证流程

**校验 1：检测新信**
```
mt 机器：agm send --from mt --to leo --subject "激活测试"
leo 机器：tail -f ~/.openclaw/logs/... | grep "agm.*inbox"
预期：daemon 日志出现 "inbox 发现新文件"
```

**校验 2：激活消息送达**
```
leo 飞书 DM 应收到固定格式消息：
[AGM ACTION REQUIRED]
你有新的 Agent Git Mail。
请先执行：agm read 2026-04-02Txx-xx-xxZ-mt-to-leo-xxxx.md
```

**校验 3：不重复发**
```
再次触发 daemon poll（等 5s）
预期：checkpoint 中已有记录，不再发第二次
```

**校验 4：leo 被激活**
```
leo 的 OpenClaw 应因飞书消息自动激活
agent 在飞书 DM 中出现 "agm read ..." 执行
```

---

## 7. README / bootstrap / install 变更

### 7.1 README 更新

- 删除 `openclaw-agent-git-mail` plugin 相关文档
- 新增「外部激活器」章节，说明：
  - activation 配置节结构
  - `openclaw agent` 命令依赖（需要 `openclaw` CLI 在 PATH 中）
  - checkpoint 机制说明

### 7.2 `agm bootstrap` 更新

`bootstrap` 命令增加 `--activation` 参数组：

```bash
agm bootstrap \
  --self-id mt \
  --self-remote-repo-url https://github.com/agent-git-mail-group/mt-mail.git \
  --self-local-repo-path ~/.agm/mt \
  --activation-enabled \
  --activation-feishu-open-id ou_xxx
```

bootstrap 生成的 config.yaml 自动加上 `activation` 节。

### 7.3 `packages/openclaw-plugin/` 保留但不发布

- 保留目录结构，plugin 代码减量但不删除
- 原因：历史参考，session-binding 逻辑仍有价值
- 不再作为 npm 包发布

---

## 8. 实现顺序

```
Phase 1: activator 接口 + checkpoint-store
  → packages/agm/src/activator/{types,checkpoint-store,index}.ts
  → Config schema 变更
  → 本地测试（mock activator）

Phase 2: Feishu activator 实现
  → packages/agm/src/activator/feishu-openclaw-agent.ts
  → 端到端测试（手动触发）

Phase 3: daemon 集成
  → run-daemon.ts 增加 activate 调用
  → 整合 checkpoint 逻辑

Phase 4: bootstrap + README 更新
  → CLI 参数 + 文档

Phase 5: 删除 plugin 主路径代码
  → service.ts / notify.ts 删除
  → npm 停止发布 plugin
```

---

## 9. 关键风险

### 风险 1：`openclaw agent` 命令在 daemon 环境中的可行性

`openclaw agent --channel feishu` 依赖：
- `openclaw` CLI 在 daemon 进程的 PATH 中
- 当前 OpenClaw 飞书 channel 已配置
- agent 有权限发送消息

**缓解**：第一版验证时先手动跑 `openclaw agent ...` 确认命令可用。

### 风险 2：checkpoint 写入失败导致重复激活

若 activator 调用成功后、写入 checkpoint 前进程崩溃，会导致下次 poll 重复激活。

**缓解**：当前阶段可接受（影响小，重试有幂等性保护）。未来可改进为先写 checkpoint 再激活（语义上更对）。

### 风险 3：openId 是硬编码配置，非动态发现

第一版需要用户在 config 中手动填目标 agent 的飞书 openId。

**缓解**：这是最小实现的已知限制。可接受。后续可扩展为从 OpenClaw session list 动态发现。
