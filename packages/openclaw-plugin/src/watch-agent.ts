import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { GitRepo } from '@t0u9h/agent-git-mail/git/repo.js';
import { GitWaterline } from '@t0u9h/agent-git-mail/git/waterline.js';
import { parseFrontmatter } from '@t0u9h/agent-git-mail/domain/frontmatter.js';

/**
 * Watch a single agent repo for new inbox messages (one-shot, used in daemon loop).
 */
export async function watchAgentOnce(
  agentName: string,
  repoPath: string,
  logger: { info(msg: string): void; error(msg: string): void; warn?: (msg: string) => void },
  onNewMail: (mail: { agent: string; filename: string; from: string }) => Promise<void>,
): Promise<void> {
  const repo = new GitRepo(repoPath);
  const valid = await repo.verify().catch((e) => {
    logger.error(
      `[agm] stage=repo_verify_error agent=${agentName} repo=${repoPath} error=${String(e)}`,
    );
    return false;
  });
  if (!valid) {
    logger.info(`[agm] stage=repo_invalid agent=${agentName} repo=${repoPath}`);
    return;
  }

  const waterline = new GitWaterline(repo);

  // Pull latest
  try {
    execSync('git -C ' + repoPath + ' pull --rebase', { encoding: 'utf-8', stdio: 'pipe' });
    logger.info(`[agm] stage=git_pull_ok agent=${agentName} repo=${repoPath}`);
  } catch (e) {
    logger.error(`[agm] stage=git_pull_failed agent=${agentName} repo=${repoPath} error=${String(e)}`);
  }

  const currentSha = await repo.getHeadSha().catch((e) => {
    logger.error(`[agm] stage=head_sha_failed agent=${agentName} repo=${repoPath} error=${String(e)}`);
    return null;
  });
  if (!currentSha) return;

  const lastSeen = await waterline.read().catch((e) => {
    logger.error(
      `[agm] stage=waterline_read_failed agent=${agentName} repo=${repoPath} error=${String(e)}`,
    );
    return null;
  });

  logger.info(
    `[agm] stage=waterline_state agent=${agentName} currentSha=${currentSha} lastSeen=${lastSeen ?? 'none'}`,
  );

  if (!lastSeen) {
    await waterline.write(currentSha).catch((e) => {
      logger.error(
        `[agm] stage=waterline_write_failed agent=${agentName} sha=${currentSha} error=${String(e)}`,
      );
    });
    logger.info(`[agm] stage=waterline_initialized agent=${agentName} sha=${currentSha}`);
    return;
  }

  if (lastSeen === currentSha) {
    logger.info(`[agm] stage=no_change agent=${agentName} sha=${currentSha}`);
    return;
  }

  const diffOutput = await repo.diffNames(lastSeen, currentSha).catch((e) => {
    logger.error(
      `[agm] stage=diff_failed agent=${agentName} from=${lastSeen} to=${currentSha} error=${String(e)}`,
    );
    return '';
  });
  const newFiles = parseDiff(diffOutput);
  logger.info(
    `[agm] stage=diff_parsed agent=${agentName} newFiles=${newFiles.length} files=${newFiles.join(',') || 'none'}`,
  );

  for (const filename of newFiles) {
    const filePath = resolve(repoPath, 'inbox', filename);
    const from = await extractFrom(filePath).catch((e) => {
      logger.error(
        `[agm] stage=extract_from_failed agent=${agentName} file=${filename} error=${String(e)}`,
      );
      return 'unknown';
    });
    logger.info(`[agm] stage=new_mail_detected agent=${agentName} file=${filename} from=${from}`);
    await onNewMail({ agent: agentName, filename, from });
  }

  await waterline.write(currentSha).catch((e) => {
    logger.error(
      `[agm] stage=waterline_advance_failed agent=${agentName} sha=${currentSha} error=${String(e)}`,
    );
  });
  logger.info(`[agm] stage=waterline_advanced agent=${agentName} sha=${currentSha}`);
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
