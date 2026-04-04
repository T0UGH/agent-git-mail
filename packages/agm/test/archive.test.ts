import { describe, it, expect, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync, readdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { archiveMessage } from '../src/app/archive-message.js';
import { stringify } from 'yaml';

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

// V3 format - profile-based config
function makeConfigV3(name1: string, name2: string): object {
  return {
    profiles: {
      [name1]: {
        self: { id: name1, remote_repo_url: 'https://github.com/test/' + name1 + '.git' },
        contacts: { [name2]: { remote_repo_url: 'https://github.com/test/' + name2 + '.git' } },
        notifications: { default_target: 'main', bind_session_key: null, forced_session_key: null },
        runtime: { poll_interval_seconds: 30 },
      },
    }
  };
}

describe('archive E2E', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'agm-archive-test-'));
  let hexSelfRepo: string;
  let configPath: string;
  let filename: string;

  beforeEach(async () => {
    const id = Date.now();
    const hexRemote = join(tmp, `hex-remote-${id}.git`);

    // Set AGM_BASE_DIR so V3 path resolution points into our temp dir.
    process.env.AGM_BASE_DIR = tmp;

    // hex's self repo at V3 path: tmp/profiles/hex/self
    hexSelfRepo = join(tmp, 'profiles', 'hex', 'self');
    configPath = join(tmp, `config-${id}.yaml`);

    execSync(`mkdir -p ${hexRemote} && cd ${hexRemote} && git init --bare`, { encoding: 'utf-8' });
    initRepo(hexSelfRepo, 'hex@test.com', 'hex');
    execSync(`git -C "${hexSelfRepo}" remote add origin "${hexRemote}" && git -C "${hexSelfRepo}" push -u origin main`, { encoding: 'utf-8' });

    writeFileSync(configPath, stringify(makeConfigV3('hex', 'mt')), 'utf-8');

    // Simulate daemon-fetched state: write message directly to inbox at V3 path.
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
    writeFileSync(join(hexSelfRepo, 'inbox', filename), fm, 'utf-8');
    execSync(`git -C "${hexSelfRepo}" add inbox/${filename} && git -C "${hexSelfRepo}" commit -m "daemon: fetch from mt"`, { encoding: 'utf-8' });
  });

  it('moves file from inbox to archive', async () => {
    await archiveMessage({ filename, agent: 'hex', configPath, profile: 'hex' });

    const inboxFiles  = readdirSync(join(hexSelfRepo, 'inbox')).filter(f => f.endsWith('.md'));
    const archiveFiles = readdirSync(join(hexSelfRepo, 'archive')).filter(f => f.endsWith('.md'));

    expect(inboxFiles).not.toContain(filename);
    expect(archiveFiles).toContain(filename);
  });

  it('commit contains both inbox removal and archive addition', async () => {
    const commitsBefore = execSync(`git -C "${hexSelfRepo}" log --oneline`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);

    await archiveMessage({ filename, agent: 'hex', configPath, profile: 'hex' });

    const commitsAfter = execSync(`git -C "${hexSelfRepo}" log --oneline`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
    expect(commitsAfter.length - commitsBefore.length).toBe(1);

    const diff = execSync(`git -C "${hexSelfRepo}" diff --name-status HEAD~1 HEAD`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
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
