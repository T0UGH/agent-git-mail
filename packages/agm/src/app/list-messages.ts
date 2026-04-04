import { readdirSync } from 'fs';
import { resolve } from 'path';
import { parseFrontmatter } from '../domain/frontmatter.js';
import { loadConfig } from '../config/load.js';
import { resolveProfile } from '../config/profile.js';
import { getProfileSelfId, getProfileContactRemoteRepoUrl } from '../config/index.js';
import { getSelfRepoPath, getContactCachePath } from '../config/profile-paths.js';
import { refreshContactCache } from '../git/contact-cache.js';

export interface ListOptions {
  agent: string;
  profile: string;
  dir?: 'inbox' | 'outbox' | 'archive';
  format?: 'table' | 'json';
  configPath?: string;
}

export interface ListEntry {
  filename: string;
  from: string;
  to: string;
  subject: string;
  created_at: string;
  reply_to?: string;
  expects_reply: boolean;
}

export async function listMessages(opts: ListOptions): Promise<ListEntry[]> {
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
  const dirPath = resolve(repoPath, dir);

  let files: string[];
  try {
    files = readdirSync(dirPath).filter(f => f.endsWith('.md'));
  } catch {
    return [];
  }

  const entries: ListEntry[] = [];
  for (const file of files) {
    try {
      const { readFileSync } = await import('fs');
      const raw = readFileSync(resolve(dirPath, file), 'utf-8');
      const parsed = parseFrontmatter(raw);
      if (parsed.ok) {
        entries.push({ filename: file, ...parsed.data });
      }
    } catch {
      // skip unparseable
    }
  }

  // Sort by created_at descending
  entries.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return entries;
}
