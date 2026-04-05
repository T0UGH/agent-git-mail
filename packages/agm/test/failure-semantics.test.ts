import { describe, it, expect, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { sendMessage } from '../src/app/send-message.js';
import { replyMessage } from '../src/app/reply-message.js';
import { stringify } from 'yaml';

// V3 format - profile-based config with both profiles
function makeConfigV3(name1: string, name2: string): object {
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
  rmSync(repoPath, { recursive: true, force: true });
  execSync(`mkdir -p "${repoPath}"`, { encoding: 'utf-8' });
  execSync(`git init --initial-branch=main`, { cwd: repoPath, encoding: 'utf-8' });
  execSync(`git config user.email '${email}'`, { cwd: repoPath, encoding: 'utf-8' });
  execSync(`git config user.name '${name}'`, { cwd: repoPath, encoding: 'utf-8' });
  execSync(`mkdir -p "${repoPath}/inbox" "${repoPath}/outbox" "${repoPath}/archive"`, { encoding: 'utf-8' });
  execSync(`echo "init" > "${repoPath}/.init" && git -C "${repoPath}" add .init && git -C "${repoPath}" commit -m "init"`, { encoding: 'utf-8' });
}

// For simulating a push failure, we mark the remote as not writable
function makeRemoteNotPushable(repoPath: string): void {
  execSync(`git config receive.denyCurrentBranch ignore`, { cwd: repoPath, encoding: 'utf-8' });
}

describe('failure-semantics: send/reply result structure', () => {

  describe('send result shape', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'agm-send-result-'));
    let mtSelfRepo: string;
    let mtContactCache: string;
    let configPath: string;
    let bodyFile: string;

    beforeEach(() => {
      const id = Date.now().toString(36) + randomBytes(2).toString('hex');
      process.env.AGM_BASE_DIR = tmp;

      mtSelfRepo     = join(tmp, 'profiles', 'mt', 'self');
      mtContactCache = join(tmp, 'profiles', 'mt', 'contacts', 'hex');
      configPath     = join(tmp, `config-${id}.yaml`);
      bodyFile       = join(tmp, `body-${id}.txt`);

      initRepo(mtSelfRepo,     'mt@test.com',  'mt');
      initRepo(mtContactCache, 'hex@test.com', 'hex');

      writeFileSync(bodyFile, 'Hello from mt to hex', 'utf-8');
      writeFileSync(configPath, stringify(makeConfigV3('mt', 'hex')), 'utf-8');
    });

    it('returns an object with localSuccess and deliverySuccess fields', async () => {
      // Current implementation returns { filename: string } which is insufficient.
      // The result must expose both stages so callers can distinguish what succeeded.
      const result = await sendMessage({
        from: 'mt',
        to: 'hex',
        subject: 'Test subject',
        bodyFile,
        configPath,
        profile: 'mt',
      });

      expect(result).toHaveProperty('filename');
      expect(result).toHaveProperty('localSuccess');
      expect(result).toHaveProperty('deliverySuccess');
      expect(typeof result.localSuccess).toBe('boolean');
      expect(typeof result.deliverySuccess).toBe('boolean');
    });

    it('sets localSuccess=true and deliverySuccess=true when both sides succeed', async () => {
      const result = await sendMessage({
        from: 'mt',
        to: 'hex',
        subject: 'Test subject',
        bodyFile,
        configPath,
        profile: 'mt',
      });

      expect(result.localSuccess).toBe(true);
      expect(result.deliverySuccess).toBe(true);
    });

    it('result has partialFailure field when result type exposes partial failure', async () => {
      // When partial failure is possible, the result type must carry a partialFailure field.
      // In the test fixture both sides are local so we always get full success,
      // but the RESULT TYPE must support distinguishing partial success.
      // This test verifies the TYPE supports the field — the value is always undefined
      // in happy-path tests because both sides succeed locally.
      const result = await sendMessage({
        from: 'mt',
        to: 'hex',
        subject: 'Test subject',
        bodyFile,
        configPath,
        profile: 'mt',
      });

      // Result must expose the partialFailure field structurally
      expect(result).toHaveProperty('partialFailure');
      // In happy path it should be undefined (full success)
      // The field must exist so callers can distinguish type vs absent
      expect(result.partialFailure === undefined || typeof result.partialFailure === 'object').toBe(true);
    });

    afterAll(() => {
      rmSync(tmp, { recursive: true, force: true });
    });
  });

  describe('reply result shape', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'agm-reply-result-'));
    let hexSelfRepo: string;
    let hexContactCache: string;
    let mtSelfRepo: string;
    let mtContactCache: string;
    let configPath: string;
    let bodyFile: string;
    let originalFilename: string;

    beforeEach(async () => {
      const id = Date.now().toString(36) + randomBytes(2).toString('hex');
      process.env.AGM_BASE_DIR = tmp;

      // hex's self repo and mt's contact cache
      hexSelfRepo     = join(tmp, 'profiles', 'hex', 'self');
      hexContactCache = join(tmp, 'profiles', 'hex', 'contacts', 'mt');
      // mt's self repo and hex's contact cache
      mtSelfRepo     = join(tmp, 'profiles', 'mt', 'self');
      mtContactCache = join(tmp, 'profiles', 'mt', 'contacts', 'hex');

      configPath = join(tmp, `config-${id}.yaml`);
      bodyFile   = join(tmp, `body-${id}.txt`);

      initRepo(hexSelfRepo,     'hex@test.com', 'hex');
      initRepo(hexContactCache, 'mt@test.com',  'mt');
      initRepo(mtSelfRepo,     'mt@test.com',  'mt');
      initRepo(mtContactCache, 'hex@test.com', 'hex');

      writeFileSync(bodyFile, 'Reply body', 'utf-8');
      writeFileSync(configPath, stringify(makeConfigV3('mt', 'hex')), 'utf-8');

      // Simulate the initial send: mt sends to hex → hex's inbox gets the message
      const { serializeFrontmatter } = await import('../src/domain/frontmatter.js');
      const { generateFilename, generateUniqueSuffix } = await import('../src/domain/filename.js');
      const createdAt = new Date().toISOString().replace(/\.\d{3}/, '').replace(/:/g, '-');
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
      execSync(`mkdir -p "${hexSelfRepo}/inbox"`, { encoding: 'utf-8' });
      writeFileSync(join(hexSelfRepo, 'inbox', filename), fm, 'utf-8');
      execSync(`git -C "${hexSelfRepo}" add inbox/${filename} && git -C "${hexSelfRepo}" commit -m "deliver to inbox"`, { encoding: 'utf-8' });
      originalFilename = filename;
    });

    it('returns an object with localSuccess and deliverySuccess fields', async () => {
      const result = await replyMessage({
        originalFilename,
        from: 'hex',
        bodyFile,
        configPath,
        profile: 'hex',
        dir: 'inbox',
      });

      expect(result).toHaveProperty('filename');
      expect(result).toHaveProperty('localSuccess');
      expect(result).toHaveProperty('deliverySuccess');
      expect(typeof result.localSuccess).toBe('boolean');
      expect(typeof result.deliverySuccess).toBe('boolean');
    });

    it('sets localSuccess=true and deliverySuccess=true when both sides succeed', async () => {
      const result = await replyMessage({
        originalFilename,
        from: 'hex',
        bodyFile,
        configPath,
        profile: 'hex',
        dir: 'inbox',
      });

      expect(result.localSuccess).toBe(true);
      expect(result.deliverySuccess).toBe(true);
    });

    afterAll(() => {
      rmSync(tmp, { recursive: true, force: true });
    });
  });
});
