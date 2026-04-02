import { GitRepo } from '../git/repo.js';
import { GitWaterline } from '../git/waterline.js';
import { parseFrontmatter } from '../domain/frontmatter.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { Config } from '../config/schema.js';
import { getAgentEntries, getSelfId, getSelfLocalRepoPath, isConfigV2 } from '../config/index.js';
import { hasActivated, markActivated } from '../activator/checkpoint-store.js';
import { createActivator, AgmActivator } from '../activator/index.js';

export interface DaemonOptions {
  config: Config;
  agentName?: string;
  logger?: (msg: string) => void;
  onNewMail?: (mail: { agent: string; filename: string; from: string }) => Promise<void>;
}

export async function runDaemon(opts: DaemonOptions): Promise<void> {
  const pollInterval = (opts.config.runtime?.poll_interval_seconds ?? 30) * 1000;

  if (opts.onNewMail) {
    // One-shot poll for testing
    await runPoll(opts);
    return;
  }

  // Daemon loop
  while (true) {
    const start = Date.now();
    try {
      await runPoll(opts);
    } catch (e) {
      console.error('[daemon] poll error:', e);
    }
    const elapsed = Date.now() - start;
    const sleepTime = Math.max(0, pollInterval - elapsed);
    await sleep(sleepTime);
  }
}

/**
 * Poll for new mail in self inbox only (mailbox model).
 * Daemon watches the local self repo's inbox directory - not contact remotes.
 * For v0 legacy (no self), falls back to agentName lookup via getAgentEntries.
 */
async function runPoll(opts: DaemonOptions): Promise<void> {
  const log = opts.logger ?? console.log;
  const selfId = opts.agentName ?? getSelfId(opts.config) ?? 'self';
  let selfRepoPath = getSelfLocalRepoPath(opts.config);
  // v0 legacy: no self field, look up via agentName + getAgentEntries
  if (!selfRepoPath) {
    const entries = getAgentEntries(opts.config);
    const entry = entries.find(([name]) => name === selfId);
    selfRepoPath = entry?.[1] ?? null;
  }
  if (!selfRepoPath) {
    log('[daemon] no self local_repo_path configured, skipping');
    return;
  }

  // Create activator from config (v2 only)
  const activator = createActivator(opts.config);

  // Build onNewMail wrapper that handles activation
  const handleMail = async (mail: { agent: string; filename: string; from: string }) => {
    // Call user callback if present
    if (opts.onNewMail) {
      await opts.onNewMail(mail);
    }
    // Handle external activation via activator
    if (!activator) return;
    if (hasActivated(mail.filename)) {
      log(`[daemon] activation skipped (already activated): ${mail.filename}`);
      return;
    }
    const result = await activator.activate({
      selfId,
      filename: mail.filename,
      from: mail.from,
      message: `[AGM ACTION REQUIRED]\n你有新的 Agent Git Mail。\n请先执行：agm read ${mail.filename}`,
    });
    if (result.ok) {
      markActivated(mail.filename);
      log(`[daemon] activation sent: ${mail.filename} via ${activator.name}`);
    } else {
      log(`[daemon] activation failed: ${mail.filename} error=${result.error}`);
    }
  };

  await watchAgent(selfId, { repo_path: selfRepoPath }, handleMail);
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
