import { describe, it, expect, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { replyMessage } from '../src/app/reply-message.js';
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
      },
      [name2]: {
        self: { id: name2, remote_repo_url: 'https://github.com/test/' + name2 + '.git' },
        contacts: { [name1]: { remote_repo_url: 'https://github.com/test/' + name1 + '.git' } },
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

describe('reply (mailbox model)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'agm-reply-test-'));
  let hexSelfRepo: string;
  let hexContactCache: string;
  let configPath: string;
  let bodyFile: string;
  let originalFilename: string;

  beforeEach(async () => {
    const id = Date.now();
    configPath = join(tmp, `config-${id}.yaml`);
    bodyFile = join(tmp, `reply-body-${id}.txt`);

    // Set AGM_BASE_DIR so V3 path resolution points into our temp dir.
    process.env.AGM_BASE_DIR = tmp;

    // V3 paths (where the app will look)
    hexSelfRepo     = join(tmp, 'profiles', 'hex', 'self');
    hexContactCache = join(tmp, 'profiles', 'hex', 'contacts', 'mt');

    // Init repos at V3 paths only
    initRepo(hexSelfRepo,     'hex@test.com', 'hex');
    initRepo(hexContactCache, 'mt@test.com',  'mt');

    writeFileSync(bodyFile, 'This is a reply', 'utf-8');
    // V3 format: profile-based config (repo1/repo2 params are unused but must be present)
    writeFileSync(configPath, stringify(makeConfigV3('', '', 'mt', 'hex')), 'utf-8');

    // Simulate send's dual-write: original message delivered to hex's inbox (V3 path)
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
    // Write to hex's INBOX at V3 path (where app will search)
    execSync(`mkdir -p "${hexSelfRepo}/inbox"`, { encoding: 'utf-8' });
    writeFileSync(join(hexSelfRepo, 'inbox', filename), fm, 'utf-8');
    execSync(`git -C "${hexSelfRepo}" add inbox/${filename} && git -C "${hexSelfRepo}" commit -m "deliver to inbox"`, { encoding: 'utf-8' });
    originalFilename = filename;
  });

  it('reply writes to replier outbox AND original sender inbox (dual-write)', async () => {
    const result = await replyMessage({
      originalFilename,
      from: 'hex',
      bodyFile,
      dir: 'inbox', // original was delivered to hex's inbox
      configPath,
      profile: 'hex',
    });

    // Replier (hex) outbox gets the reply
    const hexOutbox = readdirSync(join(hexSelfRepo, 'outbox')).filter(f => f.endsWith('.md'));
    const replyFile = hexOutbox.find(f => f !== originalFilename);
    expect(replyFile).toBeDefined();
    expect(replyFile).toBe(result.filename);

    // DEBUG: check mt inbox
    const mtInboxAll = readdirSync(join(hexContactCache, 'inbox'));
    console.log('DEBUG mt inbox files:', mtInboxAll);
    console.log('DEBUG originalFilename:', originalFilename);

    // Original sender (mt) inbox ALSO gets the reply (dual-write)
    const mtInbox = readdirSync(join(hexContactCache, 'inbox')).filter(f => f.endsWith('.md'));
    // reply file is different from original (different ts/from/to pattern)
    const replyInMtInbox = mtInbox.filter(f => f !== originalFilename);
    console.log('DEBUG replyInMtInbox:', replyInMtInbox);
    expect(replyInMtInbox.length).toBe(1);
  });

  it('reply creates commits in BOTH replier and original sender repos', async () => {
    const hexCommits1 = execSync(`git -C "${hexSelfRepo}" log --oneline`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
    const mtCommits1 = execSync(`git -C "${hexContactCache}" log --oneline`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);

    await replyMessage({
      originalFilename,
      from: 'hex',
      bodyFile,
      dir: 'inbox',
      configPath,
      profile: 'hex',
    });

    const hexCommits2 = execSync(`git -C "${hexSelfRepo}" log --oneline`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
    const mtCommits2 = execSync(`git -C "${hexContactCache}" log --oneline`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);

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
      profile: 'hex',
    });

    // Check replier outbox copy
    const hexOutboxContent = readFileSync(join(hexSelfRepo, 'outbox', result.filename), 'utf-8');
    expect(hexOutboxContent).toContain(`reply_to: ${originalFilename}`);
    expect(hexOutboxContent).toContain('from: hex');
    expect(hexOutboxContent).toContain('to: mt');
    expect(hexOutboxContent).toContain('Re: Original message');

    // Check original sender inbox copy
    const mtInboxFiles = readdirSync(join(hexContactCache, 'inbox')).filter(f => f.endsWith('.md'));
    const replyInMt = mtInboxFiles.find(f => f !== originalFilename);
    expect(replyInMt).toBeDefined();
    const mtInboxContent = readFileSync(join(hexContactCache, 'inbox', replyInMt!), 'utf-8');
    expect(mtInboxContent).toContain(`reply_to: ${originalFilename}`);
    expect(mtInboxContent).toContain('from: hex');
    expect(mtInboxContent).toContain('to: mt');
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });
});
