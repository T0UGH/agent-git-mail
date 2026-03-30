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

export const ConfigSchemaV1 = z.object({
  self: SelfConfigSchema,
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

/** True if the config is the new v1 format (has self) */
export function isConfigV1(c: Config): c is ConfigV1 {
  return 'self' in c;
}

/** Returns agent entries regardless of config format (v0 or v1) */
export function getAgentEntries(c: Config): Array<[string, string]> {
  if (isConfigV1(c)) {
    return [[c.self.id, c.self.repo_path]];
  }
  return Object.entries(c.agents as Record<string, { repo_path: string }>).map(
    ([k, v]) => [k, v.repo_path],
  );
}

/** Looks up repo_path by agent name, returns null if not found */
export function getAgentRepoPath(c: Config, name: string): string | null {
  if (isConfigV1(c)) {
    return c.self.id === name ? c.self.repo_path : null;
  }
  return (c.agents as Record<string, { repo_path: string }>)[name]?.repo_path ?? null;
}
