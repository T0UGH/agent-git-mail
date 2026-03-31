import { resolve } from 'path';
import { GitRepo } from '../git/repo.js';
import { loadConfig, getAgentRepoPath, unknownAgentError } from '../config/index.js';
import { ensureGitIdentity, ensureMaildirs } from '../git/preflight.js';

export interface ArchiveOptions {
  filename: string;
  agent: string;
  configPath?: string;
}

export async function archiveMessage(opts: ArchiveOptions): Promise<void> {
  const config = loadConfig(opts.configPath);

  const repoPath = getAgentRepoPath(config, opts.agent);
  if (!repoPath) unknownAgentError(opts.agent, config);

  await ensureMaildirs(repoPath);
  await ensureGitIdentity(repoPath);

  const repo = new GitRepo(repoPath);
  await repo.moveFile(`inbox/${opts.filename}`, `archive/${opts.filename}`);
  await repo.commitStaged(`agm: archive ${opts.filename}`);
  // archive MUST push
  await repo.push();
}
