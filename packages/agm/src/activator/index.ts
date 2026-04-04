/**
 * Activator factory.
 * Creates an activator instance based on the activation config section.
 */

import { AgmActivator } from './types.js';
import { createFeishuOpenclawAgent, FeishuActivatorConfig } from './feishu-openclaw-agent.js';
import { resolveProfile } from '../config/profile.js';
import type { Config } from '../config/schema.js';
import type { ActivationConfig } from '../config/schema.js';

export { AgmActivator, ActivationInput, ActivationResult } from './types.js';
export { hasActivated, markActivated } from './checkpoint-store.js';

export function isActivationEnabled(c: Config, profileName: string): boolean {
  const profile = resolveProfile(c, profileName);
  return !!(profile.activation?.enabled);
}

export function createActivator(config: Config, profileName: string): AgmActivator | null {
  const profile = resolveProfile(config, profileName);
  const act = profile.activation as ActivationConfig | undefined;
  if (!act?.enabled) return null;

  if (act.activator === 'feishu-openclaw-agent') {
    return createFeishuOpenclawAgent(act.feishu);
  }

  return null;
}
