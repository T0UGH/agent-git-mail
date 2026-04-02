/**
 * Doctor checks: git
 * Validates self repo exists, is a git repo, and remote URL matches config.
 */

import { loadConfigSafe } from '../../config/load.js';
import { getConfigPath } from '../../config/paths.js';
import { isConfigV2 } from '../../config/schema.js';
import type { CheckResult } from '../types.js';
import { existsSync } from 'fs';
import { git } from '../../git/exec.js';

export function checkGit(): CheckResult[] {
  const results: CheckResult[] = [];

  const loadResult = loadConfigSafe(getConfigPath());
  if (!loadResult.ok) {
    results.push({
      name: 'git_self_repo',
      status: 'FAIL',
      code: 'CONFIG_NOT_LOADED',
      message: 'cannot run git checks: config not loaded',
    });
    return results;
  }

  const config = loadResult.data;

  if (!isConfigV2(config)) {
    results.push({
      name: 'git_self_repo',
      status: 'FAIL',
      code: 'CONFIG_NOT_V2',
      message: 'git checks require v2 config format',
    });
    return results;
  }

  const selfRepoPath = config.self.local_repo_path;

  // Check: self repo path exists
  if (!selfRepoPath) {
    results.push({
      name: 'git_self_repo',
      status: 'FAIL',
      code: 'SELF_REPO_PATH_MISSING',
      message: 'self.local_repo_path not set in config',
    });
    return results;
  }

  if (!existsSync(selfRepoPath)) {
    results.push({
      name: 'git_self_repo',
      status: 'FAIL',
      code: 'SELF_REPO_NOT_FOUND',
      message: `self repo path does not exist: ${selfRepoPath}`,
    });
    return results;
  }

  results.push({
    name: 'git_self_repo',
    status: 'OK',
    code: 'OK',
    message: `self repo exists at ${selfRepoPath}`,
  });

  // Check: is git repo
  try {
    git(selfRepoPath, ['rev-parse', '--git-dir']);
  } catch {
    results.push({
      name: 'git_is_repo',
      status: 'FAIL',
      code: 'NOT_A_GIT_REPO',
      message: `${selfRepoPath} is not a git repository`,
    });
    return results;
  }

  results.push({
    name: 'git_is_repo',
    status: 'OK',
    code: 'OK',
    message: `${selfRepoPath} is a git repo`,
  });

  // Check: origin remote exists
  let originUrl: string | null = null;
  try {
    const url = git(selfRepoPath, ['remote', 'get-url', 'origin']);
    originUrl = url.stdout.trim();
  } catch {
    results.push({
      name: 'git_origin',
      status: 'FAIL',
      code: 'ORIGIN_NOT_FOUND',
      message: 'origin remote not found',
    });
    return results;
  }

  results.push({
    name: 'git_origin',
    status: 'OK',
    code: 'OK',
    message: `origin = ${originUrl}`,
  });

  // Check: origin URL matches config
  const expectedUrl = config.self?.remote_repo_url;
  if (!expectedUrl) {
    results.push({
      name: 'git_origin_matches_config',
      status: 'WARN',
      code: 'CONFIG_REMOTE_URL_MISSING',
      message: 'self.remote_repo_url not set in config, cannot verify',
    });
  } else if (originUrl !== expectedUrl) {
    results.push({
      name: 'git_origin_matches_config',
      status: 'WARN',
      code: 'ORIGIN_URL_MISMATCH',
      message: `origin (${originUrl}) != config (${expectedUrl})`,
      details: { expected: expectedUrl, actual: originUrl },
    });
  } else {
    results.push({
      name: 'git_origin_matches_config',
      status: 'OK',
      code: 'OK',
      message: 'origin URL matches config',
    });
  }

  return results;
}
