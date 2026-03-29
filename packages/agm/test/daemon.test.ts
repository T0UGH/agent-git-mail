import { describe, it, expect, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runDaemon } from '../src/app/run-daemon.js';
import type { Config } from '../src/config/schema.js';

describe('daemon', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'agm-daemon-test-'));
  let repoPath: string;

  beforeEach(() => {
    repoPath = join(tmp, `repo-${Date.now()}`);
    execSync(
      `mkdir ${repoPath} && cd ${repoPath} && git init && git config user.email "test@test.com" && git config user.name "test" && mkdir -p inbox && echo "initial" > f.txt && git add f.txt && git commit -m "init"`,
      { encoding: 'utf-8' },
    );
  });

  it('first start sets waterline without notifying', async () => {
    const config: Config = {
      agents: {
        mt: { repo_path: repoPath },
      },
    };

    const events: { agent: string; filename: string; from: string }[] = [];
    await runDaemon({
      config,
      agentName: 'mt',
      onNewMail: async (mail) => { events.push(mail); },
    });

    expect(events).toHaveLength(0);
  });

  it('detects new inbox file via git diff', async () => {
    // Create initial waterline
    const sha = execSync('git -C ' + repoPath + ' rev-parse HEAD', { encoding: 'utf-8' }).trim();
    execSync('git -C ' + repoPath + ' update-ref refs/agm/last-seen ' + sha, { encoding: 'utf-8' });

    // Add new inbox file
    execSync(
      `cd ${repoPath} && echo "---" > inbox/test.md && echo "from: hex" >> inbox/test.md && echo "to: mt" >> inbox/test.md && echo "subject: hi" >> inbox/test.md && echo "created_at: 2026-03-29T14:00:00+08:00" >> inbox/test.md && echo "expects_reply: false" >> inbox/test.md && echo "---" >> inbox/test.md && echo "" >> inbox/test.md && echo "body" >> inbox/test.md && git add inbox/test.md && git commit -m "new mail"`,
      { encoding: 'utf-8' },
    );

    const config: Config = {
      agents: { mt: { repo_path: repoPath } },
    };

    const events: { agent: string; filename: string; from: string }[] = [];
    await runDaemon({
      config,
      agentName: 'mt',
      onNewMail: async (mail) => { events.push(mail); },
    });

    expect(events).toHaveLength(1);
    expect(events[0].filename).toBe('test.md');
    expect(events[0].from).toBe('hex');
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });
});
