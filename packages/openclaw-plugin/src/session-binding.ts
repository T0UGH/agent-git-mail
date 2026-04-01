/**
 * Session binding: maintains agent → main/direct sessionKey mapping.
 * Only binds eligible main/direct sessions, ignoring subagent/cron/ACP/thread sessions.
 */

export interface SessionBinding {
  sessionKey: string;
  agentId: string;
  updatedAt: number;
}

export class SessionBindingStore {
  // Map: agentId -> SessionBinding
  private bindings = new Map<string, SessionBinding>();

  /**
   * Only allow main/direct sessions to be registered.
   * We prefer Feishu direct sessions over generic main sessions.
   */
  canBind(sessionKey: string): boolean {
    const lower = sessionKey.toLowerCase();
    return lower.includes(':direct:') || lower === 'agent:main:main';
  }

  private isFeishuDirect(sessionKey: string): boolean {
    return sessionKey.toLowerCase().includes(':feishu:direct:');
  }

  bind(sessionKey: string, agentId: string): void {
    const existing = this.bindings.get(agentId);
    if (existing) {
      const existingIsFeishu = this.isFeishuDirect(existing.sessionKey);
      const incomingIsFeishu = this.isFeishuDirect(sessionKey);
      if (existingIsFeishu && !incomingIsFeishu) {
        return;
      }
    }

    this.bindings.set(agentId, {
      sessionKey,
      agentId,
      updatedAt: Date.now(),
    });
  }

  unbind(agentId: string, sessionKey?: string): void {
    if (!sessionKey) {
      this.bindings.delete(agentId);
      return;
    }
    const existing = this.bindings.get(agentId);
    if (!existing) return;
    if (existing.sessionKey !== sessionKey) return;
    this.bindings.delete(agentId);
  }

  get(agentId: string): string | undefined {
    return this.bindings.get(agentId)?.sessionKey;
  }

  getAll(): Map<string, SessionBinding> {
    return new Map(this.bindings);
  }
}
