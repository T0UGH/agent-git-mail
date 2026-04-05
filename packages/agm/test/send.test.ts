import { describe, it, expect, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { sendMessage } from '../src/app/send-message.js';
import { stringify } from 'yaml';

// V3 format - profile-based config
function makeConfigV3(repo1: string, repo2: string, name1: string, name2: string): object {
  return {
    profiles: {
      [name1]: {
        self: { id: name1, remote_repo_url: 'https://github.com/test/' + name1 + '.git' },
        contacts: { [name2]: { remote_repo_url: 'https://github.com/test/' + name2 + '.git' } },
        notifications: { default_target: 'main', bind_session_key: null, forced_session_key: null },
        runtime: { poll_interval_seconds: 30 },
      }
    }
  };
}

function initRepo(repoPath: string, email: string, name: string): void {
  // Clean slate for each init
  rmSync(repoPath, { recursive: true, force: true });
  execSync(`mkdir -p "${repoPath}"`, { encoding: 'utf-8' });
  execSync(`git init --initial-branch=main`, { cwd: repoPath, encoding: 'utf-8' });
  execSync(`git config user.email '${email}'`, { cwd: repoPath, encoding: 'utf-8' });
  execSync(`git config user.name '${name}'`, { cwd: repoPath, encoding: 'utf-8' });
  execSync(`mkdir -p "${repoPath}/inbox" "${repoPath}/outbox" "${repoPath}/archive"`, { encoding: 'utf-8' });
  execSync(`echo "init" > "${repoPath}/.init" && git -C "${repoPath}" add .init && git -C "${repoPath}" commit -m "init"`, { encoding: 'utf-8' });
}

describe('send (mailbox model)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'agm-send-test-'));
  let mtRepo: string;
  let hexRepo: string;
  let configPath: string;
  let bodyFile: string;
  let mtSelfRepo: string;
  let mtContactCache: string;

  beforeEach(() => {
    const id = Date.now();
    mtRepo = join(tmp, `mt-${id}`);
    hexRepo = join(tmp, `hex-${id}`);
    configPath = join(tmp, `config-${id}.yaml`);
    bodyFile = join(tmp, `body-${id}.txt`);

    // Set AGM_BASE_DIR so V3 path resolution points into our temp dir.
    // getSelfRepoPath('mt')         → {AGM_BASE_DIR}/profiles/mt/self
    // getContactCachePath('mt','hex') → {AGM_BASE_DIR}/profiles/mt/contacts/hex
    process.env.AGM_BASE_DIR = tmp;

    // Init repos at the V3-derived paths (where the app will look)
    mtSelfRepo     = join(tmp, 'profiles', 'mt', 'self');
    mtContactCache = join(tmp, 'profiles', 'mt', 'contacts', 'hex');
    initRepo(mtSelfRepo,     'mt@test.com',  'mt');
    initRepo(mtContactCache, 'hex@test.com', 'hex');

    writeFileSync(bodyFile, 'Hello from mt to hex', 'utf-8');
    writeFileSync(configPath, stringify(makeConfigV3(mtRepo, hexRepo, 'mt', 'hex')), 'utf-8');
  });

  it('writes to sender outbox AND recipient inbox (dual-write)', async () => {
    const result = await sendMessage({
      from: 'mt',
      to: 'hex',
      subject: 'Test subject',
      bodyFile,
      expectsReply: true,
      configPath,
      profile: 'mt',
    });

    // Sender outbox gets the message
    const outboxFiles = readdirSync(join(mtSelfRepo, 'outbox')).filter(f => f.endsWith('.md'));
    expect(outboxFiles.length).toBe(1);

    // Recipient inbox ALSO gets the message (dual-write mailbox semantics)
    const inboxFiles = readdirSync(join(mtContactCache, 'inbox')).filter(f => f.endsWith('.md'));
    expect(inboxFiles.length).toBe(1);

    // Same filename on both sides (one logical mail, two physical copies)
    expect(outboxFiles[0]).toBe(result.filename);
    expect(inboxFiles[0]).toBe(result.filename);
  });

  it('creates commits in BOTH sender and recipient repos', async () => {
    const mtCommits1 = execSync(`git -C "${mtSelfRepo}" log --oneline`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
    const hexCommits1 = execSync(`git -C "${mtContactCache}" log --oneline`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);

    await sendMessage({ from: 'mt', to: 'hex', subject: 'Test', bodyFile, configPath, profile: 'mt' });

    const mtCommits2 = execSync(`git -C "${mtSelfRepo}" log --oneline`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
    const hexCommits2 = execSync(`git -C "${mtContactCache}" log --oneline`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);

    // sender repo: 1 new commit
    expect(mtCommits2.length - mtCommits1.length).toBe(1);
    expect(mtCommits2[0]).toContain('agm: send');

    // recipient repo: ALSO 1 new commit (dual-write)
    expect(hexCommits2.length - hexCommits1.length).toBe(1);
    // recipient commit message is 'agm: deliver' (not 'agm: send')
    expect(hexCommits2[0]).toMatch(/agm: (send|deliver)/);
  });

  it('commit on sender side contains outbox file', async () => {
    await sendMessage({ from: 'mt', to: 'hex', subject: 'Test', bodyFile, configPath, profile: 'mt' });

    const diff = execSync(`git -C "${mtSelfRepo}" diff HEAD~1 --name-only`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
    expect(diff.some(d => d.includes('outbox/'))).toBe(true);
  });

  it('commit on recipient side contains inbox file', async () => {
    await sendMessage({ from: 'mt', to: 'hex', subject: 'Test', bodyFile, configPath, profile: 'mt' });

    const diff = execSync(`git -C "${mtContactCache}" diff HEAD~1 --name-only`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
    expect(diff.some(d => d.includes('inbox/'))).toBe(true);
  });

  it('recipient inbox file has correct frontmatter', async () => {
    const result = await sendMessage({ from: 'mt', to: 'hex', subject: 'Hello', bodyFile, configPath, profile: 'mt' });

    const inboxPath = join(mtContactCache, 'inbox', result.filename);
    const content = readFileSync(inboxPath, 'utf-8');

    expect(content).toContain('from: mt');
    expect(content).toContain('to: hex');
    expect(content).toContain('subject: Hello');
    expect(content).toContain('created_at:');
    expect(content).toContain('expects_reply:');
  });

  it('rejects send when --from does not match profile self.id', async () => {
    await expect(sendMessage({
      from: 'hex',
      to: 'hex',
      subject: 'Bad sender',
      bodyFile,
      configPath,
      profile: 'mt',
    })).rejects.toThrow("Sender identity mismatch");
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });
});
