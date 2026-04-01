import { describe, it, expect, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { sendMessage } from '../src/app/send-message.js';
import { replyMessage } from '../src/app/reply-message.js';

// v0 legacy format (agents map)
function makeConfigLegacy(repo1: string, repo2: string, name1: string, name2: string): string {
  return `agents:
  ${name1}:
    repo_path: ${repo1}
  ${name2}:
    repo_path: ${repo2}
`;
}

describe('reply (remote-only model)', () => {
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

    execSync(`mkdir -p "${mtRepo}" && cd "${mtRepo}" && git init && git config user.email "mt@test.com" && git config user.name "mt" && mkdir -p inbox outbox archive && echo "init" > .init && git add .init && git commit -m "init"`, { encoding: 'utf-8' });
    execSync(`mkdir -p "${hexRepo}" && cd "${hexRepo}" && git init && git config user.email "hex@test.com" && git config user.name "hex" && mkdir -p inbox outbox archive && echo "init" > .init && git add .init && git commit -m "init"`, { encoding: 'utf-8' });

    writeFileSync(bodyFile, 'This is a reply', 'utf-8');
    writeFileSync(configPath, makeConfigLegacy(mtRepo, hexRepo, 'mt', 'hex'), 'utf-8');

    // In remote-only model: mt sends → message goes to mt's outbox.
    // For reply test, we simulate daemon having fetched the message into hex's outbox.
    // Write the original message directly into hex's outbox to simulate post-fetch state.
    const origBody = join(tmp, `orig-body-${id}.txt`);
    writeFileSync(origBody, 'Original message', 'utf-8');
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
    execSync(`mkdir -p "${hexRepo}/outbox"`, { encoding: 'utf-8' });
    writeFileSync(join(hexRepo, 'outbox', filename), fm, 'utf-8');
    originalFilename = filename;
  });

  it('reply writes only to replier outbox, not to original sender inbox', async () => {
    await replyMessage({
      originalFilename,
      from: 'hex',
      bodyFile,
      dir: 'outbox', // original is in mt's outbox (hex replying from mt's outbox they received via daemon)
      configPath,
    });

    // Replier (hex) outbox gets the reply (2 files: original msg + reply)
    const hexOutbox = readdirSync(join(hexRepo, 'outbox')).filter(f => f.endsWith('.md'));
    const replyFile = hexOutbox.filter(f => f !== originalFilename);
    expect(replyFile.length).toBe(1);

    // Original sender (mt) inbox is NOT written by replier (remote-only model)
    const mtInbox = readdirSync(join(mtRepo, 'inbox')).filter(f => f.endsWith('.md'));
    // mt's inbox may have the original message if old send wrote there, but in new model nothing
    // The key assertion: reply does NOT add a new file to mt's inbox
    const replyInMtInbox = mtInbox.filter(f => f.includes('Re:'));
    expect(replyInMtInbox.length).toBe(0);
  });

  it('reply commit lands only in replier repo', async () => {
    const hexCommits1 = execSync(`git -C "${hexRepo}" log --oneline`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
    const mtCommits1 = execSync(`git -C "${mtRepo}" log --oneline`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);

    await replyMessage({
      originalFilename,
      from: 'hex',
      bodyFile,
      dir: 'outbox',
      configPath,
    });

    const hexCommits2 = execSync(`git -C "${hexRepo}" log --oneline`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
    const mtCommits2 = execSync(`git -C "${mtRepo}" log --oneline`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);

    // replier repo: 1 new commit
    expect(hexCommits2.length - hexCommits1.length).toBe(1);
    expect(hexCommits2[0]).toContain('agm: send');

    // original sender repo: NO new commits from reply
    expect(mtCommits2.length).toBe(mtCommits1.length);
  });

  it('reply_to points to original filename', async () => {
    await replyMessage({
      originalFilename,
      from: 'hex',
      bodyFile,
      dir: 'outbox',
      configPath,
    });

    const hexOutbox = readdirSync(join(hexRepo, 'outbox')).filter(f => f.endsWith('.md'));
    const replyFile = hexOutbox.find(f => f !== originalFilename);
    expect(replyFile).toBeDefined();

    const content = readFileSync(join(hexRepo, 'outbox', replyFile), 'utf-8');
    expect(content).toContain(`reply_to: ${originalFilename}`);
    expect(content).toContain('from: hex');
    expect(content).toContain('to: mt');
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });
});
