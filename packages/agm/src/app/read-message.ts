import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseFrontmatter, type MessageFrontmatter } from '../domain/frontmatter.js';
import { loadConfig } from '../config/load.js';
import { resolveProfile } from '../config/profile.js';
import { getProfileSelfId, getProfileContactRemoteRepoUrl } from '../config/index.js';
import { getSelfRepoPath, getContactCachePath } from '../config/profile-paths.js';
import { refreshContactCache } from '../git/contact-cache.js';

export interface ReadOptions {
  filename: string;
  agent: string;
  profile: string;
  dir?: 'inbox' | 'outbox' | 'archive';
  configPath?: string;
}

export async function readMessage(opts: ReadOptions): Promise<{ frontmatter: MessageFrontmatter; body: string }> {
  const config = loadConfig(opts.configPath);
  const profile = resolveProfile(config, opts.profile);
  const selfId = getProfileSelfId(profile);

  const isSelf = opts.agent === selfId;
  const repoPath = isSelf
    ? getSelfRepoPath(opts.profile)
    : getContactCachePath(opts.profile, opts.agent);
  if (!repoPath) throw new Error(`Unknown agent: ${opts.agent}`);

  // When reading from a contact's mailbox, refresh the cache to get latest
  if (!isSelf) {
    const contactRemoteUrl = getProfileContactRemoteRepoUrl(profile, opts.agent);
    if (contactRemoteUrl) {
      await refreshContactCache({ profile: opts.profile, contactId: opts.agent, remoteRepoUrl: contactRemoteUrl });
    }
  }

  const dir = opts.dir ?? 'inbox';
  const filePath = resolve(repoPath, dir, opts.filename);
  const raw = readFileSync(filePath, 'utf-8');
  const parsed = parseFrontmatter(raw);

  if (!parsed.ok) throw new Error(`Cannot parse message: ${parsed.error}`);
  return { frontmatter: parsed.data, body: parsed.body };
}
