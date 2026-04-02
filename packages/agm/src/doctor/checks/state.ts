/**
 * Doctor checks: state
 * Validates activation-state.json and waterline git ref.
 */

import { getConfigDir } from '../../config/paths.js';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { loadConfigSafe } from '../../config/load.js';
import { getConfigPath } from '../../config/paths.js';
import { isConfigV2 } from '../../config/schema.js';
import { git } from '../../git/exec.js';
import type { CheckResult } from '../types.js';

export function checkState(): CheckResult[] {
  const results: CheckResult[] = [];

  // Check: activation-state.json exists and is parseable
  const statePath = resolve(getConfigDir(), 'activation-state.json');

  if (!existsSync(statePath)) {
    results.push({
      name: 'activation_state',
      status: 'WARN',
      code: 'ACTIVATION_STATE_NOT_FOUND',
      message: 'activation-state.json not found (first run or cleaned up)',
    });
  } else {
    try {
      const raw = readFileSync(statePath, 'utf-8');
      const state = JSON.parse(raw);

      // Check checkpoint keys format
      const keys = Object.keys(state);
      let malformedKeys = 0;
      for (const key of keys) {
        if (!key.includes('::')) malformedKeys++;
      }

      if (malformedKeys > 0) {
        results.push({
          name: 'activation_state_keys',
          status: 'WARN',
          code: 'MALFORMED_CHECKPOINT_KEYS',
          message: `${malformedKeys} checkpoint key(s) missing '::' separator`,
          details: { total_keys: keys.length, malformed: malformedKeys },
        });
      } else {
        results.push({
          name: 'activation_state_keys',
          status: 'OK',
          code: 'OK',
          message: `${keys.length} checkpoint(s) with valid keys`,
        });
      }

      results.push({
        name: 'activation_state',
        status: 'OK',
        code: 'OK',
        message: `activation-state.json valid (${keys.length} entries)`,
      });
    } catch (e) {
      results.push({
        name: 'activation_state',
        status: 'FAIL',
        code: 'ACTIVATION_STATE_INVALID',
        message: `activation-state.json is not valid JSON: ${String(e)}`,
      });
    }
  }

  // Check: waterline git ref
  const loadResult = loadConfigSafe(getConfigPath());
  if (!loadResult.ok) {
    results.push({
      name: 'waterline_ref',
      status: 'WARN',
      code: 'CANNOT_CHECK_WATERLINE',
      message: 'cannot check waterline: config not loaded',
    });
    return results;
  }

  const config = loadResult.data;

  if (!isConfigV2(config)) {
    results.push({
      name: 'waterline_ref',
      status: 'WARN',
      code: 'CONFIG_NOT_V2',
      message: 'cannot check waterline: requires v2 config format',
    });
    return results;
  }

  const selfRepoPath = config.self.local_repo_path;
  if (!selfRepoPath) {
    results.push({
      name: 'waterline_ref',
      status: 'WARN',
      code: 'SELF_REPO_PATH_NOT_SET',
      message: 'cannot check waterline: self.local_repo_path not set',
    });
    return results;
  }

  if (!existsSync(selfRepoPath)) {
    results.push({
      name: 'waterline_ref',
      status: 'WARN',
      code: 'SELF_REPO_NOT_FOUND',
      message: `cannot check waterline: self repo not found at ${selfRepoPath}`,
    });
    return results;
  }

  try {
    // Check if refs/waterline exists and resolves to a commit
    const sha = git(selfRepoPath, ['rev-parse', '--verify', 'refs/waterline']);
    const commitSha = sha.stdout.trim();
    if (!commitSha) {
      throw new Error('empty sha');
    }
    results.push({
      name: 'waterline_ref',
      status: 'OK',
      code: 'OK',
      message: `waterline ref resolves to ${commitSha.slice(0, 8)}`,
      details: { sha: commitSha },
    });
  } catch {
    // refs/waterline does not exist — acceptable for first run
    results.push({
      name: 'waterline_ref',
      status: 'OK',
      code: 'WATERLINE_NOT_YET_SET',
      message: 'waterline ref not set (first run — this is normal)',
    });
  }

  return results;
}
