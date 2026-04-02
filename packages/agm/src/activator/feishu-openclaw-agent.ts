/**
 * Feishu activator via `openclaw agent` CLI.
 * Sends a wake-up message to the target agent's Feishu DM
 * using the `openclaw agent --channel feishu -t <openId> -m <message> --deliver` command.
 */

import { execFileSync } from 'child_process';
import { AgmActivator, ActivationInput, ActivationResult } from './types.js';

export interface FeishuActivatorConfig {
  openId: string;
  messageTemplate: string;
}

/** Render template with {{filename}}, {{from}}, {{subject}} placeholders */
function renderTemplate(template: string, input: ActivationInput): string {
  return template
    .replace(/\{\{filename\}\}/g, input.filename)
    .replace(/\{\{from\}\}/g, input.from)
    .replace(/\{\{subject\}\}/g, input.subject ?? '');
}

export function createFeishuOpenclawAgent(
  config: FeishuActivatorConfig
): AgmActivator {
  return {
    name: 'feishu-openclaw-agent',

    async activate(input: ActivationInput): Promise<ActivationResult> {
      const message = renderTemplate(config.messageTemplate, input);
      const escapedMessage = message.replace(/"/g, '\\"').replace(/\n/g, '\\n');
      const escapedOpenId = config.openId.replace(/"/g, '\\"');

      try {
        execFileSync('openclaw', [
          'agent',
          '--channel', 'feishu',
          '-t', escapedOpenId,
          '-m', escapedMessage,
          '--deliver',
        ], {
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 30_000,
        });
        return {
          ok: true,
          activator: 'feishu-openclaw-agent',
          externalId: null,
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          activator: 'feishu-openclaw-agent',
          externalId: null,
          error,
        };
      }
    },
  };
}
