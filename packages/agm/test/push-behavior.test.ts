import { describe, it, expect } from 'vitest';
import { maybePush } from '../src/app/git-push.js';

class FakeRepo {
  constructor(
    private readonly remote: boolean,
    private readonly pushImpl: () => Promise<void>,
  ) {}

  async hasRemote(): Promise<boolean> {
    return this.remote;
  }

  async push(): Promise<void> {
    await this.pushImpl();
  }
}

describe('maybePush', () => {
  it('skips push when repo has no remote', async () => {
    let pushed = false;
    const repo = new FakeRepo(false, async () => {
      pushed = true;
    });

    await expect(maybePush(repo as any)).resolves.toBeUndefined();
    expect(pushed).toBe(false);
  });

  it('throws when repo has remote but push fails', async () => {
    const repo = new FakeRepo(true, async () => {
      throw new Error('push rejected');
    });

    await expect(maybePush(repo as any)).rejects.toThrow('push rejected');
  });

  it('pushes successfully when remote exists and push works', async () => {
    let pushed = false;
    const repo = new FakeRepo(true, async () => {
      pushed = true;
    });

    await expect(maybePush(repo as any)).resolves.toBeUndefined();
    expect(pushed).toBe(true);
  });
});
