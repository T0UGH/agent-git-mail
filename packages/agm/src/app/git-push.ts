import { GitRepo } from '../git/repo.js';

/**
 * Silent push: swallows errors. Used where failure to push is non-critical
 * (e.g., when the remote is unreachable and the message is already committed locally).
 * The sender side uses this because local commit success is the primary guarantee;
 * remote push is best-effort for sender.
 */
export async function maybePush(repo: Pick<GitRepo, 'hasRemote' | 'push'>): Promise<void> {
  const hasRemote = await repo.hasRemote();
  if (!hasRemote) return;
  await repo.push();
}

/**
 * Push that throws on failure. Used when caller needs to emit structured
 * failure events (e.g., push_failed) before handling the error.
 */
export async function mustPush(repo: Pick<GitRepo, 'hasRemote' | 'push'>): Promise<void> {
  const hasRemote = await repo.hasRemote();
  if (!hasRemote) return;
  await repo.push();
}
