import { z } from 'zod';

// --- Remote-first config (v2) ---
export const SelfConfigSchema = z.object({
  id: z.string().min(1, 'self.id is required'),
  local_repo_path: z.string().min(1, 'self.local_repo_path is required'),
  remote_repo_url: z.string().min(1, 'self.remote_repo_url is required'),
});

export const NotificationsConfigSchema = z.object({
  default_target: z.string().optional().default('main'),
  bind_session_key: z.string().nullable().optional().default(null),
  forced_session_key: z.string().nullable().optional().default(null),
}).transform((v) => ({
  default_target: v.default_target,
  bind_session_key: v.bind_session_key ?? v.forced_session_key ?? null,
  forced_session_key: v.forced_session_key ?? null,
}));

export const RuntimeConfigSchema = z.object({
  poll_interval_seconds: z.number().optional().default(30),
});

export const FeishuActivatorConfigSchema = z.object({
  open_id: z.string().min(1),
  message_template: z.string().optional().default(
    '[AGM ACTION REQUIRED]\n你有新的 Agent Git Mail。\n请先执行：agm read {{filename}}'
  ),
});

export const ActivationConfigSchema = z.object({
  enabled: z.boolean().optional().default(false),
  activator: z.enum(['feishu-openclaw-agent']).optional().default('feishu-openclaw-agent'),
  dedupe_mode: z.literal('filename').optional().default('filename'),
  feishu: FeishuActivatorConfigSchema,
});

export const ContactConfigSchema = z.object({
  repo_path: z.string().optional(),
  remote_repo_url: z.string().min(1),
});

export const ContactsConfigSchema = z.record(z.string(), ContactConfigSchema);

export const ConfigSchemaV2 = z.object({
  self: SelfConfigSchema,
  contacts: ContactsConfigSchema.optional().default({}),
  notifications: NotificationsConfigSchema.optional().default({}),
  runtime: RuntimeConfigSchema.optional().default({}),
  activation: ActivationConfigSchema.optional(),
});

// --- Legacy v1 (self + plain path contacts) ---
const LegacySelfConfigSchema = z.object({
  id: z.string().min(1),
  repo_path: z.string().min(1),
});

const LegacyContactsConfigSchema = z.record(z.string(), z.string().min(1));

export const LegacyConfigSchemaV1 = z.object({
  self: LegacySelfConfigSchema,
  contacts: LegacyContactsConfigSchema.optional().default({}),
  notifications: NotificationsConfigSchema.optional().default({}),
  runtime: RuntimeConfigSchema.optional().default({}),
});

// --- Legacy v0 (agents map) ---
const LegacyAgentsConfigSchema = z.record(z.string(), z.object({
  repo_path: z.string(),
}));

export const LegacyConfigSchemaV0 = z.object({
  agents: LegacyAgentsConfigSchema,
  runtime: z.object({
    poll_interval_seconds: z.number().optional().default(30),
  }).optional().default({}),
});

// Unified config: v2 first, then legacy v1 and v0 for backward compat
export const ConfigSchema = z.union([ConfigSchemaV2, LegacyConfigSchemaV1, LegacyConfigSchemaV0]);

export type Config = z.infer<typeof ConfigSchema>;
export type ConfigV2 = z.infer<typeof ConfigSchemaV2>;
export type LegacyConfigV1 = z.infer<typeof LegacyConfigSchemaV1>;
export type LegacyConfigV0 = z.infer<typeof LegacyConfigSchemaV0>;
export type SelfConfig = z.infer<typeof SelfConfigSchema>;
export type NotificationsConfig = z.infer<typeof NotificationsConfigSchema>;
export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;
export type ActivationConfig = z.infer<typeof ActivationConfigSchema>;
export type FeishuActivatorConfig = z.infer<typeof FeishuActivatorConfigSchema>;
export type ContactConfig = z.infer<typeof ContactConfigSchema>;
export type ContactsConfig = z.infer<typeof ContactsConfigSchema>;

// Backward compat: AgentConfig type used by old v0 format
const AgentConfigSchema = z.object({ repo_path: z.string() });
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/**
 * Returns agent entries as [name, pathOrUrl] pairs.
 * v2: returns [self.id, self.local_repo_path] + [contactName, contact.remote_repo_url]
 * v1/legacy: returns [self.id, self.repo_path] + [contactName, contactPath]
 */
export function getAgentEntries(c: Config): Array<[string, string]> {
  if (isConfigV2(c)) {
    const entries: Array<[string, string]> = [[c.self.id, c.self.local_repo_path]];
    for (const [name, contact] of Object.entries(c.contacts)) {
      entries.push([name, contact.remote_repo_url]);
    }
    return entries;
  }
  if (isConfigV1(c)) {
    const v1 = c as LegacyConfigV1;
    const entries: Array<[string, string]> = [[v1.self.id, v1.self.repo_path]];
    for (const [name, path] of Object.entries(v1.contacts)) {
      entries.push([name, path]);
    }
    return entries;
  }
  return Object.entries((c as LegacyConfigV0).agents).map(
    ([k, v]) => [k, v.repo_path],
  );
}

