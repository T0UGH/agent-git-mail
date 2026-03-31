import { z } from 'zod';

// --- Old format (v0 / agents map) ---
export const AgentConfigSchema = z.object({
  repo_path: z.string(),
});

// --- New format (v1 / self + notifications) ---
export const SelfConfigSchema = z.object({
  id: z.string().min(1, 'self.id is required'),
  repo_path: z.string().min(1, 'self.repo_path is required'),
});

export const NotificationsConfigSchema = z.object({
  default_target: z.string().optional().default('main'),
  forced_session_key: z.string().nullable().optional().default(null),
});

export const RuntimeConfigSchema = z.object({
  poll_interval_seconds: z.number().optional().default(30),
});

export const ContactsConfigSchema = z.record(z.string(), z.string().min(1));

export const ConfigSchemaV1 = z.object({
  self: SelfConfigSchema,
  contacts: ContactsConfigSchema.optional().default({}),
  notifications: NotificationsConfigSchema.optional().default({}),
  runtime: RuntimeConfigSchema.optional().default({}),
});

// --- Unified config (supports both v0 and v1) ---
export const ConfigSchema = z.union([ConfigSchemaV1, z.object({
  agents: z.record(z.string(), AgentConfigSchema),
  runtime: z.object({
    poll_interval_seconds: z.number().optional().default(30),
  }).optional().default({}),
})]);

export type Config = z.infer<typeof ConfigSchema>;
export type ConfigV1 = z.infer<typeof ConfigSchemaV1>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type SelfConfig = z.infer<typeof SelfConfigSchema>;
export type NotificationsConfig = z.infer<typeof NotificationsConfigSchema>;
export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;
export type ContactsConfig = z.infer<typeof ContactsConfigSchema>;

/** True if the config is the new v1 format (has self) */
export function isConfigV1(c: Config): c is ConfigV1 {
  return 'self' in c;
}

/** Returns agent entries regardless of config format (v0 or v1) */
export function getAgentEntries(c: Config): Array<[string, string]> {
  if (isConfigV1(c)) {
    const entries: Array<[string, string]> = [[c.self.id, c.self.repo_path]];
    for (const [name, repoPath] of Object.entries(c.contacts)) {
      entries.push([name, repoPath]);
    }
    return entries;
  }
  return Object.entries(c.agents as Record<string, { repo_path: string }>).map(
    ([k, v]) => [k, v.repo_path],
  );
}

/** Looks up repo_path by agent name, returns null if not found */
export function getAgentRepoPath(c: Config, name: string): string | null {
  if (isConfigV1(c)) {
    if (c.self.id === name) return c.self.repo_path;
    return c.contacts[name] ?? null;
  }
  return (c.agents as Record<string, { repo_path: string }>)[name]?.repo_path ?? null;
}

/** Throws a human-readable error for an unknown agent */
export function unknownAgentError(agentName: string, config: Config): never {
  if (isConfigV1(config)) {
    const selfId = config.self.id;
    const contactsKeys = Object.keys(config.contacts);
    const hasContacts = contactsKeys.length > 0;
    let hint = '';
    if (selfId === agentName) {
      hint = `\n\nHint: "${agentName}" is your own agent ID (self). You cannot send a message to yourself.`;
    } else if (!hasContacts) {
      hint = `\n\nHint: Your config has no contacts yet. Add this to your config file:\ncontacts:\n  ${agentName}: /path/to/${agentName}-mailbox`;
    } else {
      hint = `\n\nHint: "${agentName}" is not in your contacts. Add this to your config file:\ncontacts:\n  ${agentName}: /path/to/${agentName}-mailbox\n\nYour current contacts: ${contactsKeys.join(', ') || '(none)'}`;
    }
    throw new Error(`Unknown agent: ${agentName}${hint}`);
  }
  // Old format
  const agents = Object.keys(config.agents as Record<string, unknown>);
  throw new Error(
    `Unknown agent: ${agentName}\n\nHint: "${agentName}" is not defined in your config.\nYour agents: ${agents.join(', ')}\n\nConfig format:\nagents:\n  ${agentName}:\n    repo_path: /path/to/${agentName}-mailbox`,
  );
}
