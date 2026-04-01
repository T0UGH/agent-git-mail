import { readFileSync } from 'fs';
import { resolve } from 'path';
import { GitRepo } from '../git/repo.js';
import { generateFilename, generateUniqueSuffix } from '../domain/filename.js';
import { serializeFrontmatter, type MessageFrontmatter } from '../domain/frontmatter.js';
import { loadConfig } from '../config/load.js';
import { getAgentRepoPath, getContactRemoteRepoUrl, unknownAgentError, isConfigV2 } from '../config/index.js';
import { maybePush } from './git-push.js';
import { ensureGitIdentity, ensureMaildirs } from '../git/preflight.js';

export interface SendOptions {
  from: string;
  to: string;
  subject: string;
  bodyFile: string;
  replyTo?: string;
  expectsReply?: boolean;
  configPath?: string;
}

/**
 * Send a message. Remote-only transport: only writes to sender's own outbox and pushes
 * to sender's origin remote. The recipient's daemon detects the message by fetching
 * the sender's remote (sender's outbox commit) and diffing against per-contact waterline.
 */
export async function sendMessage(opts: SendOptions): Promise<{ filename: string }> {
  const config = loadConfig(opts.configPath);

  const senderRepoPath = getAgentRepoPath(config, opts.from);
  if (!senderRepoPath) unknownAgentError(opts.from, config);

  // Verify recipient is known (v2: contacts have remote URLs, no local paths; legacy: same getAgentRepoPath works)
  if (!getContactRemoteRepoUrl(config, opts.to)) {
    unknownAgentError(opts.to, config);
  }

  const selfId = (config as { self?: { id?: string } }).self?.id;
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

  // Ensure sender's outbox exists and sender has git identity set
  await ensureMaildirs(senderRepoPath);
  await ensureGitIdentity(senderRepoPath);

  const senderRepo = new GitRepo(senderRepoPath);

  // Write to sender outbox (only place we write in remote-only model)
  const senderContent = serializeFrontmatter(frontmatter) + '\n\n' + body;
  const outboxPath = resolve(senderRepoPath, 'outbox', filename);
  await writeFileAtomic(outboxPath, senderContent);
  await senderRepo.add(`outbox/${filename}`);
  await senderRepo.commit(`agm: send ${filename}`, `outbox/${filename}`);
  await maybePush(senderRepo);

  return { filename };
}

async function writeFileAtomic(path: string, content: string): Promise<void> {
  const { writeFileSync, mkdirSync } = await import('fs');
  const { dirname } = await import('path');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf-8');
}
