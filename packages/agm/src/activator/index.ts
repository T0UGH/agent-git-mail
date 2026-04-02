/**
 * Activator factory.
 * Creates an activator instance based on the activation config section.
 */

import { AgmActivator } from './types.js';
import { createFeishuOpenclawAgent, FeishuActivatorConfig } from './feishu-openclaw-agent.js';
import { Config } from '../config/schema.js';
import { isConfigV2 } from '../config/schema.js';

export interface ActivationConfig {
  enabled: boolean;
  activator: 'feishu-openclaw-agent';
  dedupe_mode: 'filename';
  feishu: FeishuActivatorConfig;
}

export function isActivationEnabled(c: Config): c is Config & { activation: ActivationConfig } {
  if (!isConfigV2(c)) return false;
  return !!(c as any).activation?.enabled;
}

export function createActivator(config: Config): AgmActivator | null {
  if (!isConfigV2(config)) return null;
  const act = (config as any).activation as ActivationConfig | undefined;
  if (!act?.enabled) return null;

  if (act.activator === 'feishu-openclaw-agent') {
    return createFeishuOpenclawAgent(act.feishu);
  }

  return null;
}

export { AgmActivator, ActivationInput, ActivationResult } from './types.js';
export { hasActivated, markActivated } from './checkpoint-store.js';
