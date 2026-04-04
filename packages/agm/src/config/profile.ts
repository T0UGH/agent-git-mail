/**
 * Profile resolver for V3 config.
 *
 * All AGM operations are scoped to a named profile. This module provides
 * the canonical functions for resolving a profile from config and validating
 * profile existence.
 */

import { ConfigSchemaV3, type Config, type ProfileConfig } from './schema.js';

/**
 * Resolves a named profile from a V3 config.
 * Returns the profile config if found, throws if not.
 */
export function resolveProfile(config: Config, profileName: string): ProfileConfig {
  const v3 = config as typeof config & { profiles: Record<string, ProfileConfig> };
  const profile = v3.profiles?.[profileName];
  if (!profile) {
    const available = Object.keys(v3.profiles ?? {});
    const availStr = available.length > 0 ? `\nAvailable profiles: ${available.join(', ')}` : '';
    throw new Error(`Unknown profile: ${profileName}${availStr}`);
  }
  return profile;
}

/**
 * Requires a profile name to be explicitly provided.
 * Throws with a helpful error if missing.
 */
export function requireProfile(profileName: string | null | undefined): string {
  if (!profileName) {
    const hint = `
Missing required option: --profile

Example:
  agm --profile mt send --to hex ...
  agm --profile hex daemon
`;
    throw new Error(hint.trim());
  }
  return profileName;
}

/**
 * Returns all profile names defined in the config.
 */
export function getProfileNames(config: Config): string[] {
  const v3 = config as typeof config & { profiles: Record<string, ProfileConfig> };
  return Object.keys(v3.profiles ?? {});
}

/**
 * Returns true if the profile exists in the config.
 */
export function hasProfile(config: Config, profileName: string): boolean {
  const v3 = config as typeof config & { profiles: Record<string, ProfileConfig> };
  return profileName in (v3.profiles ?? {});
}
