import { describe, it, expect, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync, readdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
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
  let hexRepo: string;
  let configPath: string;
  let filename: string;

  beforeEach(async () => {
    const id = Date.now();
    hexRepo = join(tmp, `hex-${id}`);
    configPath = join(tmp, `config-${id}.yaml`);
    const hexRemote = join(tmp, `hex-remote-${id}.git`);

    execSync(`mkdir -p ${hexRepo} && cd ${hexRepo} && git init && git config user.email "hex@test.com" && git config user.name "hex" && mkdir -p inbox outbox archive && git commit --allow-empty -m "init"`, { encoding: 'utf-8' });
    execSync(`mkdir -p ${hexRemote} && cd ${hexRemote} && git init --bare`, { encoding: 'utf-8' });
    execSync(`git -C "${hexRepo}" remote add origin "${hexRemote}" && git -C "${hexRepo}" push -u origin main`, { encoding: 'utf-8' });

    writeFileSync(configPath, makeConfig(hexRepo, hexRepo, 'hex', 'mt'), 'utf-8');

    // In remote-only model, archive targets the local inbox (daemon fetches from remote into inbox).
    // Simulate daemon-fetched state by writing message directly to inbox.
    const { serializeFrontmatter } = await import('../src/domain/frontmatter.js');
    const createdAt = new Date().toISOString().replace(/\.\d{3}/, '').replace(/:/g, '-');
    const { generateFilename, generateUniqueSuffix } = await import('../src/domain/filename.js');
    const suffix = generateUniqueSuffix();
    filename = generateFilename({ from: 'mt', to: 'hex', createdAt, suffix });
    const fm = serializeFrontmatter({
      from: 'mt',
      to: 'hex',
      subject: 'Archive me',
      created_at: createdAt.replace(/-/g, ':').replace('+', '+'),
      reply_to: undefined,
      expects_reply: false,
    }) + '\n\nMessage to archive';
    writeFileSync(join(hexRepo, 'inbox', filename), fm, 'utf-8');
    execSync(`git -C "${hexRepo}" add inbox/${filename} && git -C "${hexRepo}" commit -m "daemon: fetch from mt"`, { encoding: 'utf-8' });
  });

  it('moves file from inbox to archive', async () => {
    await archiveMessage({ filename, agent: 'hex', configPath });

    const inboxFiles = readdirSync(join(hexRepo, 'inbox')).filter(f => f.endsWith('.md'));
    const archiveFiles = readdirSync(join(hexRepo, 'archive')).filter(f => f.endsWith('.md'));

    expect(inboxFiles).not.toContain(filename);
    expect(archiveFiles).toContain(filename);
  });

  it('commit contains both inbox removal and archive addition', async () => {
    const commitsBefore = execSync(`git -C "${hexRepo}" log --oneline`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);

    await archiveMessage({ filename, agent: 'hex', configPath });

    const commitsAfter = execSync(`git -C "${hexRepo}" log --oneline`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
    expect(commitsAfter.length - commitsBefore.length).toBe(1);

    const diff = execSync(`git -C "${hexRepo}" diff --name-status HEAD~1 HEAD`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
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
