import { GitRepo } from '../git/repo.js';
import { GitWaterline } from '../git/waterline.js';
import { parseFrontmatter } from '../domain/frontmatter.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { Config } from '../config/schema.js';
import { resolveProfile } from '../config/profile.js';
import { getProfileSelfId, getProfileSelfRemoteRepoUrl, getProfileContactRemoteRepoUrl, getProfileContactNames } from '../config/index.js';
import { getSelfRepoPath } from '../config/profile-paths.js';
import { hasActivated, markActivated } from '../activator/checkpoint-store.js';
import { createActivator, AgmActivator } from '../activator/index.js';
import { createHappyClawAdapter, HostAdapter } from '../host-adapter/index.js';
import { appendEvent } from '../log/events.js';

export interface DaemonOptions {
  config: Config;
  profile: string;
  agentName?: string;
  logger?: (msg: string) => void;
  onNewMail?: (mail: { agent: string; filename: string; from: string }) => Promise<void>;
}

export async function runDaemon(opts: DaemonOptions): Promise<void> {
  const profile = resolveProfile(opts.config, opts.profile);
  const pollInterval = (profile.runtime?.poll_interval_seconds ?? 30) * 1000;

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
 */
async function runPoll(opts: DaemonOptions): Promise<void> {
  const log = opts.logger ?? console.log;
  const profile = resolveProfile(opts.config, opts.profile);
  const selfId = opts.agentName ?? getProfileSelfId(profile) ?? 'self';
  const selfRepoPath = getSelfRepoPath(opts.profile);

  if (!selfRepoPath) {
    log(`[daemon] no derived self repo path for profile '${opts.profile}', skipping`);
    return;
  }

  // Write daemon_poll_started
  try {
    appendEvent({
      ts: new Date().toISOString(),
      type: 'daemon_poll_started',
      level: 'info',
      self_id: selfId,
      message: 'daemon poll started',
    }, opts.profile);
  } catch {
    // Non-fatal
  }

  // Create host adapter (HappyClaw ingress) — preferred
  const hostAdapter = createHappyClawAdapter(opts.config, opts.profile);
  // Fall back to OpenClaw external activator
  const activator = createActivator(opts.config, opts.profile);

  // Build onNewMail wrapper that handles activation
  const handleMail = async (mail: { agent: string; filename: string; from: string }) => {
    // Call user callback if present
    if (opts.onNewMail) {
      await opts.onNewMail(mail);
    }
    // Write new_mail_detected
    try {
      appendEvent({
        ts: new Date().toISOString(),
        type: 'new_mail_detected',
        level: 'info',
        self_id: selfId,
        filename: mail.filename,
        message: `new mail detected: ${mail.filename}`,
      }, opts.profile);
    } catch {
      // Non-fatal
    }
    // Skip if already activated
    if (hasActivated(selfId, mail.filename, opts.profile)) {
      log(`[daemon] activation skipped (already activated): ${mail.filename}`);
      try {
        appendEvent({
          ts: new Date().toISOString(),
          type: 'activation_skipped_checkpoint',
          level: 'info',
          self_id: selfId,
          filename: mail.filename,
          message: `activation skipped (checkpoint): ${mail.filename}`,
        }, opts.profile);
      } catch {
        // Non-fatal
      }
      return;
    }
    // Try HappyClaw host adapter first, then fall back to activator — with bounded retry
    if (!hostAdapter && !activator) {
      log(`[daemon] no activation configured for ${mail.filename}`);
      return;
    }

    const MAX_RETRIES = 4;
    const BACKOFF_MS = [1000, 2000, 4000, 8000];

    let activationOk = false;
    let activationError: string | undefined;
    let activationName = hostAdapter?.name ?? activator?.name ?? 'none';

    const attemptDelivery = async (): Promise<{ ok: boolean; retryable: boolean; error?: string; name: string }> => {
      if (hostAdapter) {
        const result = await hostAdapter.deliverMailboxEvent({
          selfId,
          targetJid: '', // filled by adapter from config
          messageId: mail.filename,
          from: mail.from,
          content: `[AGM ACTION REQUIRED]\n你有新的 Agent Git Mail。\n请先执行：agm read ${mail.filename}`,
        });
        return { ok: result.ok, retryable: result.retryable !== false, error: result.error, name: hostAdapter.name };
      } else {
        const result = await activator!.activate({
          selfId,
          filename: mail.filename,
          from: mail.from,
          message: `[AGM ACTION REQUIRED]\n你有新的 Agent Git Mail。\n请先执行：agm read ${mail.filename}`,
        });
        return { ok: result.ok, retryable: result.retryable !== false, error: result.error ?? undefined, name: activator!.name };
      }
    };

    let lastError: string | undefined;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const result = await attemptDelivery();
      if (result.ok) {
        activationOk = true;
        activationName = result.name;
        break;
      }
      lastError = result.error;
      activationName = result.name;

      if (result.retryable && attempt < MAX_RETRIES) {
        log(`[daemon] activation retry ${attempt + 1}/${MAX_RETRIES} for ${mail.filename} after ${BACKOFF_MS[attempt]}ms: ${lastError}`);
        try {
          appendEvent({
            ts: new Date().toISOString(),
            type: 'activation_retrying',
            level: 'warn',
            self_id: selfId,
            filename: mail.filename,
            message: `activation retry ${attempt + 1}/${MAX_RETRIES}: ${mail.filename}`,
            details: { attempt: attempt + 1, maxRetries: MAX_RETRIES, error: lastError, backoffMs: BACKOFF_MS[attempt] },
          }, opts.profile);
        } catch {
          // Non-fatal
        }
        await sleep(BACKOFF_MS[attempt]);
      } else {
        if (attempt === MAX_RETRIES) {
          log(`[daemon] activation retries exhausted for ${mail.filename}: ${lastError}`);
          try {
            appendEvent({
              ts: new Date().toISOString(),
              type: 'activation_retries_exhausted',
              level: 'error',
              self_id: selfId,
              filename: mail.filename,
              message: `activation retries exhausted: ${mail.filename}`,
              details: { attempts: MAX_RETRIES + 1, error: lastError },
            }, opts.profile);
          } catch {
            // Non-fatal
          }
        }
        activationError = lastError;
        break;
      }
    }

    if (activationOk) {
      markActivated(selfId, mail.filename, opts.profile);
      log(`[daemon] activation sent: ${mail.filename} via ${activationName}`);
      try {
        appendEvent({
          ts: new Date().toISOString(),
          type: 'activation_sent',
          level: 'info',
          self_id: selfId,
          filename: mail.filename,
          message: `activation sent: ${mail.filename}`,
          details: { activator: activationName },
        }, opts.profile);
      } catch {
        // Non-fatal
      }
    } else {
      log(`[daemon] activation failed: ${mail.filename} error=${activationError}`);
      try {
        appendEvent({
          ts: new Date().toISOString(),
          type: 'activation_failed',
          level: 'error',
          self_id: selfId,
          filename: mail.filename,
          message: `activation failed: ${mail.filename}`,
          details: { error: activationError },
        }, opts.profile);
      } catch {
        // Non-fatal
      }
    }
  };

  let mailCount = 0;
  await watchAgent(selfId, { repo_path: selfRepoPath }, opts.profile, handleMail, (count: number) => { mailCount = count; });

  // Write daemon_poll_finished
  try {
    appendEvent({
      ts: new Date().toISOString(),
      type: 'daemon_poll_finished',
      level: 'info',
      self_id: selfId,
      message: `daemon poll finished, ${mailCount} mail(s) processed`,
      details: { mail_count: mailCount },
    }, opts.profile);
  } catch {
    // Non-fatal
  }
}

