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
  onNewMail: (mail: { agent: string; filename: string; from: string }) => Promise<void>,
): Promise<void> {
  const repo = new GitRepo(repoPath);
  const valid = await repo.verify().catch(() => false);
  if (!valid) return;

  const waterline = new GitWaterline(repo);

  // Pull latest
  try {
    execSync('git -C ' + repoPath + ' pull --rebase', { encoding: 'utf-8', stdio: 'pipe' });
  } catch {
    // ignore
  }

  const currentSha = await repo.getHeadSha().catch(() => null);
  if (!currentSha) return;

  const lastSeen = await waterline.read().catch(() => null);
  if (!lastSeen) {
    await waterline.write(currentSha).catch(() => {});
    return;
  }

  if (lastSeen === currentSha) return;

  const diffOutput = await repo.diffNames(lastSeen, currentSha).catch(() => '');
  const newFiles = parseDiff(diffOutput);

  for (const filename of newFiles) {
    const from = await extractFrom(resolve(repoPath, 'inbox', filename)).catch(() => 'unknown');
    await onNewMail({ agent: agentName, filename, from });
  }

  await waterline.write(currentSha).catch(() => {});
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
