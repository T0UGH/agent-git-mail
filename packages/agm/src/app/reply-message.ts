import { readFileSync } from 'fs';
import { resolve } from 'path';
import { GitRepo } from '../git/repo.js';
import { generateFilename, generateUniqueSuffix } from '../domain/filename.js';
import { serializeFrontmatter, type MessageFrontmatter, parseFrontmatter } from '../domain/frontmatter.js';
import { loadConfig } from '../config/load.js';
import { getAgentRepoPath, getContactRemoteRepoUrl, unknownAgentError, isConfigV2 } from '../config/index.js';
import { maybePush } from './git-push.js';
import { ensureGitIdentity, ensureMaildirs } from '../git/preflight.js';

export interface ReplyOptions {
  originalFilename: string;
  from: string;
  bodyFile: string;
  dir?: 'inbox' | 'outbox';
  configPath?: string;
}

/**
 * Reply to a message. Mailbox model: writes to replier's outbox AND original sender's inbox.
 * Both sides commit their copy.
 */
export async function replyMessage(opts: ReplyOptions): Promise<{ filename: string }> {
  const config = loadConfig(opts.configPath);

  const replierRepoPath = getAgentRepoPath(config, opts.from);
  if (!replierRepoPath) unknownAgentError(opts.from, config);

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

  // Verify recipient is known (recipient = original sender = 'to')
  // v2: contacts have remote URLs; must also have local path for dual-write
  // legacy v0/v1: use getAgentRepoPath which works for agents map
  const recipientRepoPath = getAgentRepoPath(config, to);
  if (isConfigV2(config)) {
    if (!getContactRemoteRepoUrl(config, to)) {
      unknownAgentError(to, config);
    }
    if (!recipientRepoPath) {
      throw new Error(`Recipient ${to} has no local repo path. ` +
        `Add "repo_path" to contacts.${to} in config for dual-write delivery.`);
    }
  } else {
    if (!getAgentRepoPath(config, to)) {
      unknownAgentError(to, config);
    }
  }

  const selfId = (config as { self?: { id?: string } }).self?.id;
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
  await ensureMaildirs(replierRepoPath);
  await ensureGitIdentity(replierRepoPath);
  const replierRepo = new GitRepo(replierRepoPath);
  await writeFileAtomic(resolve(replierRepoPath, 'outbox', filename), content);
  await replierRepo.add(`outbox/${filename}`);
  await replierRepo.commit(`agm: send ${filename}`, `outbox/${filename}`);
  await maybePush(replierRepo);

  // --- Original sender side: write to inbox ---
  // recipientRepoPath is guaranteed non-null after checks above
  const _recipientRepoPath = recipientRepoPath!;
  await ensureMaildirs(_recipientRepoPath);
  await ensureGitIdentity(_recipientRepoPath);
  const recipientRepo = new GitRepo(_recipientRepoPath);
  await writeFileAtomic(resolve(_recipientRepoPath, 'inbox', filename), content);
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
