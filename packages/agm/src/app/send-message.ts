import { readFileSync } from 'fs';
import { resolve } from 'path';
import { GitRepo } from '../git/repo.js';
import { generateFilename, generateUniqueSuffix } from '../domain/filename.js';
import { serializeFrontmatter, type MessageFrontmatter } from '../domain/frontmatter.js';
import { loadConfig } from '../config/load.js';
import { resolveProfile } from '../config/profile.js';
import { getProfileSelfId, getProfileContactRemoteRepoUrl } from '../config/index.js';
import { getSelfRepoPath, getContactCachePath } from '../config/profile-paths.js';
import { ensureContactCache } from '../git/contact-cache.js';
import { maybePush } from './git-push.js';
import { ensureGitIdentity, ensureMaildirs } from '../git/preflight.js';

export interface SendOptions {
  from: string;
  to: string;
  subject: string;
  bodyFile: string;
  replyTo?: string;
  expectsReply?: boolean;
  profile: string;
  configPath?: string;
}

/**
 * Send a message. Mailbox model: writes to sender's outbox AND recipient's inbox.
 * Both sides commit their copy. Sender pushes their origin; recipient repo is pushed
 * by the recipient's own agent (or in test environments, local paths allow direct push).
 */
export async function sendMessage(opts: SendOptions): Promise<{ filename: string }> {
  const config = loadConfig(opts.configPath);
  const profile = resolveProfile(config, opts.profile);
  const selfId = getProfileSelfId(profile);

  // Sender repo = self repo (sender IS the profile owner)
  const senderRepoPath = getSelfRepoPath(opts.from);
  // Recipient repo = sender's contact cache of recipient
  const recipientRepoPath = getContactCachePath(opts.profile, opts.to);

  // Verify recipient is known (V3: check contacts have remote URLs)
  const contactRemoteUrl = getProfileContactRemoteRepoUrl(profile, opts.to);
  if (!contactRemoteUrl) {
    throw new Error(`Unknown recipient: ${opts.to}`);
  }

  // Ensure recipient's mailbox is available (validates remote URL, clones if needed)
  await ensureContactCache({ profile: opts.profile, contactId: opts.to, remoteRepoUrl: contactRemoteUrl });

  if (opts.to === selfId) {
    throw new Error(`Cannot send to yourself (${opts.to})`);
  }

  const body = readFileSync(resolve(opts.bodyFile), 'utf-8');
  const createdAt = new Date().toISOString().replace(/\.\d{3}/, '').replace(/:/g, '-');
  const suffix = generateUniqueSuffix();
  const filename = generateFilename({ from: opts.from, to: opts.to, createdAt, suffix });

  const frontmatter: MessageFrontmatter = {
    from: opts.from,
    to: opts.to,
    subject: opts.subject,
    created_at: createdAt.replace(/-/g, ':').replace('+', '+'),
    reply_to: opts.replyTo,
    expects_reply: opts.expectsReply ?? false,
  };

  const content = serializeFrontmatter(frontmatter) + '\n\n' + body;

  // --- Sender side: write to outbox ---
  await ensureMaildirs(senderRepoPath);
  await ensureGitIdentity(senderRepoPath);
  const senderRepo = new GitRepo(senderRepoPath);
  const outboxPath = resolve(senderRepoPath, 'outbox', filename);
  await writeFileAtomic(outboxPath, content);
  await senderRepo.add(`outbox/${filename}`);
  await senderRepo.commit(`agm: send ${filename}`, `outbox/${filename}`);
  await maybePush(senderRepo);

  // --- Recipient side: write to inbox ---
  await ensureMaildirs(recipientRepoPath);
  await ensureGitIdentity(recipientRepoPath);
  const recipientRepo = new GitRepo(recipientRepoPath);
  const inboxPath = resolve(recipientRepoPath, 'inbox', filename);
  await writeFileAtomic(inboxPath, content);
  await recipientRepo.add(`inbox/${filename}`);
  await recipientRepo.commit(`agm: deliver ${filename}`, `inbox/${filename}`);
  await maybePush(recipientRepo);

  return { filename };
}

async function writeFileAtomic(path: string, content: string): Promise<void> {
  const { writeFileSync, mkdirSync } = await import('fs');
  const { dirname } = await import('path');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf-8');
}
