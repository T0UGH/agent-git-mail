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
 * Reply to a message. Remote-only transport: only writes to replier's own outbox and pushes
 * to replier's origin remote. The original sender's daemon detects the reply by fetching
 * the replier's remote (replier's outbox commit).
 */
export async function replyMessage(opts: ReplyOptions): Promise<{ filename: string }> {
  const config = loadConfig(opts.configPath);

  const replierRepoPath = getAgentRepoPath(config, opts.from);
  if (!replierRepoPath) unknownAgentError(opts.from, config);

  const dir = opts.dir ?? 'inbox';
  // Search for the original message in sender's outbox or inbox
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
  if (!getContactRemoteRepoUrl(config, to)) {
    unknownAgentError(to, config);
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

  await ensureMaildirs(replierRepoPath);
  await ensureGitIdentity(replierRepoPath);

  const replierRepo = new GitRepo(replierRepoPath);

  // Write to replier outbox only (remote-only model: no recipient local writes)
  const replierContent = serializeFrontmatter(frontmatter) + '\n\n' + body;
  await writeFileAtomic(resolve(replierRepoPath, 'outbox', filename), replierContent);
  await replierRepo.add(`outbox/${filename}`);
  await replierRepo.commit(`agm: send ${filename}`, `outbox/${filename}`);
  await maybePush(replierRepo);

  return { filename };
}

async function writeFileAtomic(path: string, content: string): Promise<void> {
  const { writeFileSync, mkdirSync } = await import('fs');
  const { dirname } = await import('path');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf-8');
}
