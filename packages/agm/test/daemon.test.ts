import { describe, it, expect, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runDaemon } from '../src/app/run-daemon.js';

describe('daemon', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'agm-daemon-test-'));
  let repoPath: string;

  beforeEach(() => {
    // Point AGM_BASE_DIR to the test temp dir so V3 path resolution finds our repo.
    // V3: getSelfRepoPath('mt') → {AGM_BASE_DIR}/profiles/mt/self
    process.env.AGM_BASE_DIR = tmp;

    // Create a fresh repo at the V3-derived path for each test.
    const v3RepoPath = join(tmp, 'profiles', 'mt', 'self');
    rmSync(v3RepoPath, { recursive: true, force: true });
    execSync(`mkdir -p "${v3RepoPath}" && git -C "${v3RepoPath}" init && git -C "${v3RepoPath}" config user.email 'test@test.com' && git -C "${v3RepoPath}" config user.name 'test' && mkdir -p "${v3RepoPath}/inbox" "${v3RepoPath}/outbox" "${v3RepoPath}/archive" && echo "initial" > "${v3RepoPath}/f.txt" && git -C "${v3RepoPath}" add f.txt && git -C "${v3RepoPath}" commit -m "init"`, { encoding: 'utf-8' });

    // Update repoPath to the V3 path for test assertions
    repoPath = v3RepoPath;
  });

  it('first start sets waterline without notifying', async () => {
    const config = {
      profiles: {
        mt: {
          self: { id: 'mt', remote_repo_url: 'https://github.com/test/mt.git' },
          contacts: {},
          notifications: { default_target: 'main', bind_session_key: null, forced_session_key: null },
          runtime: { poll_interval_seconds: 30 },
        }
      }
    };

    const events: { agent: string; filename: string; from: string }[] = [];
    await runDaemon({
      config,
      profile: 'mt',
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

    const config = {
      profiles: {
        mt: {
          self: { id: 'mt', remote_repo_url: 'https://github.com/test/mt.git' },
          contacts: {},
          notifications: { default_target: 'main', bind_session_key: null, forced_session_key: null },
          runtime: { poll_interval_seconds: 30 },
        }
      }
    };

    const events: { agent: string; filename: string; from: string }[] = [];
    await runDaemon({
      config,
      profile: 'mt',
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
