import { resolve } from 'path';
import { GitRepo } from '../git/repo.js';
import { loadConfig } from '../config/load.js';
import { resolveProfile } from '../config/profile.js';
import { getProfileSelfId, getProfileContactRemoteRepoUrl } from '../config/index.js';
import { getSelfRepoPath, getContactCachePath } from '../config/profile-paths.js';
import { refreshContactCache } from '../git/contact-cache.js';
import { ensureGitIdentity, ensureMaildirs } from '../git/preflight.js';

export interface ArchiveOptions {
  filename: string;
  agent: string;
  profile: string;
  configPath?: string;
}

export async function archiveMessage(opts: ArchiveOptions): Promise<void> {
  const config = loadConfig(opts.configPath);
  const profile = resolveProfile(config, opts.profile);
  const selfId = getProfileSelfId(profile);

  const isSelf = opts.agent === selfId;
  const repoPath = isSelf
    ? getSelfRepoPath(opts.profile)
    : getContactCachePath(opts.profile, opts.agent);
  if (!repoPath) throw new Error(`Unknown agent: ${opts.agent}`);

  // When archiving from a contact's mailbox, refresh the cache first
  if (!isSelf) {
    const contactRemoteUrl = getProfileContactRemoteRepoUrl(profile, opts.agent);
    if (contactRemoteUrl) {
      await refreshContactCache({ profile: opts.profile, contactId: opts.agent, remoteRepoUrl: contactRemoteUrl });
    }
  }

  await ensureMaildirs(repoPath);
  await ensureGitIdentity(repoPath);

  const repo = new GitRepo(repoPath);
  await repo.moveFile(`inbox/${opts.filename}`, `archive/${opts.filename}`);
  await repo.commitStaged(`agm: archive ${opts.filename}`);
  // archive MUST push
  await repo.push();
}
