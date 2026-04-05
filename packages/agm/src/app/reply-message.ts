import { readFileSync } from 'fs';
import { resolve } from 'path';
import { GitRepo } from '../git/repo.js';
import { generateFilename, generateUniqueSuffix } from '../domain/filename.js';
import { serializeFrontmatter, type MessageFrontmatter, parseFrontmatter } from '../domain/frontmatter.js';
import { loadConfig } from '../config/load.js';
import { resolveProfile } from '../config/profile.js';
import { getProfileSelfId, getProfileContactRemoteRepoUrl } from '../config/index.js';
import { getSelfRepoPath, getContactCachePath } from '../config/profile-paths.js';
import { ensureContactCache } from '../git/contact-cache.js';
import { maybePush } from './git-push.js';
import { ensureGitIdentity, ensureMaildirs } from '../git/preflight.js';

export interface ReplyOptions {
  originalFilename: string;
  from: string;
  bodyFile: string;
  profile: string;
  dir?: 'inbox' | 'outbox';
  configPath?: string;
}


export interface ReplyMessageResult {
  filename: string;
  /** True if replier outbox write + commit + push succeeded */
  localSuccess: boolean;
  /** True if original sender inbox write + commit + push succeeded */
  deliverySuccess: boolean;
  /** Present when one side succeeded but the other failed */
  partialFailure?: {
    stage: 'replier' | 'sender';
    error: string;
  };
}

/**
 * Reply to a message. Mailbox model: writes to replier's outbox AND original sender's inbox.
 * Both sides commit their copy.
 */
export async function replyMessage(opts: ReplyOptions): Promise<ReplyMessageResult> {
  const config = loadConfig(opts.configPath);
  const profile = resolveProfile(config, opts.profile);
  const selfId = getProfileSelfId(profile);

  if (opts.from !== selfId) {
    throw new Error(`Sender identity mismatch: --from=${opts.from} but profile '${opts.profile}' is configured as self.id='${selfId}'`);
  }

  const replierRepoPath = getSelfRepoPath(opts.profile);

  const dir = opts.dir ?? 'inbox';
  // Search for the original message in inbox or outbox
  const searchDirs = dir === 'outbox'
    ? [resolve(replierRepoPath, 'outbox')]
    : [resolve(replierRepoPath, 'inbox'), resolve(replierRepoPath, 'outbox')];

  let originalPath: string | null = null;
  for (const d of searchDirs) {
    const p = resolve(d, opts.originalFilename);
    try {
      readFileSync(p, 'utf-8');
      originalPath = p;
      break;
    } catch {
      // try next
    }
  }

  if (!originalPath) throw new Error(`Original message not found: ${opts.originalFilename}`);

  const raw = readFileSync(originalPath, 'utf-8');
  const parsed = parseFrontmatter(raw);
  if (!parsed.ok) throw new Error(`Cannot parse original message: ${parsed.error}`);

  const original = parsed.data;
  // recipient is whoever sent the original message
  const to = original.from;

  // Verify recipient is known (V3: check contacts have remote URLs)
  const contactRemoteUrl = getProfileContactRemoteRepoUrl(profile, to);
  if (!contactRemoteUrl) {
    throw new Error(`Unknown recipient: ${to}`);
  }

  // Ensure recipient's mailbox is available (validates remote URL, clones if needed)
  await ensureContactCache({ profile: opts.profile, contactId: to, remoteRepoUrl: contactRemoteUrl });

  if (to === selfId) {
    throw new Error(`Cannot reply to yourself`);
  }

  const body = readFileSync(resolve(opts.bodyFile), 'utf-8');
  const createdAt = new Date().toISOString().replace(/\.\d{3}/, '').replace(/:/g, '-');
  const suffix = generateUniqueSuffix();
  const filename = generateFilename({ from: opts.from, to, createdAt, suffix });

  const frontmatter: MessageFrontmatter = {
    from: opts.from,
    to,
    subject: `Re: ${original.subject}`,
    created_at: createdAt.replace(/-/g, ':').replace('+', '+'),
    reply_to: opts.originalFilename,
    expects_reply: false,
  };

  const content = serializeFrontmatter(frontmatter) + '\n\n' + body;

  // --- Replier side: write to outbox ---
  let localSuccess = false;
  let deliverySuccess = false;
  let partialFailure: ReplyMessageResult['partialFailure'];

  try {
    await ensureMaildirs(replierRepoPath);
    await ensureGitIdentity(replierRepoPath);
    const replierRepo = new GitRepo(replierRepoPath);
    await writeFileAtomic(resolve(replierRepoPath, 'outbox', filename), content);
    await replierRepo.add(`outbox/${filename}`);
    await replierRepo.commit(`agm: send ${filename}`, `outbox/${filename}`);
    await maybePush(replierRepo);
    localSuccess = true;
  } catch (e) {
    partialFailure = { stage: 'replier', error: e instanceof Error ? e.message : String(e) };
  }

  // --- Original sender side: write to inbox ---
  // Delivery target is sender's contact cache of the recipient
  try {
    const recipientRepoPath = getContactCachePath(opts.profile, to);
    await ensureMaildirs(recipientRepoPath);
    await ensureGitIdentity(recipientRepoPath);
    const recipientRepo = new GitRepo(recipientRepoPath);
    await writeFileAtomic(resolve(recipientRepoPath, 'inbox', filename), content);
    await recipientRepo.add(`inbox/${filename}`);
    await recipientRepo.commit(`agm: deliver ${filename}`, `inbox/${filename}`);
    await maybePush(recipientRepo);
    deliverySuccess = true;
  } catch (e) {
    if (partialFailure) {
      // Both failed
      return { filename, localSuccess, deliverySuccess: false };
    }
    partialFailure = { stage: 'sender', error: e instanceof Error ? e.message : String(e) };
  }

  return { filename, localSuccess, deliverySuccess, partialFailure };
}

async function writeFileAtomic(path: string, content: string): Promise<void> {
  const { writeFileSync, mkdirSync } = await import('fs');
  const { dirname } = await import('path');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf-8');
}
