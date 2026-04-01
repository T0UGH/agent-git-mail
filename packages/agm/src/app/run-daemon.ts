import { GitRepo } from '../git/repo.js';
import { GitWaterline } from '../git/waterline.js';
import { parseFrontmatter } from '../domain/frontmatter.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { Config } from '../config/schema.js';
import { getAgentEntries, isConfigV2 } from '../config/index.js';
import { discoverNewMail, type DiscoveredMail } from './remote-mail-discovery.js';

export interface DaemonOptions {
  config: Config;
  agentName?: string;
  onNewMail?: (mail: { agent: string; filename: string; from: string }) => Promise<void>;
}

export async function runDaemon(opts: DaemonOptions): Promise<void> {
  const pollInterval = (opts.config.runtime?.poll_interval_seconds ?? 30) * 1000;

  if (opts.onNewMail) {
    // One-shot poll for testing
    if (isConfigV2(opts.config)) {
      const mail = await discoverNewMail({ config: opts.config });
      for (const m of mail) {
        await opts.onNewMail({ agent: opts.agentName ?? m.contact, filename: m.filename, from: m.from });
      }
    } else {
      // Legacy v0/v1: use old local-watching approach
      const allEntries = getAgentEntries(opts.config);
      const entries: Array<[string, { repo_path: string }]> = opts.agentName
        ? allEntries.filter(([name]) => name === opts.agentName).map(([name, repoPath]) => [name, { repo_path: repoPath }])
        : allEntries.map(([name, repoPath]) => [name, { repo_path: repoPath }]);
      await runPollLegacy(entries, opts.onNewMail);
    }
    return;
  }

  // Daemon loop
  while (true) {
    const start = Date.now();
    try {
      if (isConfigV2(opts.config)) {
        await runDaemonV2(opts);
      } else {
        await runDaemonLegacy(opts);
      }
    } catch (e) {
      console.error('[daemon] poll error:', e);
    }
    const elapsed = Date.now() - start;
    const sleepTime = Math.max(0, pollInterval - elapsed);
    await sleep(sleepTime);
  }
}

async function runDaemonV2(opts: DaemonOptions): Promise<void> {
  if (!opts.onNewMail) return;
  const mail = await discoverNewMail({ config: opts.config });
  for (const m of mail) {
    console.log(`[daemon] new mail from remote: from=${m.from} file=${m.filename} contact=${m.contact}`);
    await opts.onNewMail({ agent: opts.agentName ?? m.contact, filename: m.filename, from: m.from });
  }
}

async function runDaemonLegacy(opts: DaemonOptions): Promise<void> {
  const allEntries = getAgentEntries(opts.config);
  const entries: Array<[string, { repo_path: string }]> = opts.agentName
    ? allEntries.filter(([name]) => name === opts.agentName).map(([name, repoPath]) => [name, { repo_path: repoPath }])
    : allEntries.map(([name, repoPath]) => [name, { repo_path: repoPath }]);
  for (const [name, agent] of entries) {
    await watchAgent(name, agent, opts.onNewMail);
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

async function runPollLegacy(
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
