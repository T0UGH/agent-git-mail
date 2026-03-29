import { z } from 'zod';

export const AgentConfigSchema = z.object({
  repo_path: z.string(),
});

export const ConfigSchema = z.object({
  agents: z.record(z.string(), AgentConfigSchema),
  runtime: z.object({
    poll_interval_seconds: z.number().optional().default(30),
  }).optional().default({}),
});

export type Config = z.infer<typeof ConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
