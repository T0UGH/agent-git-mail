import { describe, it, expect, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { sendMessage } from '../src/app/send-message.js';

// v1 format (legacy) - contacts have local paths, supports dual-write
function makeConfigLegacy(repo1: string, repo2: string, name1: string, name2: string): string {
  return `self:
  id: ${name1}
  repo_path: ${repo1}
contacts:
  ${name2}: ${repo2}
`;
}

function initRepo(repoPath: string, email: string, name: string): void {
  execSync(
    `mkdir -p "${repoPath}" && cd "${repoPath}" && git init && git config user.email "${email}" && git config user.name "${name}" && mkdir -p inbox outbox archive && echo "init" > .init && git add .init && git commit -m "init"`,
    { encoding: 'utf-8' },
  );
}

describe('send (mailbox model)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'agm-send-test-'));
  let mtRepo: string;
  let hexRepo: string;
  let configPath: string;
  let bodyFile: string;

  beforeEach(() => {
    const id = Date.now();
    mtRepo = join(tmp, `mt-${id}`);
    hexRepo = join(tmp, `hex-${id}`);
    configPath = join(tmp, `config-${id}.yaml`);
    bodyFile = join(tmp, `body-${id}.txt`);

    initRepo(mtRepo, 'mt@test.com', 'mt');
    initRepo(hexRepo, 'hex@test.com', 'hex');

    writeFileSync(bodyFile, 'Hello from mt to hex', 'utf-8');
    writeFileSync(configPath, makeConfigLegacy(mtRepo, hexRepo, 'mt', 'hex'), 'utf-8');
  });

  it('writes to sender outbox AND recipient inbox (dual-write)', async () => {
    const result = await sendMessage({
      from: 'mt',
      to: 'hex',
      subject: 'Test subject',
      bodyFile,
      expectsReply: true,
      configPath,
    });

    // Sender outbox gets the message
    const outboxFiles = readdirSync(join(mtRepo, 'outbox')).filter(f => f.endsWith('.md'));
    expect(outboxFiles.length).toBe(1);

    // Recipient inbox ALSO gets the message (dual-write mailbox semantics)
    const inboxFiles = readdirSync(join(hexRepo, 'inbox')).filter(f => f.endsWith('.md'));
    expect(inboxFiles.length).toBe(1);

    // Same filename on both sides (one logical mail, two physical copies)
    expect(outboxFiles[0]).toBe(result.filename);
    expect(inboxFiles[0]).toBe(result.filename);
  });

  it('creates commits in BOTH sender and recipient repos', async () => {
    const mtCommits1 = execSync(`git -C "${mtRepo}" log --oneline`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
    const hexCommits1 = execSync(`git -C "${hexRepo}" log --oneline`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);

    await sendMessage({ from: 'mt', to: 'hex', subject: 'Test', bodyFile, configPath });

    const mtCommits2 = execSync(`git -C "${mtRepo}" log --oneline`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
    const hexCommits2 = execSync(`git -C "${hexRepo}" log --oneline`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);

    // sender repo: 1 new commit
    expect(mtCommits2.length - mtCommits1.length).toBe(1);
    expect(mtCommits2[0]).toContain('agm: send');

    // recipient repo: ALSO 1 new commit (dual-write)
    expect(hexCommits2.length - hexCommits1.length).toBe(1);
    // recipient commit message is 'agm: deliver' (not 'agm: send')
    expect(hexCommits2[0]).toMatch(/agm: (send|deliver)/);
  });

  it('commit on sender side contains outbox file', async () => {
    await sendMessage({ from: 'mt', to: 'hex', subject: 'Test', bodyFile, configPath });

    const diff = execSync(`git -C "${mtRepo}" diff HEAD~1 --name-only`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
    expect(diff.some(d => d.includes('outbox/'))).toBe(true);
  });

  it('commit on recipient side contains inbox file', async () => {
    await sendMessage({ from: 'mt', to: 'hex', subject: 'Test', bodyFile, configPath });

    const diff = execSync(`git -C "${hexRepo}" diff HEAD~1 --name-only`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
    expect(diff.some(d => d.includes('inbox/'))).toBe(true);
  });

  it('recipient inbox file has correct frontmatter', async () => {
    const result = await sendMessage({ from: 'mt', to: 'hex', subject: 'Hello', bodyFile, configPath });

    const inboxPath = join(hexRepo, 'inbox', result.filename);
    const content = readFileSync(inboxPath, 'utf-8');

    expect(content).toContain('from: mt');
    expect(content).toContain('to: hex');
    expect(content).toContain('subject: Hello');
    expect(content).toContain('created_at:');
    expect(content).toContain('expects_reply:');
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });
});