/** True if config is the new v2 format (remote-first) */
export function isConfigV2(c: Config): c is ConfigV2 {
  return 'self' in c && 'remote_repo_url' in (c as ConfigV2).self;
}

/** True if config is legacy v1 format */
export function isConfigV1(c: Config): c is LegacyConfigV1 {
  return 'self' in c && 'repo_path' in (c as LegacyConfigV1).self;
}

/** Returns self ID (null for v0 which has no self concept) */
export function getSelfId(c: Config): string | null {
  if (isConfigV2(c)) return c.self.id;
  if (isConfigV1(c)) return (c as LegacyConfigV1).self.id;
  return null;
}

/** Returns self local repo path */
export function getSelfLocalRepoPath(c: Config): string | null {
  if (isConfigV2(c)) return c.self.local_repo_path;
  if (isConfigV1(c)) return (c as LegacyConfigV1).self.repo_path;
  return null;
}

/** Returns self remote repo URL */
export function getSelfRemoteRepoUrl(c: Config): string | null {
  if (isConfigV2(c)) return c.self.remote_repo_url;
  return null;
}

/** Returns contact remote repo URL, null if not found */
export function getContactRemoteRepoUrl(c: Config, name: string): string | null {
  if (isConfigV2(c)) {
    return c.contacts[name]?.remote_repo_url ?? null;
  }
  if (isConfigV1(c)) {
    return (c as LegacyConfigV1).contacts[name] ?? null;
  }
  return null;
}

/** Returns all contact names */
export function getContactNames(c: Config): string[] {
  if (isConfigV2(c)) return Object.keys(c.contacts);
  if (isConfigV1(c)) return Object.keys((c as LegacyConfigV1).contacts);
  return [];
}

/** Returns contact's local repo path (v2: from contacts[].repo_path; v1/legacy: from contacts map) */
export function getContactRepoPath(c: Config, name: string): string | null {
  if (isConfigV2(c)) {
    return c.contacts[name]?.repo_path ?? null;
  }
  if (isConfigV1(c)) {
    return (c as LegacyConfigV1).contacts[name] ?? null;
  }
  return null;
}

/**
 * Looks up local repo path by agent name.
 * v2: self + contacts (contacts need repo_path in config)
 * v1/legacy: self and contacts all have local paths
 */
export function getAgentRepoPath(c: Config, name: string): string | null {
  if (isConfigV2(c)) {
    if (c.self.id === name) return c.self.local_repo_path;
    // v2 contacts may have explicit local paths
    return c.contacts[name]?.repo_path ?? null;
  }
  if (isConfigV1(c)) {
    const v1 = c as LegacyConfigV1;
    if (v1.self.id === name) return v1.self.repo_path;
    return v1.contacts[name] ?? null;
  }
  return (c as LegacyConfigV0).agents[name]?.repo_path ?? null;
}

/** Throws a human-readable error for an unknown agent */
export function unknownAgentError(agentName: string, config: Config): never {
  if (isConfigV2(config)) {
    const selfId = config.self.id;
    const contactsKeys = Object.keys(config.contacts);
    const hasContacts = contactsKeys.length > 0;
    let hint = '';
    if (selfId === agentName) {
      hint = `\n\nHint: "${agentName}" is your own agent ID (self). You cannot send a message to yourself.`;
    } else if (!hasContacts) {
      hint = `\n\nHint: Add to your contacts in the config file:\ncontacts:\n  ${agentName}:\n    remote_repo_url: https://github.com/USER/${agentName}-mailbox.git`;
    } else {
      hint = `\n\nHint: "${agentName}" is not in your contacts. Add:\ncontacts:\n  ${agentName}:\n    remote_repo_url: https://github.com/USER/${agentName}-mailbox.git\n\nYour current contacts: ${contactsKeys.join(', ')}`;
    }
    throw new Error(`Unknown agent: ${agentName}${hint}`);
  }
  if (isConfigV1(config)) {
    const v1 = config as LegacyConfigV1;
    const selfId = v1.self.id;
    const contactsKeys = Object.keys(v1.contacts);
    const hasContacts = contactsKeys.length > 0;
    let hint = '';
    if (selfId === agentName) {
      hint = `\n\nHint: "${agentName}" is your own agent ID (self).`;
    } else if (!hasContacts) {
      hint = `\n\nHint: Add to contacts:\ncontacts:\n  ${agentName}: /path/to/${agentName}`;
    } else {
      hint = `\n\nHint: "${agentName}" not in contacts. Add:\ncontacts:\n  ${agentName}: /path/to/${agentName}\n\nYour contacts: ${contactsKeys.join(', ')}`;
    }
    throw new Error(`Unknown agent: ${agentName}${hint}`);
  }
  const agents = Object.keys((config as LegacyConfigV0).agents);
  throw new Error(
    `Unknown agent: ${agentName}\n\nHint: "${agentName}" is not in your config.\nYour agents: ${agents.join(', ')}`,
  );
}
