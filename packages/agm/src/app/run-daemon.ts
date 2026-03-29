import { GitRepo } from '../git/repo.js';
import { GitWaterline } from '../git/waterline.js';
import { parseFrontmatter } from '../domain/frontmatter.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { Config } from '../config/schema.js';

export interface DaemonOptions {
  config: Config;
  agentName?: string;
  onNewMail?: (mail: { agent: string; filename: string; from: string }) => Promise<void>;
}

export async function runDaemon(opts: DaemonOptions): Promise<void> {
  const pollInterval = (opts.config.runtime?.poll_interval_seconds ?? 30) * 1000;
  const agents = opts.agentName
    ? { [opts.agentName]: opts.config.agents[opts.agentName] }
    : opts.config.agents;

  if (opts.onNewMail) {
    // One-shot poll for testing
    await runPoll(Object.entries(agents), opts.onNewMail);
    return;
  }

  // Daemon loop
  while (true) {
    const start = Date.now();
    try {
      for (const [name, agent] of Object.entries(agents)) {
        await watchAgent(name, agent, opts.onNewMail);
      }
    } catch (e) {
      console.error('[daemon] poll error:', e);
    }
    const elapsed = Date.now() - start;
    const sleepTime = Math.max(0, pollInterval - elapsed);
    await sleep(sleepTime);
  }
}

async function watchAgent(
  name: string,
  agent: { repo_path: string },
  onNewMail?: (mail: { agent: string; filename: string; from: string }) => Promise<void>,
): Promise<void> {
  const repo = new GitRepo(agent.repo_path);
  const valid = await repo.verify();
  if (!valid) return;

  const waterline = new GitWaterline(repo);

  try {
    await repo.pull();
  } catch {
    // ignore pull errors
  }

  const currentSha = await repo.getHeadSha();
  const lastSeen = await waterline.read();

  if (!lastSeen) {
    // First run: set waterline, don't backfill
    await waterline.write(currentSha);
    return;
  }

  if (lastSeen === currentSha) {
    // No new commits
    return;
  }

  const diffOutput = await repo.diffNames(lastSeen, currentSha);
  const newInboxFiles = parseDiff(diffOutput);

  for (const filename of newInboxFiles) {
    const from = await extractFrom(resolve(agent.repo_path, 'inbox', filename));
    console.log(`[daemon] new mail for ${name}: from=${from} file=${filename}`);
    if (onNewMail) {
      await onNewMail({ agent: name, filename, from });
    }
  }

  await waterline.write(currentSha);
}

async function runPoll(
  agents: [string, { repo_path: string }][],
  onNewMail: (mail: { agent: string; filename: string; from: string }) => Promise<void>,
): Promise<void> {
  for (const [name, agent] of agents) {
    await watchAgent(name, agent, onNewMail);
  }
}

function parseDiff(diffOutput: string): string[] {
  const files: string[] = [];
  for (const line of diffOutput.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^A\s+inbox\/(.+)$/);
    if (match) files.push(match[1]);
  }
  return files;
}

async function extractFrom(filePath: string): Promise<string> {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = parseFrontmatter(raw);
    if (parsed.ok) return parsed.data.from;
  } catch {
    // fall through
  }
  return 'unknown';
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
