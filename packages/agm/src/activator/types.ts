/**
 * AgmActivator interface and related types.
 * An activator is responsible for sending a wake-up message to a remote agent
 * when new mail is detected in the local inbox.
 */

export interface ActivationInput {
  selfId: string;
  filename: string;
  from: string;
  subject?: string | null;
  /** The rendered activation message to send */
  message: string;
}

export interface ActivationResult {
  ok: boolean;
  activator: string;
  externalId?: string | null;
  error?: string | null;
}

export interface AgmActivator {
  name: string;
  activate(input: ActivationInput): Promise<ActivationResult>;
}
