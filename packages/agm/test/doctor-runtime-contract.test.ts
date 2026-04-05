import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { checkRuntime } from '../src/doctor/checks/runtime.js';
import { getEventsPath } from '../src/config/profile-paths.js';

describe('doctor runtime contract', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'agm-doctor-test-'));
  let profile: string;

  beforeEach(() => {
    process.env.AGM_BASE_DIR = tmp;
    profile = 'mt';
    // Clear any pre-existing events file so each test starts fresh
    const eventsPath = getEventsPath(profile);
    if (existsSync(eventsPath)) {
      unlinkSync(eventsPath);
    }
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function writeEvent(type: string, level: string, message: string, details?: Record<string, unknown>): void {
    const eventsPath = getEventsPath(profile);
    const record = {
      ts: new Date().toISOString(),
      type,
      level,
      self_id: 'mt',
      message,
      ...(details ? { details } : {}),
    };
    writeFileSync(eventsPath, JSON.stringify(record) + '\n', { flag: 'a' });
  }

  it('reports FAIL when no recent daemon activity', () => {
    const results = checkRuntime(profile);
    const daemonResult = results.find(r => r.name === 'daemon_recent');
    expect(daemonResult?.status).toBe('FAIL');
    expect(daemonResult?.code).toBe('NO_RECENT_DAEMON_ACTIVITY');
  });

  it('reports OK when daemon recently active', () => {
    writeEvent('daemon_poll_started', 'info', 'daemon poll started');
    const results = checkRuntime(profile);
    const daemonResult = results.find(r => r.name === 'daemon_recent');
    expect(daemonResult?.status).toBe('OK');
    expect(daemonResult?.code).toBe('OK');
  });

  it('reports OK when last activation was sent', () => {
    writeEvent('activation_sent', 'info', 'activation sent: test.md');
    const results = checkRuntime(profile);
    const actResult = results.find(r => r.name === 'last_activation');
    expect(actResult?.status).toBe('OK');
    expect(actResult?.code).toBe('OK');
  });

  it('reports FAIL when last activation retries exhausted', () => {
    writeEvent('activation_retries_exhausted', 'error', 'activation retries exhausted: test.md', {
      attempts: 5,
      error: 'connection refused',
    });
    const results = checkRuntime(profile);
    const actResult = results.find(r => r.name === 'last_activation');
    expect(actResult?.status).toBe('FAIL');
    expect(actResult?.code).toBe('ACTIVATION_RETRIES_EXHAUSTED');
  });

  it('reports FAIL when last activation failed', () => {
    writeEvent('activation_failed', 'error', 'activation failed: test.md', {
      error: 'HTTP 500',
    });
    const results = checkRuntime(profile);
    const actResult = results.find(r => r.name === 'last_activation');
    expect(actResult?.status).toBe('FAIL');
    expect(actResult?.code).toBe('LAST_ACTIVATION_FAILED');
  });

  it('reports WARN when recent activation retries occurred', () => {
    writeEvent('activation_retrying', 'warn', 'activation retry 1/4: test.md');
    writeEvent('activation_retrying', 'warn', 'activation retry 2/4: test.md');
    const results = checkRuntime(profile);
    const retryResult = results.find(r => r.name === 'activation_retries_recent');
    expect(retryResult?.status).toBe('WARN');
    expect(retryResult?.code).toBe('RECENT_ACTIVATION_RETRIES');
    expect(retryResult?.details?.count).toBe(2);
  });

  it('reports OK when no recent pull timeouts', () => {
    writeEvent('daemon_poll_started', 'info', 'daemon poll started');
    const results = checkRuntime(profile);
    const timeoutResult = results.find(r => r.name === 'pull_timeout_recent');
    expect(timeoutResult?.status).toBe('OK');
    expect(timeoutResult?.code).toBe('OK');
  });

  it('reports WARN when recent pull timeout occurred', () => {
    writeEvent('daemon_poll_started', 'info', 'daemon poll started');
    writeEvent('pull_timeout', 'warn', 'git pull timed out for mt');
    const results = checkRuntime(profile);
    const timeoutResult = results.find(r => r.name === 'pull_timeout_recent');
    expect(timeoutResult?.status).toBe('WARN');
    expect(timeoutResult?.code).toBe('RECENT_PULL_TIMEOUTS');
  });

  it('reports WARN when recent push failure occurred', () => {
    writeEvent('push_failed', 'error', 'push failed: test.md', { error: 'connection refused' });
    const results = checkRuntime(profile);
    const pushResult = results.find(r => r.name === 'push_failure_recent');
    expect(pushResult?.status).toBe('WARN');
    expect(pushResult?.code).toBe('RECENT_PUSH_FAILURES');
  });

  it('reports WARN when recent pull failure occurred', () => {
    writeEvent('pull_failed', 'error', 'pull failed', { error: ' authentication failed' });
    const results = checkRuntime(profile);
    const pullResult = results.find(r => r.name === 'pull_failure_recent');
    expect(pullResult?.status).toBe('WARN');
    expect(pullResult?.code).toBe('RECENT_PULL_FAILURES');
  });

  it('reports WARN when recent remote-advance event occurred', () => {
    writeEvent('remote_advanced', 'warn', 'remote advanced before push');
    const results = checkRuntime(profile);
    const remoteResult = results.find(r => r.name === 'remote_advance_recent');
    expect(remoteResult?.status).toBe('WARN');
    expect(remoteResult?.code).toBe('RECENT_REMOTE_ADVANCE');
  });
});