async function watchAgent(
  name: string,
  agent: { repo_path: string },
  profile: string,
  onNewMail?: (mail: { agent: string; filename: string; from: string }) => Promise<void>,
  onMailCount?: (count: number) => void,
): Promise<void> {
  const repo = new GitRepo(agent.repo_path);
  const valid = await repo.verify();
  if (!valid) return;

  const waterline = new GitWaterline(repo);

  let pullTimedOut = false;
  try {
    await repo.pull();
  } catch (e) {
    // Check if it's a timeout error
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'pull timeout') {
      pullTimedOut = true;
      try {
        appendEvent({
          ts: new Date().toISOString(),
          type: 'pull_timeout',
          level: 'warn',
          self_id: name,
          message: `git pull timed out for ${name}`,
        }, profile);
      } catch {
        // Non-fatal
      }
    }
    // ignore other pull errors
  }

  const currentSha = await repo.getHeadSha();
  const lastSeen = await waterline.read();

  let totalMail = 0;

  if (!lastSeen) {
    // First run: establish waterline only. Do NOT replay historical wakeups.
    await waterline.write(currentSha);
    if (onMailCount) onMailCount(0);
    return;
  }

  if (lastSeen === currentSha) {
    // No new commits
    if (onMailCount) onMailCount(0);
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
    totalMail++;
  }

  await waterline.write(currentSha);
  if (onMailCount) onMailCount(totalMail);
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
