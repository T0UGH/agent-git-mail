import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { dirname } from 'path';
import { stringify as stringifyYaml } from 'yaml';
import { loadConfigSafe, isConfigV2, isConfigV1, getConfigPath, type ConfigV2 } from '../../config/index.js';

// --- Exit codes ---
export const EXIT_INPUT_ERROR = 2;
export const EXIT_ENV_MISSING = 3;
export const EXIT_REPO_INVALID = 4;
export const EXIT_CONFIG_CONFLICT = 6;
export const EXIT_REMOTE_MISMATCH = 7;

export interface BootstrapOptions {
  selfId: string;
  selfRemoteRepoUrl: string;
  selfLocalRepoPath: string;
  configPath?: string;
  activationOpenId?: string;
  activationPollIntervalSeconds?: number;
  dryRun?: boolean;
  json?: boolean;
}

interface CheckResult {
  ok: boolean;
  code: number;
  status: string;
  message: string;
  details?: Record<string, unknown>;
}

// Detected openclaw command (openclaw or openclaw-gateway)
let detectedOpenClawCmd: string | null = null;

function detectOpenClawCommand(): string | null {
  if (detectedOpenClawCmd) return detectedOpenClawCmd;
  if (commandExists('openclaw')) { detectedOpenClawCmd = 'openclaw'; return 'openclaw'; }
  if (commandExists('openclaw-gateway')) { detectedOpenClawCmd = 'openclaw-gateway'; return 'openclaw-gateway'; }
  return null;
}

function checkSystemDeps(): CheckResult {
  const deps = ['git', 'node', 'npm'];
  for (const dep of deps) {
    try {
      execSync(`${dep} --version`, { stdio: 'pipe' });
    } catch {
      return {
        ok: false,
        code: EXIT_ENV_MISSING,
        status: 'environment_missing',
        message: `Missing system dependency: ${dep}`,
        details: { missing: dep },
      };
    }
  }
  const openclawCmd = detectOpenClawCommand();
  if (!openclawCmd) {
    return {
      ok: false,
      code: EXIT_ENV_MISSING,
      status: 'environment_missing',
      message: 'Missing system dependency: openclaw or openclaw-gateway',
      details: { missing: 'openclaw' },
    };
  }
  return { ok: true, code: 0, status: 'ok', message: 'All system dependencies present' };
}

