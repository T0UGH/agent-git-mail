import { readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { ConfigSchema, type Config } from './schema.js';
import { getConfigPath } from './paths.js';

export function loadConfig(configPath?: string): Config {
  const path = configPath ?? getConfigPath();
  const raw = readFileSync(path, 'utf-8');
  const parsed = parseYaml(raw);
  return ConfigSchema.parse(parsed);
}

export function loadConfigSafe(configPath?: string): { ok: true; data: Config } | { ok: false; error: unknown } {
  try {
    return { ok: true, data: loadConfig(configPath) };
  } catch (e) {
    return { ok: false, error: e };
  }
}
