import { describe, it, expect, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { sendMessage } from '../src/app/send-message.js';

function makeConfig(repo1: string, repo2: string, name1: string, name2: string): string {
  return `self:
  id: ${name1}
  repo_path: ${repo1}
contacts:
  ${name2}: ${repo2}
`;
}

function initRepo(repoPath: string, email: string, name: string): void {
  execSync(
    `mkdir -p ${repoPath} && cd ${repoPath} && git init && git config user.email "${email}" && git config user.name "${name}" && mkdir -p inbox outbox archive && echo "init" > .init && git add .init && git commit -m "init"`,
    { encoding: 'utf-8' },
  );
}

describe('send E2E', () => {
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
    writeFileSync(configPath, makeConfig(mtRepo, hexRepo, 'mt', 'hex'), 'utf-8');
  });

  it('sends to both outbox and recipient inbox', async () => {
    const result = await sendMessage({
      from: 'mt',
      to: 'hex',
      subject: 'Test subject',
      bodyFile,
      expectsReply: true,
      configPath,
    });

    const outboxFiles = readdirSync(join(mtRepo, 'outbox')).filter(f => f.endsWith('.md'));
    expect(outboxFiles.length).toBe(1);

    const inboxFiles = readdirSync(join(hexRepo, 'inbox')).filter(f => f.endsWith('.md'));
    expect(inboxFiles.length).toBe(1);
    expect(inboxFiles[0]).toContain('mt');
    expect(inboxFiles[0]).toContain('hex');
  });

  it('creates two separate commits', async () => {
    const commits1 = execSync(`git -C ${mtRepo} log --oneline`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);

    await sendMessage({ from: 'mt', to: 'hex', subject: 'Test', bodyFile, configPath });

    const commits2 = execSync(`git -C ${mtRepo} log --oneline`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
    const hexCommits = execSync(`git -C ${hexRepo} log --oneline`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);

    expect(commits2.length - commits1.length).toBe(1);
    expect(hexCommits.length - 1).toBe(1); // hex had 1 init commit
  });

  it('commit only contains the target file', async () => {
    await sendMessage({ from: 'mt', to: 'hex', subject: 'Test', bodyFile, configPath });

    const diff = execSync(`git -C ${mtRepo} diff HEAD~1 --name-only`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
    expect(diff.length).toBe(1);
    expect(diff[0]).toContain('outbox/');
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });
});
