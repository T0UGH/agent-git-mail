import { describe, it, expect, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { sendMessage } from '../src/app/send-message.js';
import { replyMessage } from '../src/app/reply-message.js';

function makeConfig(repo1: string, repo2: string, name1: string, name2: string): string {
  return `agents:
  ${name1}:
    repo_path: ${repo1}
  ${name2}:
    repo_path: ${repo2}
`;
}

describe('reply E2E', () => {
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

    execSync(`mkdir -p ${mtRepo} && cd ${mtRepo} && git init && git config user.email "mt@test.com" && git config user.name "mt" && mkdir -p inbox outbox archive`, { encoding: 'utf-8' });
    execSync(`mkdir -p ${hexRepo} && cd ${hexRepo} && git init && git config user.email "hex@test.com" && git config user.name "hex" && mkdir -p inbox outbox archive`, { encoding: 'utf-8' });

    writeFileSync(bodyFile, 'This is a reply', 'utf-8');
    writeFileSync(configPath, makeConfig(mtRepo, hexRepo, 'mt', 'hex'), 'utf-8');

    const origBody = join(tmp, `orig-body-${id}.txt`);
    writeFileSync(origBody, 'Original message', 'utf-8');
    const result = await sendMessage({
      from: 'mt',
      to: 'hex',
      subject: 'Original message',
      bodyFile: origBody,
      configPath,
    });
    originalFilename = result.filename;
  });

  it('reply_to is set correctly on the reply file', async () => {
    await replyMessage({
      originalFilename,
      from: 'hex',
      bodyFile,
      dir: 'inbox',
      configPath,
    });

    // The reply is delivered to original sender (mt)'s inbox
    const mtInbox = readdirSync(join(mtRepo, 'inbox')).filter(f => f.endsWith('.md'));
    const replyFile = mtInbox.find(f => f !== originalFilename);
    expect(replyFile).toBeDefined();

    const content = readFileSync(join(mtRepo, 'inbox', replyFile!), 'utf-8');
    expect(content).toContain(`reply_to: ${originalFilename}`);
  });

  it('direction flips: original sender receives reply', async () => {
    await replyMessage({
      originalFilename,
      from: 'hex',
      bodyFile,
      dir: 'inbox',
      configPath,
    });

    const mtInbox = readdirSync(join(mtRepo, 'inbox')).filter(f => f.endsWith('.md'));
    // mt's inbox has the reply (not the original)
    expect(mtInbox.length).toBe(1);
    expect(mtInbox[0]).not.toBe(originalFilename);
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });
});
