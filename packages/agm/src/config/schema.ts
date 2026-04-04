import { z } from 'zod';

// --- Shared config fragments (reused across profile config) ---

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

// --- Host integration (HappyClaw ingress) ---
export const HappyClawHostConfigSchema = z.object({
  base_url: z.string().default('http://127.0.0.1:3000/internal'),
  bearer_token_env: z.string().default('HAPPYCLAW_INTERNAL_SECRET'),
  target_jid: z.string(),
});

export const HostIntegrationConfigSchema = z.object({
  kind: z.literal('happyclaw'),
  happyclaw: HappyClawHostConfigSchema,
});

// --- Legacy helper exports (backward compat during migration) ---

/** Legacy V2 self config (used by bootstrap when writing V3 profile config) */
export const LegacySelfConfigSchema = z.object({
  id: z.string().min(1),
  local_repo_path: z.string().min(1),
  remote_repo_url: z.string().min(1),
});

export type LegacySelfConfig = z.infer<typeof LegacySelfConfigSchema>;

/** Legacy contact config (used during transition) */
export const LegacyContactConfigSchema = z.object({
  repo_path: z.string().optional(),
  remote_repo_url: z.string().min(1),
});

export type LegacyContactConfig = z.infer<typeof LegacyContactConfigSchema>;

/** True if config is V3 format (profile-based) */
export function isConfigV3(c: Config): c is ConfigV3 {
  return 'profiles' in c;
}

/** Legacy V2 check — always false in V3-only mode */
export function isConfigV2(_c: Config): false {
  return false;
}

/** Legacy V1 check — always false in V3-only mode */
export function isConfigV1(_c: Config): false {
  return false;
}

/** Returns self ID from a profile config */
export function getProfileSelfId(profile: ProfileConfig): string {
  return profile.self.id;
}

/** Returns self remote repo URL from a profile config */
export function getProfileSelfRemoteRepoUrl(profile: ProfileConfig): string {
  return profile.self.remote_repo_url;
}

/** Returns contact remote repo URL from a profile config */
export function getProfileContactRemoteRepoUrl(profile: ProfileConfig, name: string): string | null {
  return profile.contacts[name]?.remote_repo_url ?? null;
}

/** Returns all contact names from a profile config */
export function getProfileContactNames(profile: ProfileConfig): string[] {
  return Object.keys(profile.contacts);
}

/** Returns host_integration config from a profile config */
export function getProfileHostIntegrationConfig(profile: ProfileConfig): HostIntegrationConfig | null {
  return profile.host_integration ?? null;
}

// --- Profile config (V3) ---

// Profile self: only id + remote_repo_url (no local_repo_path — derived by AGM)
export const ProfileSelfConfigSchema = z.object({
  id: z.string().min(1, 'self.id is required'),
  remote_repo_url: z.string().min(1, 'self.remote_repo_url is required'),
});

// Profile contact: only remote_repo_url (no repo_path, no local_cache_path — derived by AGM)
export const ProfileContactConfigSchema = z.object({
  remote_repo_url: z.string().min(1, 'contact remote_repo_url is required'),
});

export const ProfileContactsConfigSchema = z.record(z.string(), ProfileContactConfigSchema);

export const ProfileSchema = z.object({
  self: ProfileSelfConfigSchema,
  contacts: ProfileContactsConfigSchema.optional().default({}),
  notifications: NotificationsConfigSchema.optional().default({}),
  runtime: RuntimeConfigSchema.optional().default({}),
  activation: ActivationConfigSchema.optional(),
  host_integration: HostIntegrationConfigSchema.optional(),
});

// --- Config V3: profiles map (only format supported — no legacy) ---

export const ConfigSchemaV3 = z.object({
  profiles: z.record(z.string(), ProfileSchema),
});

export const ConfigSchema = ConfigSchemaV3;

export type Config = z.infer<typeof ConfigSchema>;
export type ConfigV3 = z.infer<typeof ConfigSchemaV3>;
export type ProfileConfig = z.infer<typeof ProfileSchema>;
export type ProfileSelfConfig = z.infer<typeof ProfileSelfConfigSchema>;
export type ProfileContactConfig = z.infer<typeof ProfileContactConfigSchema>;
export type NotificationsConfig = z.infer<typeof NotificationsConfigSchema>;
export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;
export type ActivationConfig = z.infer<typeof ActivationConfigSchema>;
export type FeishuActivatorConfig = z.infer<typeof FeishuActivatorConfigSchema>;
export type HappyClawHostConfig = z.infer<typeof HappyClawHostConfigSchema>;
export type HostIntegrationConfig = z.infer<typeof HostIntegrationConfigSchema>;
