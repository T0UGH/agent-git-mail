import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { GitRepo } from '../src/git/repo.js';
import { GitWaterline } from '../src/git/waterline.js';

describe('git waterline', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'agm-waterline-test-'));
  let repo: GitRepo;

  beforeEach(() => {
    const repoPath = join(tmp, `repo-${Date.now()}`);
    execSync(`mkdir ${repoPath} && cd ${repoPath} && git init && git config user.email "test@test.com" && git config user.name "test" && echo "initial" > f.txt && git add f.txt && git commit -m "init"`, { encoding: 'utf-8' });
    repo = new GitRepo(repoPath);
  });

  it('returns null when refs/agm/last-seen does not exist', async () => {
    const wl = new GitWaterline(repo);
    const result = await wl.read();
    expect(result).toBeNull();
  });

  it('writes and reads back the waterline ref', async () => {
    const wl = new GitWaterline(repo);
    const sha = await repo.getHeadSha();
    await wl.write(sha);
    const read = await wl.read();
    expect(read).toBe(sha);
  });

  it('updates existing waterline', async () => {
    const wl = new GitWaterline(repo);
    const sha1 = await repo.getHeadSha();
    await wl.write(sha1);

    // Create a new commit
    execSync(`echo "a" >> ${repo['repoPath']}/f.txt && git -C ${repo['repoPath']} add f.txt && git -C ${repo['repoPath']} commit -m "a"`, { encoding: 'utf-8' });
    const sha2 = await repo.getHeadSha();

    await wl.write(sha2);
    const read = await wl.read();
    expect(read).toBe(sha2);
  });

  it('supports agent-scoped waterline refs', async () => {
    const sha = await repo.getHeadSha();
    const leo = new GitWaterline(repo, 'refs/agm/last-seen/leo');
    const rk = new GitWaterline(repo, 'refs/agm/last-seen/rk');

    await leo.write(sha);

    expect(await leo.read()).toBe(sha);
    expect(await rk.read()).toBeNull();
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });
});
