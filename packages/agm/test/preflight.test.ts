import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { ensureGitIdentity, ensureMaildirs } from '../src/git/preflight.js';

describe('git/mailbox preflight', () => {
  it('fails with clear error when git identity is missing', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'agm-preflight-git-'));
    execSync(`git init ${repo}`, { encoding: 'utf-8' });

    await expect(ensureGitIdentity(repo)).rejects.toThrow(/git identity/i);
    await expect(ensureGitIdentity(repo)).rejects.toThrow(/user\.name/i);
    await expect(ensureGitIdentity(repo)).rejects.toThrow(/user\.email/i);
  });

  it('passes when repo-local git identity exists', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'agm-preflight-git-ok-'));
    execSync(`git init ${repo}`, { encoding: 'utf-8' });
    execSync(`git -C ${repo} config user.name "test-agent"`, { encoding: 'utf-8' });
    execSync(`git -C ${repo} config user.email "test-agent@example.com"`, { encoding: 'utf-8' });

    await expect(ensureGitIdentity(repo)).resolves.toBeUndefined();
  });

  it('creates missing mailbox directories', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'agm-preflight-dirs-'));
    mkdirSync(join(repo, '.git'));

    await ensureMaildirs(repo);

    expect(() => writeFileSync(join(repo, 'inbox', '.probe'), 'ok')).not.toThrow();
    expect(() => writeFileSync(join(repo, 'outbox', '.probe'), 'ok')).not.toThrow();
    expect(() => writeFileSync(join(repo, 'archive', '.probe'), 'ok')).not.toThrow();
  });
});
