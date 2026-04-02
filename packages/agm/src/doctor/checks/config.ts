/**
 * Doctor checks: config
 * Validates config file existence, schema, self fields, and activation config.
 */

import { loadConfigSafe } from '../../config/load.js';
import { getConfigPath } from '../../config/paths.js';
import { isConfigV2 } from '../../config/schema.js';
import type { CheckResult } from '../types.js';
import { existsSync } from 'fs';

export function checkConfig(): CheckResult[] {
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

  // Doctor checks are designed for v2 config format
  if (!isConfigV2(config)) {
    results.push({
      name: 'config_format',
      status: 'FAIL',
      code: 'CONFIG_NOT_V2',
      message: 'doctor checks require v2 config format (self.remote_repo_url)',
    });
    return results;
  }

  // Check: self.id
  if (!config.self?.id) {
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
      message: `self.id = ${config.self.id}`,
    });
  }

  // Check: self.local_repo_path
  if (!config.self?.local_repo_path) {
    results.push({
      name: 'self_local_repo_path',
      status: 'FAIL',
      code: 'SELF_REPO_PATH_MISSING',
      message: 'self.local_repo_path is required',
    });
  } else {
    results.push({
      name: 'self_local_repo_path',
      status: 'OK',
      code: 'OK',
      message: `self.local_repo_path = ${config.self.local_repo_path}`,
    });
  }

  // Check: self.remote_repo_url
  if (!config.self?.remote_repo_url) {
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
      message: `self.remote_repo_url = ${config.self.remote_repo_url}`,
    });
  }

  // Check: activation config completeness (if present)
  const act = (config as any).activation;
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
