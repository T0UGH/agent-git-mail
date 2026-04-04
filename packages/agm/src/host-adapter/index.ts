/**
 * Host adapter factory.
 * Creates the appropriate host adapter based on the active configuration.
 *
 * Supports:
 * - HappyClaw ingress (host_integration.kind === 'happyclaw')
 * - OpenClaw external activator (activation.enabled === true)
 */

import type { HostAdapter } from './types.js';
import { createHappyClawIngressAdapter } from './happyclaw-ingress.js';
import { getHostIntegrationConfig } from '../config/index.js';
import type { Config } from '../config/schema.js';

export { type HostAdapter, type MailboxEventInput, type HostAdapterResult } from './types.js';

/**
 * Try to create a HappyClaw ingress adapter from host_integration config.
 * Returns null if host_integration is not configured or env token is missing.
 */
export function createHappyClawAdapter(config: Config): HostAdapter | null {
  const hostConfig = getHostIntegrationConfig(config);
  if (!hostConfig) return null;

  if (hostConfig.kind !== 'happyclaw') return null;

  const token = process.env[hostConfig.happyclaw.bearer_token_env];
  if (!token) {
    console.warn(
      `[host-adapter] ${hostConfig.happyclaw.bearer_token_env} env not set, skipping HappyClaw ingress`,
    );
    return null;
  }

  return createHappyClawIngressAdapter({
    baseUrl: hostConfig.happyclaw.base_url,
    bearerToken: token,
    targetJid: hostConfig.happyclaw.target_jid,
  });
}
