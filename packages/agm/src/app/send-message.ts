import { readFileSync } from 'fs';
import { resolve } from 'path';
import { GitRepo } from '../git/repo.js';
import { generateFilename, generateUniqueSuffix } from '../domain/filename.js';
import { serializeFrontmatter, type MessageFrontmatter } from '../domain/frontmatter.js';
import { loadConfig } from '../config/load.js';

export interface SendOptions {
  from: string;
  to: string;
  subject: string;
  bodyFile: string;
  replyTo?: string;
  expectsReply?: boolean;
  configPath?: string;
}

export async function sendMessage(opts: SendOptions): Promise<{ filename: string }> {
  const config = loadConfig(opts.configPath);

  const fromAgent = config.agents[opts.from];
  const toAgent = config.agents[opts.to];
  if (!fromAgent) throw new Error(`Unknown agent: ${opts.from}`);
  if (!toAgent) throw new Error(`Unknown agent: ${opts.to}`);

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

  const senderRepo = new GitRepo(fromAgent.repo_path);
  const recipientRepo = new GitRepo(toAgent.repo_path);

  // Write to sender outbox
  const senderContent = serializeFrontmatter(frontmatter) + '\n\n' + body;
  const outboxPath = resolve(senderRepo['repoPath'], 'outbox', filename);
  await writeFileAtomic(outboxPath, senderContent);
  await senderRepo.add(`outbox/${filename}`);
  await senderRepo.commit(`agm: send ${filename}`, `outbox/${filename}`);
  await maybePush(senderRepo);

  // Write to recipient inbox
  const recipientContent = serializeFrontmatter(frontmatter) + '\n\n' + body;
  const inboxPath = resolve(recipientRepo['repoPath'], 'inbox', filename);
  await writeFileAtomic(inboxPath, recipientContent);
  await recipientRepo.add(`inbox/${filename}`);
  await recipientRepo.commit(`agm: deliver ${filename}`, `inbox/${filename}`);
  await maybePush(recipientRepo);

  return { filename };
}

async function maybePush(repo: GitRepo): Promise<void> {
  try {
    await repo.push();
  } catch {
    // No remote configured, skip
  }
}

async function writeFileAtomic(path: string, content: string): Promise<void> {
  const { writeFileSync, mkdirSync } = await import('fs');
  const { dirname } = await import('path');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf-8');
}
