import { loadConfigSafe } from '../../config/load.js';
import { getConfigPath } from '../../config/paths.js';
import { resolveProfile } from '../../config/profile.js';
import { writeFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';

/**
 * Navigate a dot-notation key path starting from a given root object.
 * Returns undefined if the path does not exist.
 */
function navigate(root: Record<string, unknown>, key: string): unknown {
  const keys = key.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let val: any = root;
  for (const k of keys) {
    val = val?.[k];
  }
  return val;
}

/**
 * Set a dot-notation key path on a given root object, creating intermediate
 * objects as needed.
 */
function setPath(root: Record<string, unknown>, key: string, value: string): void {
  const keys = key.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let obj: any = root;
  for (let i = 0; i < keys.length - 1; i++) {
    obj[keys[i]] = obj[keys[i]] ?? {};
    obj = obj[keys[i]];
  }
  obj[keys[keys.length - 1]] = value;
}

export async function cmdConfigShow(profile: string): Promise<void> {
  const result = loadConfigSafe();
  if (!result.ok) {
    console.error('Failed to load config:', result.error);
    process.exit(1);
  }
  const profileConfig = resolveProfile(result.data, profile);
  console.log(JSON.stringify(profileConfig, null, 2));
}

export async function cmdConfigGet(profile: string, key: string): Promise<void> {
  const result = loadConfigSafe();
  if (!result.ok) {
    console.error('Failed to load config:', result.error);
    process.exit(1);
  }
  // Resolve the profile root and navigate from there
  const profileConfig = resolveProfile(result.data, profile);
  const val = navigate(profileConfig as Record<string, unknown>, key);
  console.log(val ?? '');
}

export async function cmdConfigSet(profile: string, key: string, value: string): Promise<void> {
  const result = loadConfigSafe();
  if (!result.ok) {
    console.error('Failed to load config:', result.error);
    process.exit(1);
  }
  // Work directly on the profiles.<profile> object in the full config
  const v3 = result.data as { profiles?: Record<string, Record<string, unknown>> };
  if (!v3.profiles || !(profile in v3.profiles)) {
    console.error(`Profile not found: ${profile}`);
    process.exit(1);
  }
  const profileRoot = v3.profiles[profile];
  setPath(profileRoot, key, value);
  const path = getConfigPath();
  writeFileSync(path, parseYaml(JSON.stringify(result.data)), 'utf-8');
  console.log(`Set ${key} = ${value} in profile ${profile} (${path})`);
}
