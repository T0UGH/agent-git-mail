import { readFileSync } from 'fs';
import { resolve } from 'path';
import { GitRepo } from '../git/repo.js';
import { generateFilename, generateUniqueSuffix } from '../domain/filename.js';
import { serializeFrontmatter, type MessageFrontmatter, parseFrontmatter } from '../domain/frontmatter.js';
import { loadConfig } from '../config/load.js';
import { getAgentRepoPath } from '../config/index.js';
import { maybePush } from './git-push.js';
import { ensureGitIdentity, ensureMaildirs } from '../git/preflight.js';

export interface ReplyOptions {
  originalFilename: string;
  from: string;
  bodyFile: string;
  dir?: 'inbox' | 'outbox';
  configPath?: string;
}

export async function replyMessage(opts: ReplyOptions): Promise<{ filename: string }> {
  const config = loadConfig(opts.configPath);

  const fromRepo = getAgentRepoPath(config, opts.from);
  if (!fromRepo) throw new Error(`Unknown agent: ${opts.from}`);

  const dir = opts.dir ?? 'inbox';
  // Find the original message in sender's outbox or inbox
  const searchDirs = dir === 'outbox'
    ? [resolve(fromRepo, 'outbox')]
    : [resolve(fromRepo, 'inbox'), resolve(fromRepo, 'outbox')];

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

  const toRepo = getAgentRepoPath(config, to);
  if (!toRepo) throw new Error(`Unknown agent: ${to}`);

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

  await ensureMaildirs(fromRepo);
  await ensureMaildirs(toRepo);
  await ensureGitIdentity(fromRepo);
  await ensureGitIdentity(toRepo);

  const senderRepo = new GitRepo(fromRepo);
  const recipientRepo = new GitRepo(toRepo);

  // Write to sender outbox
  const senderContent = serializeFrontmatter(frontmatter) + '\n\n' + body;
  await writeFileAtomic(resolve(senderRepo['repoPath'], 'outbox', filename), senderContent);
  await senderRepo.add(`outbox/${filename}`);
  await senderRepo.commit(`agm: send ${filename}`, `outbox/${filename}`);
  await maybePush(senderRepo);

  // Write to recipient inbox
  const recipientContent = serializeFrontmatter(frontmatter) + '\n\n' + body;
  await writeFileAtomic(resolve(recipientRepo['repoPath'], 'inbox', filename), recipientContent);
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
