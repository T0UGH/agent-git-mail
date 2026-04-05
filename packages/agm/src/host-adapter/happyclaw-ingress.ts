/**
 * HappyClaw ingress adapter.
 * Sends mailbox events to HappyClaw via POST /internal/agm/ingress.
 */

import type { HostAdapter, HostAdapterResult, MailboxEventInput } from './types.js';

export interface HappyClawIngressConfig {
  baseUrl: string;
  bearerToken: string;
  targetJid: string;
}

export function createHappyClawIngressAdapter(
  config: HappyClawIngressConfig,
): HostAdapter {
  return {
    name: 'happyclaw-ingress',

    async deliverMailboxEvent(input: MailboxEventInput): Promise<HostAdapterResult> {
      try {
        const res = await fetch(`${config.baseUrl}/agm/ingress`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Secret': config.bearerToken,
          },
          body: JSON.stringify({
            targetJid: config.targetJid,
            source: 'agm',
            sourceMeta: {
              mailboxId: input.selfId,
              messageId: input.messageId,
              from: input.from,
              subject: input.subject ?? '',
              reason: 'new_mail',
            },
            content: input.content,
          }),
        });

        if (!res.ok) {
          let errorBody = '';
          try {
            const json = (await res.json()) as { error?: string };
            errorBody = json.error ?? (await res.text());
          } catch {
            errorBody = await res.text();
          }
          // HTTP 5xx = server-side error = retryable; HTTP 4xx = client error = fail-fast
          const retryable = res.status >= 500;
          return { ok: false, retryable, error: `HTTP ${res.status}: ${errorBody}` };
        }

        const data = (await res.json()) as { ok?: boolean; messageId?: string; error?: string };
        return {
          ok: data.ok === true,
          externalId: data.messageId,
          error: data.ok !== true ? data.error : undefined,
        };
      } catch (err) {
        // Network error (fetch throws) = retryable
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, retryable: true, error: message };
      }
    },
  };
}
