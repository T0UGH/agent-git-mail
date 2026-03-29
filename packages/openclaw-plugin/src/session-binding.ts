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
   * Only allow "main" or "direct" kind sessions to be registered.
   * This prevents subagent/cron/thread sessions from capturing mailbox notifications.
   */
  canBind(sessionKey: string): boolean {
    // Conservative: only bind sessions that look like direct/main sessions
    // Pattern: agent:main:feishu:direct:* or agent:main:*:direct:*
    const lower = sessionKey.toLowerCase();
    return lower.includes(':direct:') || lower.includes(':main:');
  }

  bind(sessionKey: string, agentId: string): void {
    this.bindings.set(agentId, {
      sessionKey,
      agentId,
      updatedAt: Date.now(),
    });
  }

  unbind(agentId: string): void {
    this.bindings.delete(agentId);
  }

  get(agentId: string): string | undefined {
    return this.bindings.get(agentId)?.sessionKey;
  }

  getAll(): Map<string, SessionBinding> {
    return new Map(this.bindings);
  }
}
