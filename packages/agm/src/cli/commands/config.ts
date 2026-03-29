import { loadConfigSafe } from '../../config/load.js';
import { getConfigPath } from '../../config/paths.js';
import { writeFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';

export async function cmdConfigShow(): Promise<void> {
  const result = loadConfigSafe();
  if (!result.ok) {
    console.error('Failed to load config:', result.error);
    process.exit(1);
  }
  console.log(JSON.stringify(result.data, null, 2));
}

export async function cmdConfigGet(key: string): Promise<void> {
  const result = loadConfigSafe();
  if (!result.ok) {
    console.error('Failed to load config:', result.error);
    process.exit(1);
  }
  // Navigate dot-notation key
  const keys = key.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let val: any = result.data;
  for (const k of keys) {
    val = val?.[k];
  }
  console.log(val ?? '');
}

export async function cmdConfigSet(key: string, value: string): Promise<void> {
  const result = loadConfigSafe();
  if (!result.ok) {
    console.error('Failed to load config:', result.error);
    process.exit(1);
  }
  const config = result.data;
  // Navigate and set
  const keys = key.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let obj: any = config;
  for (let i = 0; i < keys.length - 1; i++) {
    obj[keys[i]] = obj[keys[i]] ?? {};
    obj = obj[keys[i]];
  }
  obj[keys[keys.length - 1]] = value;
  const path = getConfigPath();
  writeFileSync(path, parseYaml(JSON.stringify(config)), 'utf-8');
  console.log(`Set ${key} = ${value} in ${path}`);
}
