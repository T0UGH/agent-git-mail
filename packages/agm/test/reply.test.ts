import { describe, it, expect, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { replyMessage } from '../src/app/reply-message.js';

// v0 legacy format (agents map) - no selfId field, so replier can reply to any agent
function makeConfigV0(repo1: string, repo2: string, name1: string, name2: string): string {
  return `agents:
  ${name1}:
    repo_path: ${repo1}
  ${name2}:
    repo_path: ${repo2}
`;
}

function initRepo(repoPath: string, email: string, name: string): void {
  execSync(
    `mkdir -p "${repoPath}" && cd "${repoPath}" && git init && git config user.email "${email}" && git config user.name "${name}" && mkdir -p inbox outbox archive && echo "init" > .init && git add .init && git commit -m "init"`,
    { encoding: 'utf-8' },
  );
}

describe('reply (mailbox model)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'agm-reply-test-'));
  let mtRepo: string;
  let hexRepo: string;
  let configPath: string;
  let bodyFile: string;
  let originalFilename: string;

  beforeEach(async () => {
    const id = Date.now();
    mtRepo = join(tmp, `mt-${id}`);
    hexRepo = join(tmp, `hex-${id}`);
    configPath = join(tmp, `config-${id}.yaml`);
    bodyFile = join(tmp, `reply-body-${id}.txt`);

    initRepo(mtRepo, 'mt@test.com', 'mt');
    initRepo(hexRepo, 'hex@test.com', 'hex');

    writeFileSync(bodyFile, 'This is a reply', 'utf-8');
    // v0 format: agents map - no selfId field
    writeFileSync(configPath, makeConfigV0(mtRepo, hexRepo, 'mt', 'hex'), 'utf-8');

    // Simulate send's dual-write: original message delivered to hex's inbox
    const { serializeFrontmatter } = await import('../src/domain/frontmatter.js');
    const createdAt = new Date().toISOString().replace(/\.\d{3}/, '').replace(/:/g, '-');
    const { generateFilename, generateUniqueSuffix } = await import('../src/domain/filename.js');
    const suffix = generateUniqueSuffix();
    const filename = generateFilename({ from: 'mt', to: 'hex', createdAt, suffix });
    const fm = serializeFrontmatter({
      from: 'mt',
      to: 'hex',
      subject: 'Original message',
      created_at: createdAt.replace(/-/g, ':').replace('+', '+'),
      reply_to: undefined,
      expects_reply: false,
    }) + '\n\nOriginal message';
    // Write to hex's INBOX (simulating send's dual-write delivery)
    execSync(`mkdir -p "${hexRepo}/inbox"`, { encoding: 'utf-8' });
    writeFileSync(join(hexRepo, 'inbox', filename), fm, 'utf-8');
    execSync(`git -C "${hexRepo}" add inbox/${filename} && git -C "${hexRepo}" commit -m "deliver to inbox"`, { encoding: 'utf-8' });
    originalFilename = filename;
  });

  it('reply writes to replier outbox AND original sender inbox (dual-write)', async () => {
    const result = await replyMessage({
      originalFilename,
      from: 'hex',
      bodyFile,
      dir: 'inbox', // original was delivered to hex's inbox
      configPath,
    });

    // Replier (hex) outbox gets the reply
    const hexOutbox = readdirSync(join(hexRepo, 'outbox')).filter(f => f.endsWith('.md'));
    const replyFile = hexOutbox.find(f => f !== originalFilename);
    expect(replyFile).toBeDefined();
    expect(replyFile).toBe(result.filename);

    // DEBUG: check mt inbox
    const mtInboxAll = readdirSync(join(mtRepo, 'inbox'));
    console.log('DEBUG mt inbox files:', mtInboxAll);
    console.log('DEBUG originalFilename:', originalFilename);

    // Original sender (mt) inbox ALSO gets the reply (dual-write)
    const mtInbox = readdirSync(join(mtRepo, 'inbox')).filter(f => f.endsWith('.md'));
    // reply file is different from original (different ts/from/to pattern)
    const replyInMtInbox = mtInbox.filter(f => f !== originalFilename);
    console.log('DEBUG replyInMtInbox:', replyInMtInbox);
    expect(replyInMtInbox.length).toBe(1);
  });

  it('reply creates commits in BOTH replier and original sender repos', async () => {
    const hexCommits1 = execSync(`git -C "${hexRepo}" log --oneline`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
    const mtCommits1 = execSync(`git -C "${mtRepo}" log --oneline`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);

    await replyMessage({
      originalFilename,
      from: 'hex',
      bodyFile,
      dir: 'inbox',
      configPath,
    });

    const hexCommits2 = execSync(`git -C "${hexRepo}" log --oneline`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
    const mtCommits2 = execSync(`git -C "${mtRepo}" log --oneline`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);

    // replier repo: 1 new commit
    expect(hexCommits2.length - hexCommits1.length).toBe(1);
    expect(hexCommits2[0]).toContain('agm: send');

    // original sender repo: ALSO 1 new commit (dual-write)
    expect(mtCommits2.length - mtCommits1.length).toBe(1);
    // recipient commit uses 'agm: deliver'
    expect(mtCommits2[0]).toMatch(/agm: (send|deliver)/);
  });

  it('reply_to points to original filename in both copies', async () => {
    const result = await replyMessage({
      originalFilename,
      from: 'hex',
      bodyFile,
      dir: 'inbox',
      configPath,
    });

    // Check replier outbox copy
    const hexOutboxContent = readFileSync(join(hexRepo, 'outbox', result.filename), 'utf-8');
    expect(hexOutboxContent).toContain(`reply_to: ${originalFilename}`);
    expect(hexOutboxContent).toContain('from: hex');
    expect(hexOutboxContent).toContain('to: mt');
    expect(hexOutboxContent).toContain('Re: Original message');

    // Check original sender inbox copy
    const mtInboxFiles = readdirSync(join(mtRepo, 'inbox')).filter(f => f.endsWith('.md'));
    const replyInMt = mtInboxFiles.find(f => f !== originalFilename);
    expect(replyInMt).toBeDefined();
    const mtInboxContent = readFileSync(join(mtRepo, 'inbox', replyInMt!), 'utf-8');
    expect(mtInboxContent).toContain(`reply_to: ${originalFilename}`);
    expect(mtInboxContent).toContain('from: hex');
    expect(mtInboxContent).toContain('to: mt');
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });
});
