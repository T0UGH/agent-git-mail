import { mkdirSync } from 'fs';
import { GitExecError, git } from './exec.js';

export async function ensureGitIdentity(repoPath: string): Promise<void> {
  const missing: string[] = [];

  try {
    const name = git(repoPath, ['config', '--local', '--get', 'user.name']).stdout.trim();
    if (!name) missing.push('user.name');
  } catch {
    missing.push('user.name');
  }

  try {
    const email = git(repoPath, ['config', '--local', '--get', 'user.email']).stdout.trim();
    if (!email) missing.push('user.email');
  } catch {
    missing.push('user.email');
  }

  if (missing.length > 0) {
    throw new Error(
      `Git identity is missing for repo ${repoPath}. Set ${missing.join(' and ')} before sending mail.`
    );
  }
}

export async function ensureMaildirs(repoPath: string): Promise<void> {
  for (const dir of ['inbox', 'outbox', 'archive']) {
    mkdirSync(`${repoPath}/${dir}`, { recursive: true });
  }
}
