/**
 * Host adapter types.
 * Unified interface for delivering AGM mailbox events to the host runtime.
 */

export interface MailboxEventInput {
  selfId: string;
  targetJid: string;
  messageId: string;
  from: string;
  subject?: string;
  content: string;
}

export interface HostAdapterResult {
  ok: boolean;
  externalId?: string;
  /** If false, this failure is permanent and should not be retried. Defaults to true. */
  retryable?: boolean;
  error?: string;
}

export interface HostAdapter {
  name: string;
  deliverMailboxEvent(input: MailboxEventInput): Promise<HostAdapterResult>;
}