function commandExists(cmd: string): boolean {
  try {
    execSync(`${cmd} --version`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Clone a repo from remote URL to local path, or open existing clone.
 * - If local path missing: git clone <remote> <path>
 * - If exists: verify it's a git repo + origin URL matches expected remote
 * - Fail if local clone points to a different remote
 */
function cloneOrOpenRepo(localPath: string, remoteUrl: string): CheckResult {
  if (!existsSync(localPath)) {
    // Clone fresh
    try {
      execSync(`git clone ${remoteUrl} ${localPath}`, { stdio: 'pipe', timeout: 60_000 });
      ensureMaildirs(localPath);
      return { ok: true, code: 0, status: 'cloned', message: `Cloned ${remoteUrl} to ${localPath}` };
    } catch (e) {
      return {
        ok: false,
        code: EXIT_REPO_INVALID,
        status: 'clone_failed',
        message: `Failed to clone ${remoteUrl} to ${localPath}`,
        details: { error: String(e), remote: remoteUrl, path: localPath },
      };
    }
  }

  // Verify existing clone
  try {
    execSync('git rev-parse --git-dir', { cwd: localPath, stdio: 'pipe' });
  } catch {
    return {
      ok: false,
      code: EXIT_REPO_INVALID,
      status: 'not_a_git_repo',
      message: `Local path exists but is not a git repo: ${localPath}`,
      details: { path: localPath },
    };
  }

  // Verify origin matches expected remote
  try {
    const originUrl = execSync('git remote get-url origin', { cwd: localPath, stdio: 'pipe' }).toString().trim();
    if (originUrl !== remoteUrl) {
      return {
        ok: false,
        code: EXIT_REMOTE_MISMATCH,
        status: 'remote_mismatch',
        message: `Local clone origin (${originUrl}) does not match expected remote (${remoteUrl})`,
        details: { expectedRemote: remoteUrl, actualRemote: originUrl, path: localPath },
      };
    }
  } catch {
    return {
      ok: false,
      code: EXIT_REPO_INVALID,
      status: 'no_origin',
      message: `Local clone has no 'origin' remote. Expected: ${remoteUrl}`,
      details: { expectedRemote: remoteUrl, path: localPath },
    };
  }

  ensureMaildirs(localPath);
  return { ok: true, code: 0, status: 'reused', message: `Using existing clone at ${localPath}` };
}

function ensureMaildirs(repoPath: string): void {
  for (const dir of ['inbox', 'outbox', 'archive']) {
    mkdirSync(`${repoPath}/${dir}`, { recursive: true });
  }
}

function checkConfigConflict(configPath: string, newSelfId: string, newRemoteUrl: string): CheckResult | null {
  const result = loadConfigSafe(configPath);
  if (!result.ok) return null;
  const existing = result.data;

  if (isConfigV2(existing)) {
    if (existing.self.id !== newSelfId) {
      return {
        ok: false,
        code: EXIT_CONFIG_CONFLICT,
        status: 'conflict',
        message: `Config conflict: existing self.id='${existing.self.id}' does not match --self-id='${newSelfId}'`,
        details: { existingSelfId: existing.self.id, requestedSelfId: newSelfId },
      };
    }
    if (existing.self.remote_repo_url !== newRemoteUrl) {
      return {
        ok: false,
        code: EXIT_CONFIG_CONFLICT,
        status: 'conflict',
        message: `Config conflict: existing remote_repo_url='${existing.self.remote_repo_url}' does not match --self-remote-repo-url='${newRemoteUrl}'`,
        details: { existingRemote: existing.self.remote_repo_url, requestedRemote: newRemoteUrl },
      };
    }
    return {
      ok: true,
      code: 0,
      status: 'already_initialized',
      message: 'AGM already initialized with matching self.id and remote_repo_url',
      details: { existingSelfId: existing.self.id, existingRemote: existing.self.remote_repo_url, existingLocal: existing.self.local_repo_path },
    };
  }

  if (isConfigV1(existing)) {
    // Legacy config — warn but allow re-bootstrap
    return null;
  }

  return null;
}

function buildConfigYaml(
  selfId: string,
  selfRemoteUrl: string,
  selfLocalPath: string,
  activationOpenId?: string,
  activationPollIntervalSeconds?: number,
): string {
  const config: ConfigV2 = {
    self: {
      id: selfId,
      local_repo_path: selfLocalPath,
      remote_repo_url: selfRemoteUrl,
    },
    contacts: {},
    notifications: {
      default_target: 'main',
      bind_session_key: null,
      forced_session_key: null,
    },
    runtime: {
      poll_interval_seconds: 30,
    },
  };
  if (activationOpenId) {
    (config as any).activation = {
      enabled: true,
      activator: 'feishu-openclaw-agent',
      poll_interval_seconds: activationPollIntervalSeconds ?? 5,
      dedupe_mode: 'filename',
      feishu: {
        open_id: activationOpenId,
        message_template:
          '[AGM ACTION REQUIRED]\n你有新的 Agent Git Mail。\n请先执行：agm read {{filename}}',
      },
    };
  }
  return stringifyYaml(config, { indent: 2 });
}

function outputJson(result: CheckResult & { details?: Record<string, unknown>; configPath?: string; selfId?: string; selfRemoteUrl?: string; selfLocalRepoPath?: string }) {
  console.log(JSON.stringify({
    ok: result.ok,
    status: result.status,
    code: result.code,
    message: result.message,
    ...result.details,
  }, null, 2));
}

function outputText(result: CheckResult & { details?: Record<string, unknown> }) {
  const prefix = result.ok ? '✅' : '❌';
  console.log(`${prefix} ${result.message}`);
  if (result.details) {
    for (const [k, v] of Object.entries(result.details)) {
      console.log(`   ${k}: ${v}`);
    }
  }
}

export async function cmdBootstrap(argv: BootstrapOptions): Promise<void> {
  const { selfId, selfRemoteRepoUrl, selfLocalRepoPath, configPath, activationOpenId, activationPollIntervalSeconds, dryRun, json } = argv;

  const targetConfigPath = configPath ?? getConfigPath();

  // 1. Check system deps
  const depCheck = checkSystemDeps();
  if (!depCheck.ok) {
    if (json) outputJson({ ...depCheck, configPath: targetConfigPath, selfId, selfRemoteUrl: selfRemoteRepoUrl, selfLocalRepoPath });
    else outputText(depCheck);
    process.exit(depCheck.code);
  }

  // 2. Validate required args
  if (!selfId || selfId.trim().length === 0) {
    const result: CheckResult = {
      ok: false,
      code: EXIT_INPUT_ERROR,
      status: 'invalid_input',
      message: '--self-id is required and cannot be empty',
      details: { selfId: selfId ?? '(empty)' },
    };
    if (json) outputJson({ ...result, configPath: targetConfigPath, selfId, selfRemoteUrl: selfRemoteRepoUrl, selfLocalRepoPath });
    else outputText(result);
    process.exit(EXIT_INPUT_ERROR);
  }
  if (!selfRemoteRepoUrl || selfRemoteRepoUrl.trim().length === 0) {
    const result: CheckResult = {
      ok: false,
      code: EXIT_INPUT_ERROR,
      status: 'invalid_input',
      message: '--self-remote-repo-url is required and cannot be empty',
      details: { selfRemoteRepoUrl: selfRemoteRepoUrl ?? '(empty)' },
    };
    if (json) outputJson({ ...result, configPath: targetConfigPath, selfId, selfRemoteUrl: selfRemoteRepoUrl, selfLocalRepoPath });
    else outputText(result);
    process.exit(EXIT_INPUT_ERROR);
  }
  if (!selfLocalRepoPath || selfLocalRepoPath.trim().length === 0) {
    const result: CheckResult = {
      ok: false,
      code: EXIT_INPUT_ERROR,
      status: 'invalid_input',
      message: '--self-local-repo-path is required and cannot be empty',
      details: { selfLocalRepoPath: selfLocalRepoPath ?? '(empty)' },
    };
    if (json) outputJson({ ...result, configPath: targetConfigPath, selfId, selfRemoteUrl: selfRemoteRepoUrl, selfLocalRepoPath });
    else outputText(result);
    process.exit(EXIT_INPUT_ERROR);
  }

  // 3. Dry-run (check early to avoid side effects)
  if (dryRun) {
    const configYaml = buildConfigYaml(selfId, selfRemoteRepoUrl, selfLocalRepoPath, activationOpenId, activationPollIntervalSeconds);
    // Determine what clone would do without actually cloning
    let cloneAction: string;
    if (!existsSync(selfLocalRepoPath)) {
      cloneAction = 'git clone (remote exists, local missing)';
    } else {
      try {
        execSync('git rev-parse --git-dir', { cwd: selfLocalRepoPath, stdio: 'pipe' });
        cloneAction = 'reuse existing clone (origin verified on write)';
      } catch {
        cloneAction = 'git clone (not a git repo, would re-clone)';
      }
    }
    const result: CheckResult & { details: Record<string, unknown> } = {
      ok: true,
      code: 0,
      status: 'dry_run',
      message: 'Dry-run — would do the following:',
      details: {
        configPath: targetConfigPath,
        cloneAction,
        selfId,
        selfRemoteUrl: selfRemoteRepoUrl,
        selfLocalRepoPath,
        activation: activationOpenId
          ? { open_id: activationOpenId, poll_interval_seconds: activationPollIntervalSeconds ?? 5 }
          : null,
        configContent: configYaml,
      },
    };
    if (json) outputJson({ ...result, configPath: targetConfigPath, selfId, selfRemoteUrl: selfRemoteRepoUrl, selfLocalRepoPath });
    else {
      console.log('🔍 Dry-run — would do the following:\n');
      console.log(`   Config path: ${targetConfigPath}`);
      console.log(`   Clone action: ${cloneAction}`);
      console.log(`   Self ID: ${selfId}`);
      console.log(`   Remote URL: ${selfRemoteRepoUrl}`);
      console.log(`   Local path: ${selfLocalRepoPath}`);
      if (activationOpenId) {
        console.log(`   Activation: enabled (open_id=${activationOpenId}, poll=${activationPollIntervalSeconds ?? 5}s)`);
      } else {
        console.log(`   Activation: not configured (add --activation-open-id)`);
      }
      console.log(`\n   Config content:\n`);
      console.log('   ' + configYaml.replace(/\n/g, '\n   '));
    }
    return;
  }

  // 4. Clone or open local repo
  const cloneResult = cloneOrOpenRepo(selfLocalRepoPath, selfRemoteRepoUrl);
  if (!cloneResult.ok) {
    if (json) outputJson({ ...cloneResult, configPath: targetConfigPath, selfId, selfRemoteUrl: selfRemoteRepoUrl, selfLocalRepoPath });
    else outputText(cloneResult);
    process.exit(cloneResult.code);
  }

  // 5. Check for config conflict
  const conflictCheck = checkConfigConflict(targetConfigPath, selfId, selfRemoteRepoUrl);
  if (conflictCheck) {
    if (json) outputJson({ ...conflictCheck, configPath: targetConfigPath, selfId, selfRemoteUrl: selfRemoteRepoUrl, selfLocalRepoPath });
    else outputText(conflictCheck);
    process.exit(conflictCheck.code);
  }

  // 6. Write config
  mkdirSync(dirname(targetConfigPath), { recursive: true });
  const configYaml = buildConfigYaml(selfId, selfRemoteRepoUrl, selfLocalRepoPath, activationOpenId, activationPollIntervalSeconds);
  writeFileSync(targetConfigPath, configYaml, 'utf-8');

  const result: CheckResult & { configPath: string; selfId: string; selfRemoteUrl: string; selfLocalRepoPath: string } = {
    ok: true,
    code: 0,
    status: 'initialized',
    message: 'Bootstrap complete — AGM initialized',
    configPath: targetConfigPath,
    selfId,
    selfRemoteUrl: selfRemoteRepoUrl,
    selfLocalRepoPath,
    details: {
      cloneAction: cloneResult.status,
      defaultTarget: 'main',
    },
  };
  if (json) outputJson({ ...result, configPath: targetConfigPath, selfId, selfRemoteUrl: selfRemoteRepoUrl, selfLocalRepoPath });
  else {
    console.log('✅ Bootstrap complete');
    console.log(`   Config: ${targetConfigPath}`);
    console.log(`   Clone: ${cloneResult.status}`);
    console.log(`   Self ID: ${selfId}`);
    console.log(`   Remote: ${selfRemoteRepoUrl}`);
    console.log(`   Local: ${selfLocalRepoPath}`);
    if (activationOpenId) {
      console.log(`   Activation: enabled (open_id=${activationOpenId})`);
    } else {
      console.log(`   Activation: not configured`);
    }
    console.log(`\n   Next: run 'agm daemon' to start the mail daemon.`);
    if (activationOpenId) {
      console.log(`   The daemon will wake your agent via Feishu when new mail arrives.`);
    } else {
      console.log(`   Note: Add 'activation' section to config to enable Feishu wake-up.`);
    }
  }
}
