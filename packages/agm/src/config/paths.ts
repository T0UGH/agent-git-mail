import { homedir } from 'os';
import { resolve } from 'path';

export function getConfigPath(): string {
  const base = process.env['AGM_CONFIG_DIR'] ?? resolve(homedir(), '.config', 'agm');
  return resolve(base, 'config.yaml');
}

export function getConfigDir(): string {
  return process.env['AGM_CONFIG_DIR'] ?? resolve(homedir(), '.config', 'agm');
}
