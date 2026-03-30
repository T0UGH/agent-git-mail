import { GitRepo } from '../git/repo.js';

export async function maybePush(repo: Pick<GitRepo, 'hasRemote' | 'push'>): Promise<void> {
  const hasRemote = await repo.hasRemote();
  if (!hasRemote) return;
  await repo.push();
}
