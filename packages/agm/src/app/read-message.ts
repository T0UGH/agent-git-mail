import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseFrontmatter, type MessageFrontmatter } from '../domain/frontmatter.js';

export interface ReadOptions {
  filename: string;
  agent: string;
  dir?: 'inbox' | 'outbox' | 'archive';
  configPath?: string;
}

export async function readMessage(opts: ReadOptions): Promise<{ frontmatter: MessageFrontmatter; body: string }> {
  const { loadConfig, getAgentRepoPath } = await import('../config/index.js');
  const config = loadConfig(opts.configPath);

  const repoPath = getAgentRepoPath(config, opts.agent);
  if (!repoPath) throw new Error(`Unknown agent: ${opts.agent}`);

  const dir = opts.dir ?? 'inbox';
  const filePath = resolve(repoPath, dir, opts.filename);
  const raw = readFileSync(filePath, 'utf-8');
  const parsed = parseFrontmatter(raw);

  if (!parsed.ok) throw new Error(`Cannot parse message: ${parsed.error}`);
  return { frontmatter: parsed.data, body: parsed.body };
}
