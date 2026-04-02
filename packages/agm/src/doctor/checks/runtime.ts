/**
 * Doctor checks: runtime
 * Validates recent daemon activity, last activation result, and pull timeouts.
 * Reads from events.jsonl (not from daemon process state).
 */

import { parseEvents, queryLastEvent } from '../../log/events.js';
import type { CheckResult } from '../types.js';

const RECENT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function recentWindow(): Date {
  return new Date(Date.now() - RECENT_WINDOW_MS);
}

/** Returns events from the recent window, newest first. */
function recentEvents() {
  return parseEvents({ since: recentWindow() });
}

export function checkRuntime(): CheckResult[] {
  const results: CheckResult[] = [];

  // Check: recent daemon activity
  const daemonEvents = recentEvents().filter(e =>
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
  const lastActivation = queryLastEvent('activation_sent')
    ?? queryLastEvent('activation_failed');

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
  } else if (lastActivation.type === 'activation_failed') {
    results.push({
      name: 'last_activation',
      status: 'FAIL',
      code: 'LAST_ACTIVATION_FAILED',
      message: `last activation failed: ${lastActivation.message}`,
      details: { error: lastActivation.details?.error, ts: lastActivation.ts },
    });
  }

  // Check: recent pull timeouts
  const recentTimeouts = recentEvents().filter(e => e.type === 'pull_timeout');
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
