import { readdirSync } from 'fs';
import { resolve } from 'path';
import { parseFrontmatter } from '../domain/frontmatter.js';
import { loadConfig } from '../config/load.js';

export interface ListOptions {
  agent: string;
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

  const agent = config.agents[opts.agent];
  if (!agent) throw new Error(`Unknown agent: ${opts.agent}`);

  const dir = opts.dir ?? 'inbox';
  const dirPath = resolve(agent.repo_path, dir);

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
