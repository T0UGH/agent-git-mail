/**
 * Doctor checks: config
 * Validates config file existence, schema, self fields, and activation config.
 */

import { loadConfigSafe } from '../../config/load.js';
import { getConfigPath } from '../../config/paths.js';
import { resolveProfile } from '../../config/profile.js';
import { getProfileSelfId, getProfileSelfRemoteRepoUrl } from '../../config/index.js';
import type { CheckResult } from '../types.js';
import { existsSync } from 'fs';

export function checkConfig(profileName: string): CheckResult[] {
  const results: CheckResult[] = [];

  // Check: config file exists
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    results.push({
      name: 'config_exists',
      status: 'FAIL',
      code: 'CONFIG_FILE_MISSING',
      message: `config file not found at ${configPath}`,
    });
    return results; // can't check anything else without config
  }

  results.push({
    name: 'config_exists',
    status: 'OK',
    code: 'OK',
    message: `config file found at ${configPath}`,
  });

  // Check: schema valid
  const loadResult = loadConfigSafe(configPath);
  if (!loadResult.ok) {
    results.push({
      name: 'config_schema',
      status: 'FAIL',
      code: 'CONFIG_INVALID',
      message: `config schema invalid: ${String(loadResult.error)}`,
    });
    return results;
  }

  results.push({
    name: 'config_schema',
    status: 'OK',
    code: 'OK',
    message: 'config schema valid',
  });

  const config = loadResult.data;

  // Check: profile exists
  let profile;
  try {
    profile = resolveProfile(config, profileName);
  } catch {
    results.push({
      name: 'config_profile',
      status: 'FAIL',
      code: 'PROFILE_NOT_FOUND',
      message: `profile '${profileName}' not found in config`,
    });
    return results;
  }

  results.push({
    name: 'config_profile',
    status: 'OK',
    code: 'OK',
    message: `profile '${profileName}' found`,
  });

  // Check: self.id
  const selfId = getProfileSelfId(profile);
  if (!selfId) {
    results.push({
      name: 'self_id',
      status: 'FAIL',
      code: 'SELF_ID_MISSING',
      message: 'self.id is required',
    });
  } else {
    results.push({
      name: 'self_id',
      status: 'OK',
      code: 'OK',
      message: `self.id = ${selfId}`,
    });
  }

  // Check: self.remote_repo_url
  const selfRemoteUrl = getProfileSelfRemoteRepoUrl(profile);
  if (!selfRemoteUrl) {
    results.push({
      name: 'self_remote_repo_url',
      status: 'FAIL',
      code: 'SELF_REMOTE_URL_MISSING',
      message: 'self.remote_repo_url is required',
    });
  } else {
    results.push({
      name: 'self_remote_repo_url',
      status: 'OK',
      code: 'OK',
      message: `self.remote_repo_url = ${selfRemoteUrl}`,
    });
  }

  // Check: activation config completeness (if present)
  const act = profile.activation;
  if (act?.enabled) {
    if (!act.feishu?.open_id) {
      results.push({
        name: 'activation_feishu_open_id',
        status: 'WARN',
        code: 'ACTIVATION_OPEN_ID_MISSING',
        message: 'activation enabled but feishu.open_id is missing',
        details: { activator: act.activator },
      });
    } else {
      results.push({
        name: 'activation_feishu_open_id',
        status: 'OK',
        code: 'OK',
        message: 'feishu.open_id configured',
        details: { activator: act.activator },
      });
    }
  }

  return results;
}
