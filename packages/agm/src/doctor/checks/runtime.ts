/**
 * Doctor checks: runtime
 * Validates recent daemon activity, last activation result, and pull timeouts.
 * Reads from events.jsonl (not from daemon process state).
 */

import { parseEvents } from '../../log/events.js';
import type { EventRecord } from '../../log/event-types.js';
import type { CheckResult } from '../types.js';

const RECENT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function recentWindow(): Date {
  return new Date(Date.now() - RECENT_WINDOW_MS);
}

/** Returns events from the recent window, newest first. */
function recentEvents(profile: string) {
  return parseEvents({ since: recentWindow() }, profile);
}

export function checkRuntime(profile: string): CheckResult[] {
  const results: CheckResult[] = [];

  // Check: recent daemon activity
  const daemonEvents = recentEvents(profile).filter(e =>
    e.type === 'daemon_poll_started' || e.type === 'daemon_poll_finished'
  );

  if (daemonEvents.length === 0) {
    results.push({
      name: 'daemon_recent',
      status: 'FAIL',
      code: 'NO_RECENT_DAEMON_ACTIVITY',
      message: `no daemon activity in last 10 minutes`,
      details: { window_minutes: 10 },
    });
  } else {
    const last = daemonEvents[0];
    results.push({
      name: 'daemon_recent',
      status: 'OK',
      code: 'OK',
      message: `daemon last active ${last.ts}`,
      details: { last_event_type: last.type, ts: last.ts },
    });
  }

  // Check: last activation result
  // Get ALL activation-related events (excluding transient 'retrying') and take the truly latest by timestamp
  const activationEvents = recentEvents(profile).filter(e =>
    e.type === 'activation_sent' ||
    e.type === 'activation_failed' ||
    e.type === 'activation_skipped_checkpoint' ||
    e.type === 'activation_retries_exhausted'
  );
  const lastActivation = activationEvents[0] ?? null;

  if (!lastActivation) {
    results.push({
      name: 'last_activation',
      status: 'WARN',
      code: 'NO_RECENT_ACTIVATION',
      message: 'no recent activation events found',
    });
  } else if (lastActivation.type === 'activation_sent') {
    results.push({
      name: 'last_activation',
      status: 'OK',
      code: 'OK',
      message: `last activation sent at ${lastActivation.ts}`,
      details: { filename: lastActivation.filename, ts: lastActivation.ts },
    });
  } else if (lastActivation.type === 'activation_retries_exhausted') {
    results.push({
      name: 'last_activation',
      status: 'FAIL',
      code: 'ACTIVATION_RETRIES_EXHAUSTED',
      message: `activation retries exhausted: ${lastActivation.message}`,
      details: { error: lastActivation.details?.error, attempts: lastActivation.details?.attempts, ts: lastActivation.ts },
    });
  } else if (lastActivation.type === 'activation_failed') {
    results.push({
      name: 'last_activation',
      status: 'FAIL',
      code: 'LAST_ACTIVATION_FAILED',
      message: `last activation failed: ${lastActivation.message}`,
      details: { error: lastActivation.details?.error, ts: lastActivation.ts },
    });
  } else {
    // activation_skipped — not a failure, but worth noting
    results.push({
      name: 'last_activation',
      status: 'OK',
      code: 'OK',
      message: `last activation skipped (checkpoint) at ${lastActivation.ts}`,
      details: { filename: lastActivation.filename, ts: lastActivation.ts },
    });
  }

  // Check: recent activation retries (indicates transient delivery problems)
  const retryEvents = recentEvents(profile).filter(e => e.type === 'activation_retrying');
  if (retryEvents.length > 0) {
    results.push({
      name: 'activation_retries_recent',
      status: 'WARN',
      code: 'RECENT_ACTIVATION_RETRIES',
      message: `${retryEvents.length} activation retry attempt(s) in last 10 minutes`,
      details: { count: retryEvents.length, last_ts: retryEvents[0].ts },
    });
  }

  // Check: recent pull timeouts
  const recentTimeouts = recentEvents(profile).filter(e => e.type === 'pull_timeout');
  if (recentTimeouts.length > 0) {
    results.push({
      name: 'pull_timeout_recent',
      status: 'WARN',
      code: 'RECENT_PULL_TIMEOUTS',
      message: `${recentTimeouts.length} pull timeout(s) in last 10 minutes`,
      details: { count: recentTimeouts.length, last_ts: recentTimeouts[0].ts },
    });
  } else {
    results.push({
      name: 'pull_timeout_recent',
      status: 'OK',
      code: 'OK',
      message: 'no recent pull timeouts',
    });
  }

  return results;
}
