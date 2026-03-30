import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { stringify as stringifyYaml } from 'yaml';
import { loadConfigSafe, isConfigV1, getConfigPath, getConfigDir, type ConfigV1 } from '../../config/index.js';

// --- Exit codes ---
export const EXIT_INPUT_ERROR = 2;
export const EXIT_ENV_MISSING = 3;
export const EXIT_REPO_INVALID = 4;
export const EXIT_PLUGIN_INSTALL_FAILED = 5;
export const EXIT_CONFIG_CONFLICT = 6;

export interface BootstrapOptions {
  selfId: string;
  selfRepoPath: string;
  configPath?: string;
  skipPluginInstall?: boolean;
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

function checkSystemDeps(): CheckResult {
  const deps = ['git', 'node', 'npm', 'openclaw'];
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
  return { ok: true, code: 0, status: 'ok', message: 'All system dependencies present' };
}

function checkRepoPath(repoPath: string): CheckResult {
  if (!existsSync(repoPath)) {
    return {
      ok: false,
      code: EXIT_REPO_INVALID,
      status: 'repo_not_found',
      message: `repo_path does not exist: ${repoPath}`,
      details: { path: repoPath },
    };
  }
  try {
    execSync('git rev-parse --git-dir', { cwd: repoPath, stdio: 'pipe' });
  } catch {
    return {
      ok: false,
      code: EXIT_REPO_INVALID,
      status: 'not_a_git_repo',
      message: `repo_path is not a git repository: ${repoPath}`,
      details: { path: repoPath },
    };
  }
  return { ok: true, code: 0, status: 'ok', message: 'repo_path is valid' };
}

function checkConfigConflict(configPath: string, newSelfId: string, newRepoPath: string): CheckResult | null {
  const result = loadConfigSafe(configPath);
  if (!result.ok) return null; // no existing config, no conflict
  const existing = result.data;

  if (isConfigV1(existing)) {
    if (existing.self.id !== newSelfId) {
      return {
        ok: false,
        code: EXIT_CONFIG_CONFLICT,
        status: 'conflict',
        message: `Config conflict: existing self.id='${existing.self.id}' does not match --self-id='${newSelfId}'`,
        details: {
          existingSelfId: existing.self.id,
          requestedSelfId: newSelfId,
        },
      };
    }
    // Same self.id — already initialized
    return {
      ok: true,
      code: 0,
      status: 'already_initialized',
      message: 'AGM already initialized with matching self.id',
      details: {
        existingSelfId: existing.self.id,
        existingRepoPath: existing.self.repo_path,
        requestedRepoPath: newRepoPath,
      },
    };
  }
  // Old format config exists but no conflict with new self id — no conflict
  return null;
}

function buildConfigYaml(selfId: string, selfRepoPath: string): string {
  const config: ConfigV1 = {
    self: {
      id: selfId,
      repo_path: selfRepoPath,
    },
    notifications: {
      default_target: 'main',
      forced_session_key: null,
    },
    runtime: {
      poll_interval_seconds: 30,
    },
  };
  return stringifyYaml(config, { indent: 2 });
}

function installPlugin(): CheckResult {
  try {
    execSync('openclaw plugins install @t0u9h/openclaw-agent-git-mail', {
      stdio: 'pipe',
      timeout: 60_000,
    });
    return { ok: true, code: 0, status: 'ok', message: 'Plugin installed' };
  } catch (e) {
    return {
      ok: false,
      code: EXIT_PLUGIN_INSTALL_FAILED,
      status: 'plugin_install_failed',
      message: 'Failed to install @t0u9h/openclaw-agent-git-mail plugin',
      details: { error: String(e) },
    };
  }
}

function outputJson(result: CheckResult & { details?: Record<string, unknown>; configPath?: string; selfId?: string; selfRepoPath?: string; pluginInstalled?: boolean }) {
  console.log(JSON.stringify({
    ok: result.ok,
    status: result.status,
    code: result.code,
    message: result.message,
    ...result.details,
    ...(result.details?.configPath ? { configPath: result.details?.configPath } : {}),
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
  const { selfId, selfRepoPath, configPath, skipPluginInstall, dryRun, json } = argv;

  const targetConfigPath = configPath ?? getConfigPath();

  // 1. Check system deps
  const depCheck = checkSystemDeps();
  if (!depCheck.ok) {
    if (json) outputJson({ ...depCheck, configPath: targetConfigPath, selfId, selfRepoPath });
    else outputText(depCheck);
    process.exit(depCheck.code);
  }

  // 2. Check self_id non-empty
  if (!selfId || selfId.trim().length === 0) {
    const result: CheckResult = {
      ok: false,
      code: EXIT_INPUT_ERROR,
      status: 'invalid_input',
      message: '--self-id is required and cannot be empty',
      details: { selfId: selfId ?? '(empty)' },
    };
    if (json) outputJson({ ...result, configPath: targetConfigPath, selfId, selfRepoPath });
    else outputText(result);
    process.exit(EXIT_INPUT_ERROR);
  }

  // 3. Check repo_path
  const repoCheck = checkRepoPath(selfRepoPath);
  if (!repoCheck.ok) {
    if (json) outputJson({ ...repoCheck, configPath: targetConfigPath, selfId, selfRepoPath });
    else outputText(repoCheck);
    process.exit(repoCheck.code);
  }

  // 4. Check for config conflict (existing self.id mismatch) or already initialized
  const conflictCheck = checkConfigConflict(targetConfigPath, selfId, selfRepoPath);
  if (conflictCheck) {
    if (json) outputJson({ ...conflictCheck, configPath: targetConfigPath, selfId, selfRepoPath });
    else outputText(conflictCheck);
    process.exit(conflictCheck.code);
  }

  // 5. Dry-run: just print what would happen
  if (dryRun) {
    const configYaml = buildConfigYaml(selfId, selfRepoPath);
    const result: CheckResult & { details: Record<string, unknown> } = {
      ok: true,
      code: 0,
      status: 'dry_run',
      message: 'Dry-run: would write the following config and install plugin',
      details: {
        configPath: targetConfigPath,
        configContent: configYaml,
        pluginInstall: !skipPluginInstall,
        selfId,
        selfRepoPath,
      },
    };
    if (json) outputJson({ ...result, configPath: targetConfigPath, selfId, selfRepoPath });
    else {
      console.log('🔍 Dry-run — would do the following:\n');
      console.log(`   Config path: ${targetConfigPath}`);
      console.log(`   Self ID: ${selfId}`);
      console.log(`   Repo path: ${selfRepoPath}`);
      console.log(`   Plugin install: ${!skipPluginInstall ? 'yes' : 'no (--skip-plugin-install)'}`);
      console.log(`\n   Config content:\n`);
      console.log('   ' + configYaml.replace(/\n/g, '\n   '));
    }
    return;
  }

  // 6. Install plugin
  let pluginInstalled = false;
  if (!skipPluginInstall) {
    const pluginResult = installPlugin();
    if (!pluginResult.ok) {
      if (json) outputJson({ ...pluginResult, configPath: targetConfigPath, selfId, selfRepoPath });
      else outputText(pluginResult);
      process.exit(EXIT_PLUGIN_INSTALL_FAILED);
    }
    pluginInstalled = true;
  }

  // 7. Write config
  const { mkdirSync } = await import('fs');
  const configDir = getConfigDir();
  mkdirSync(configDir, { recursive: true });

  const configYaml = buildConfigYaml(selfId, selfRepoPath);
  const { writeFileSync } = await import('fs');
  writeFileSync(targetConfigPath, configYaml, 'utf-8');

  const result: CheckResult & { configPath: string; selfId: string; selfRepoPath: string; pluginInstalled: boolean } = {
    ok: true,
    code: 0,
    status: 'initialized',
    message: 'Bootstrap complete — AGM initialized',
    configPath: targetConfigPath,
    selfId,
    selfRepoPath,
    pluginInstalled,
    details: {
      defaultTarget: 'main',
    },
  };
  if (json) outputJson({ ...result, configPath: targetConfigPath, selfId, selfRepoPath, pluginInstalled });
  else {
    console.log('✅ Bootstrap complete');
    console.log(`   Config: ${targetConfigPath}`);
    console.log(`   Self ID: ${selfId}`);
    console.log(`   Repo path: ${selfRepoPath}`);
    console.log(`   Plugin installed: ${pluginInstalled}`);
    console.log(`\n   Note: OpenClaw plugin will be loaded on next gateway restart.`);
  }
}
