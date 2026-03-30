import { describe, it, expect, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync, readdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { sendMessage } from '../src/app/send-message.js';
import { archiveMessage } from '../src/app/archive-message.js';

function makeConfig(repo1: string, repo2: string, name1: string, name2: string): string {
  return `agents:
  ${name1}:
    repo_path: ${repo1}
  ${name2}:
    repo_path: ${repo2}
`;
}

describe('archive E2E', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'agm-archive-test-'));
  let mtRepo: string;
  let hexRepo: string;
  let configPath: string;
  let filename: string;

  beforeEach(async () => {
    const id = Date.now();
    mtRepo = join(tmp, `mt-${id}`);
    hexRepo = join(tmp, `hex-${id}`);
    const remoteRepo = join(tmp, `remote-${id}.git`);
    configPath = join(tmp, `config-${id}.yaml`);

    execSync(`mkdir -p ${mtRepo} && cd ${mtRepo} && git init && git config user.email "mt@test.com" && git config user.name "mt" && mkdir -p inbox outbox archive`, { encoding: 'utf-8' });
    execSync(`mkdir -p ${hexRepo} && cd ${hexRepo} && git init && git config user.email "hex@test.com" && git config user.name "hex" && mkdir -p inbox outbox archive`, { encoding: 'utf-8' });
    const mtRemote = join(tmp, `mt-remote-${id}.git`);
    const hexRemote = join(tmp, `hex-remote-${id}.git`);
    execSync(`mkdir -p ${mtRemote} && cd ${mtRemote} && git init --bare`, { encoding: 'utf-8' });
    execSync(`mkdir -p ${hexRemote} && cd ${hexRemote} && git init --bare`, { encoding: 'utf-8' });
    execSync(`git -C ${mtRepo} remote add origin ${mtRemote} && git -C ${mtRepo} config user.email "mt@test.com" && git -C ${mtRepo} config user.name "mt" && git -C ${mtRepo} commit --allow-empty -m "init" && git -C ${mtRepo} push -u origin main`, { encoding: 'utf-8' });
    execSync(`git -C ${hexRepo} remote add origin ${hexRemote} && git -C ${hexRepo} config user.email "hex@test.com" && git -C ${hexRepo} config user.name "hex" && git -C ${hexRepo} commit --allow-empty -m "init" && git -C ${hexRepo} push -u origin main`, { encoding: 'utf-8' });

    writeFileSync(configPath, makeConfig(mtRepo, hexRepo, 'mt', 'hex'), 'utf-8');

    const bodyFile = join(tmp, `body-${id}.txt`);
    writeFileSync(bodyFile, 'Message to archive', 'utf-8');

    const result = await sendMessage({
      from: 'mt',
      to: 'hex',
      subject: 'Archive me',
      bodyFile,
      configPath,
    });
    filename = result.filename;
  });

  it('moves file from inbox to archive', async () => {
    await archiveMessage({ filename, agent: 'hex', configPath });

    const inboxFiles = readdirSync(join(hexRepo, 'inbox')).filter(f => f.endsWith('.md'));
    const archiveFiles = readdirSync(join(hexRepo, 'archive')).filter(f => f.endsWith('.md'));

    expect(inboxFiles).not.toContain(filename);
    expect(archiveFiles).toContain(filename);
  });

  it('commit contains both inbox removal and archive addition', async () => {
    const commitsBefore = execSync(`git -C ${hexRepo} log --oneline`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);

    await archiveMessage({ filename, agent: 'hex', configPath });

    const commitsAfter = execSync(`git -C ${hexRepo} log --oneline`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
    expect(commitsAfter.length - commitsBefore.length).toBe(1);

    const diff = execSync(`git -C ${hexRepo} diff --name-status HEAD~1 HEAD`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
    expect(diff.length).toBeGreaterThanOrEqual(1);

    const hasRename = diff.some(line => line.startsWith('R') && line.includes(`inbox/${filename}`) && line.includes(`archive/${filename}`));
    const hasSeparateArchiveAdd = diff.some(line => line.startsWith('A') && line.includes(`archive/${filename}`));
    const hasSeparateInboxDelete = diff.some(line => line.startsWith('D') && line.includes(`inbox/${filename}`));

    expect(hasRename || (hasSeparateArchiveAdd && hasSeparateInboxDelete)).toBe(true);
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });
});
