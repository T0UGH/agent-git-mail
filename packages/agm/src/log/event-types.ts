/**
 * Structured event types for AGM runtime observability.
 * Written by daemon and activation paths; read by doctor and log commands.
 */

export const EVENT_TYPES = [
  'daemon_poll_started',
  'daemon_poll_finished',
  'new_mail_detected',
  'activation_sent',
  'activation_failed',
  'activation_skipped_checkpoint',
  'activation_retrying',
  'activation_retries_exhausted',
  'push_failed',
  'pull_failed',
  'remote_advanced',
  'delivery_partial_failure',
  'pull_timeout',
  'doctor_run',
] as const;

export type EventType = typeof EVENT_TYPES[number];

export type EventLevel = 'info' | 'warn' | 'error';

export interface EventRecord {
  ts: string;           // ISO timestamp, always present
  type: EventType;      // stable event type
  level: EventLevel;     // info | warn | error
  self_id: string;       // agent self ID
  filename?: string;      // mail filename, if applicable
  message: string;       // short human-readable summary
  details?: Record<string, unknown>;  // extra fields
}
