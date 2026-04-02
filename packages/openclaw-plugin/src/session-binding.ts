/**
 * Session binding: maintains agent → main/direct sessionKey mapping.
 * Only binds eligible main/direct sessions, ignoring subagent/cron/ACP/thread sessions.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';

export interface SessionBinding {
  sessionKey: string;
  agentId: string;
  updatedAt: number;
}

export class SessionBindingStore {
  // Map: agentId -> SessionBinding
  private bindings = new Map<string, SessionBinding>();
  private storePath: string;

  constructor(storePath = join(homedir(), '.config', 'agm', 'session-bindings.json')) {
    this.storePath = storePath;
    this.load();
  }

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
    this.save();
  }

  unbind(agentId: string, sessionKey?: string): void {
    if (!sessionKey) {
      this.bindings.delete(agentId);
      this.save();
      return;
    }
    const existing = this.bindings.get(agentId);
    if (!existing) return;
    if (existing.sessionKey !== sessionKey) return;
    this.bindings.delete(agentId);
    this.save();
  }

  get(agentId: string): string | undefined {
    return this.bindings.get(agentId)?.sessionKey;
  }

  getAll(): Map<string, SessionBinding> {
    return new Map(this.bindings);
  }

  private load(): void {
    try {
      if (!existsSync(this.storePath)) return;
      const raw = readFileSync(this.storePath, 'utf-8');
      const parsed = JSON.parse(raw) as SessionBinding[];
      for (const entry of parsed) {
        if (!entry?.agentId || !entry?.sessionKey) continue;
        this.bindings.set(entry.agentId, entry);
      }
    } catch {
      // ignore corrupt binding cache and start fresh
    }
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.storePath), { recursive: true });
      writeFileSync(this.storePath, JSON.stringify(Array.from(this.bindings.values()), null, 2) + '\n', 'utf-8');
    } catch {
      // ignore persistence errors; in-memory binding still works
    }
  }
}
