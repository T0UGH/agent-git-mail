/**
 * Append-only structured event log.
 * Events are appended to ~/.config/agm/state/<profile>/events.jsonl (one JSON line per event).
 */

import { appendFileSync, existsSync, readFileSync } from 'fs';
import { dirname } from 'path';
import { mkdirSync } from 'fs';
import { getEventsPath } from '../config/profile-paths.js';
import type { EventRecord, EventType } from './event-types.js';

/** Append a single event (append-only, no tmp+rename). */
export function appendEvent(event: EventRecord, profile: string): void {
  const path = getEventsPath(profile);
  // Ensure directory exists
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const line = JSON.stringify(event) + '\n';
  appendFileSync(path, line, 'utf-8');
}

/** Parse all events from the log, optionally filtered. */
export function parseEvents(
  opts?: {
    limit?: number;
    since?: Date;
    types?: EventType[];
  },
  profile?: string,
): EventRecord[] {
  if (!profile) return [];
  const path = getEventsPath(profile);
  if (!existsSync(path)) return [];

  const raw = readFileSync(path, 'utf-8');
  const lines = raw.split('\n').filter(Boolean);

  const events: EventRecord[] = [];
  const reversed = [...lines].reverse(); // newest first

  for (const line of reversed) {
    let event: EventRecord;
    try {
      event = JSON.parse(line) as EventRecord;
    } catch {
      continue; // skip malformed lines
    }

    // Filter by type
    if (opts?.types && opts.types.length > 0) {
      if (!opts.types.includes(event.type)) continue;
    }

    // Filter by time
    if (opts?.since) {
      const eventTime = new Date(event.ts);
      if (isNaN(eventTime.getTime()) || eventTime < opts.since) continue;
    }

    events.push(event);

    // Apply limit (newest first, stop after limit)
    if (opts?.limit && events.length >= opts.limit) break;
  }

  return events; // already in reverse order (newest first)
}

/** Query the last event of a specific type, or null if none. */
export function queryLastEvent(type: EventType, profile: string): EventRecord | null {
  const events = parseEvents({ limit: 1, types: [type] }, profile);
  return events[0] ?? null;
}
