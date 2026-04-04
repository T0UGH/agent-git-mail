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
  error?: string;
}

export interface HostAdapter {
  name: string;
  deliverMailboxEvent(input: MailboxEventInput): Promise<HostAdapterResult>;
}
