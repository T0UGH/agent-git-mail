import { resolve } from 'path';
import { GitRepo } from '../git/repo.js';
import { loadConfig } from '../config/load.js';

export interface ArchiveOptions {
  filename: string;
  agent: string;
  configPath?: string;
}

export async function archiveMessage(opts: ArchiveOptions): Promise<void> {
  const config = loadConfig(opts.configPath);

  const agent = config.agents[opts.agent];
  if (!agent) throw new Error(`Unknown agent: ${opts.agent}`);

  const repo = new GitRepo(agent.repo_path);
  await repo.moveFile(`inbox/${opts.filename}`, `archive/${opts.filename}`);
  await repo.commit(`agm: archive ${opts.filename}`, `archive/${opts.filename}`);
  // archive MUST push
  await repo.push();
}
