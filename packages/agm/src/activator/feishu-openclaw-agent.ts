/**
 * Feishu activator via `openclaw agent` CLI.
 * Sends a wake-up message to the target agent's Feishu DM
 * using the `openclaw agent --channel feishu -t <openId> -m <message> --deliver` command.
 */

import { execFileSync } from 'child_process';
import { AgmActivator, ActivationInput, ActivationResult } from './types.js';

export interface FeishuActivatorConfig {
  open_id: string;
  message_template: string;
}

/** Render template with {{filename}}, {{from}}, {{subject}} placeholders */
function renderTemplate(template: string, input: ActivationInput): string {
  return template
    .replace(/\{\{filename\}\}/g, input.filename)
    .replace(/\{\{from\}\}/g, input.from)
    .replace(/\{\{subject\}\}/g, input.subject ?? '');
}

/** Classify exec errors: ENOENT/EACCES = fail-fast (permanent), others = retryable (transient) */
function classifyError(err: unknown): boolean {
  if (err instanceof Error && 'code' in err) {
    const code = (err as { code: string }).code;
    // Permanent errors: command not found, permission denied
    if (code === 'ENOENT' || code === 'EACCES') return false;
  }
  // Non-zero exit code from openclaw, timeout, etc. = retryable
  return true;
}

export function createFeishuOpenclawAgent(
  config: FeishuActivatorConfig
): AgmActivator {
  return {
    name: 'feishu-openclaw-agent',

    async activate(input: ActivationInput): Promise<ActivationResult> {
      const message = renderTemplate(config.message_template, input);

      try {
        execFileSync('openclaw', [
          'agent',
          '--channel', 'feishu',
          '-t', config.open_id,
          '-m', message,
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
        const retryable = classifyError(err);
        return {
          ok: false,
          retryable,
          activator: 'feishu-openclaw-agent',
          externalId: null,
          error,
        };
      }
    },
  };
}
