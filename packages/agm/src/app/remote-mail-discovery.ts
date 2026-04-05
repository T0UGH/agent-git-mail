import { readFileSync } from 'fs';
import { GitRepo } from '../git/repo.js';
import { parseFrontmatter } from '../domain/frontmatter.js';
import { resolveProfile } from '../config/profile.js';
import { getProfileSelfId, getProfileContactRemoteRepoUrl, getProfileContactNames } from '../config/index.js';
import { getSelfRepoPath } from '../config/profile-paths.js';
import type { Config } from '../config/schema.js';

export interface DiscoveredMail {
  contact: string;      // who sent this message
  filename: string;    // filename in sender's outbox
  from: string;         // parsed from frontmatter
  subject: string;
}

export interface RemoteDiscoveryOptions {
  config: Config;
  profile: string;
}

/**
 * Discover new mail from contact remotes.
 *
 * Algorithm per contact:
 * 1. Fetch contact remote
 * 2. Read per-contact waterline ref (refs/agm/last-seen/<contact>)
 * 3. Get current remote branch SHA for that contact
 * 4. If no waterline: initialize waterline and return (no backfill)
 * 5. Diff waterline..current remote SHA
 * 6. Inspect only added outbox/*.md files from contact's remote commit range
 * 7. Parse frontmatter; keep only messages where to === self.id
 * 8. Return discovered messages and updated waterline SHA
 */
export async function discoverNewMail(opts: RemoteDiscoveryOptions): Promise<DiscoveredMail[]> {
  const config = opts.config;
  const profile = resolveProfile(config, opts.profile);
  const selfId = getProfileSelfId(profile);
  if (!selfId) throw new Error('self.id is required for remote mail discovery');

  const selfRepoPath = getSelfRepoPath(opts.profile);
  if (!selfRepoPath) throw new Error(`derived self repo path is required for remote mail discovery (profile: ${opts.profile})`);

  const selfRepo = new GitRepo(selfRepoPath);

  const contactNames = getProfileContactNames(profile);
  const results: DiscoveredMail[] = [];

  for (const contact of contactNames) {
    const contactRemoteUrl = getProfileContactRemoteRepoUrl(profile, contact);
    if (!contactRemoteUrl) continue; // skip unknown contacts

    // Ensure the contact remote exists as a remote in our local clone
    await ensureRemote(selfRepo, contact, contactRemoteUrl);

    // Fetch latest from contact remote
    try {
      await selfRepo.fetchRemote(contact);
    } catch {
      // If fetch fails (e.g., remote unavailable), skip this contact
      continue;
    }

    const waterlineRef = `refs/agm/last-seen/${contact}`;
    const lastSeen = await selfRepo.getRef(waterlineRef);

    // Get current SHA of contact's remote main branch
    const currentSha = await selfRepo.getRemoteRef(contact, 'main');
    if (!currentSha) continue; // contact remote has no main branch

    if (!lastSeen) {
      // First run for this contact: initialize waterline, no backfill
      await selfRepo.updateRef(waterlineRef, currentSha);
      continue;
    }

    if (lastSeen === currentSha) {
      // No new commits from this contact
      continue;
    }

    // Diff last seen vs current
    const diffOutput = await selfRepo.diffNames(lastSeen, currentSha);
    const newOutboxFiles = parseOutboxDiff(diffOutput);

    for (const filename of newOutboxFiles) {
      // Read the file content from the contact's remote branch
      const content = await readFileFromRemote(selfRepo, contact, `outbox/${filename}`);
      if (!content) continue;

      const parsed = parseFrontmatter(content);
      if (!parsed.ok) continue;

      const mail = parsed.data;
      // Only deliver messages addressed to self
      if (mail.to !== selfId) continue;

      results.push({
        contact,
        filename,
        from: mail.from,
        subject: mail.subject ?? 'Re: ' + mail.subject,
      });
    }

    // Advance waterline for this contact
    await selfRepo.updateRef(waterlineRef, currentSha);
  }

  return results;
}

function parseOutboxDiff(diffOutput: string): string[] {
  const files: string[] = [];
  for (const line of diffOutput.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Only "A" (added) files in outbox/
    const match = trimmed.match(/^A\s+outbox\/(.+)$/);
    if (match) files.push(match[1]);
  }
  return files;
}

async function readFileFromRemote(repo: GitRepo, remote: string, path: string): Promise<string | null> {
  const ref = `refs/remotes/${remote}/main`;
  return await repo.showFileAtRef(ref, path);
}

async function ensureRemote(repo: GitRepo, name: string, url: string): Promise<void> {
  const existingUrl = await repo.getRemoteUrl(name);
  if (!existingUrl) {
    await repo.addRemote(name, url);
    return;
  }
  if (existingUrl.trim() === url.trim()) return;
  await repo.setRemoteUrl(name, url);
}
