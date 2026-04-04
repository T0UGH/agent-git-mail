/**
 * agm log CLI command.
 * Usage: agm log [--tail <n>] [--since <duration>] [--type <event_type>] [--json]
 *
 * Supports:
 *   --tail <n>     Show last N events (default: 20)
 *   --since <duration>  Show events within duration (e.g. "1h", "30m", "7d")
 *   --type <type>  Filter by event type
 *   --json         Output raw JSON lines
 */

import { parseEvents } from '../../log/events.js';
import { existsSync } from 'fs';
import { getEventsPath } from '../../config/profile-paths.js';
import type { EventType } from '../../log/event-types.js';

const EVENT_TYPES = [
  'daemon_poll_started',
  'daemon_poll_finished',
  'new_mail_detected',
  'activation_sent',
  'activation_failed',
  'activation_skipped_checkpoint',
  'pull_timeout',
  'doctor_run',
] as const;

export async function cmdLog(argv: Record<string, unknown>): Promise<void> {
  let tail = 20;
  if (argv['tail'] !== undefined) {
    const n = Number(argv['tail']);
    if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
      console.error(`--tail must be a positive integer`);
      process.exit(1);
    }
    tail = n;
  }
  const typeArg = String(argv['type'] ?? '');
  const json = argv['json'] === true;

  const profile = String(argv['profile']);

  // Validate type filter
  const types: EventType[] = [];
  if (typeArg) {
    if (!EVENT_TYPES.includes(typeArg as EventType)) {
      console.error(`Invalid event type: ${typeArg}. Valid: ${EVENT_TYPES.join(', ')}`);
      process.exit(1);
    }
    types.push(typeArg as EventType);
  }

  // Parse --since duration
  let since: Date | undefined;
  const sinceArg = argv['since'];
  if (sinceArg) {
    since = parseDuration(String(sinceArg)) ?? undefined;
    if (!since) {
      console.error(`Invalid --since value: ${sinceArg}. Use formats like 1h, 30m, 7d`);
      process.exit(1);
    }
  }

  // Check if events file exists
  if (!existsSync(getEventsPath(profile))) {
    if (json) {
      // No output for --json when empty
    } else {
      console.log('No events yet.');
    }
    return;
  }

  const events = parseEvents({ limit: tail, since, types }, profile);

  if (json) {
    // Output raw JSON lines
    for (const e of events) {
      console.log(JSON.stringify(e));
    }
    return;
  }

  // Text table output
  if (events.length === 0) {
    console.log('No events found.');
    return;
  }

  const header = 'TIMESTAMP                 TYPE                                     LEVEL   MESSAGE';
  console.log(header);
  console.log('-'.repeat(header.length));

  for (const e of events) {
    const ts = e.ts.slice(0, 19).replace('T', ' ');
    const type = e.type.padEnd(40);
    const level = e.level.padEnd(7);
    const msg = e.message.slice(0, 50);
    console.log(`${ts}  ${type}  ${level}  ${msg}`);
  }
}

/** Parse duration strings like "1h", "30m", "7d" into a Date. */
function parseDuration(s: string): Date | null {
  const m = s.match(/^(\d+)([hmd])$/);
  if (!m) return null;
  const value = parseInt(m[1], 10);
  const unit = m[2];
  const now = Date.now();
  switch (unit) {
    case 'h': return new Date(now - value * 60 * 60 * 1000);
    case 'm': return new Date(now - value * 60 * 1000);
    case 'd': return new Date(now - value * 24 * 60 * 60 * 1000);
    default: return null;
  }
}
