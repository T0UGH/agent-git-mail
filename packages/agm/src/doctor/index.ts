/**
 * Doctor orchestrator.
 * Runs all or a subset of check groups and formats output.
 */

import { checkConfig } from './checks/config.js';
import { checkGit } from './checks/git.js';
import { checkRuntime } from './checks/runtime.js';
import { checkState } from './checks/state.js';
import type { CheckResult } from './types.js';

export type DoctorGroup = 'config' | 'git' | 'runtime' | 'state';

export interface DoctorOptions {
  group?: DoctorGroup | 'all';
  json?: boolean;
}

const GROUP_CHECKERS: Record<DoctorGroup, () => CheckResult[]> = {
  config: checkConfig,
  git: checkGit,
  runtime: checkRuntime,
  state: checkState,
};

export function runDoctor(opts: DoctorOptions = {}): CheckResult[] {
  const { group = 'all' } = opts;

  if (group === 'all') {
    const all: CheckResult[] = [
      ...checkConfig(),
      ...checkGit(),
      ...checkRuntime(),
      ...checkState(),
    ];
    return all;
  }

  const checker = GROUP_CHECKERS[group];
  if (!checker) {
    return [
      {
        name: 'unknown_group',
        status: 'FAIL',
        code: 'UNKNOWN_GROUP',
        message: `unknown doctor group: ${group}`,
      },
    ];
  }

  return checker();
}

export function formatDoctorOutput(results: CheckResult[], json = false): string {
  if (json) {
    return JSON.stringify(results, null, 2);
  }

  const lines: string[] = [];
  let ok = 0, warn = 0, fail = 0;

  for (const r of results) {
    lines.push(`CHECK ${r.name.padEnd(30)} ${r.status.padEnd(6)} ${r.message}`);
    if (r.status === 'OK') ok++;
    else if (r.status === 'WARN') warn++;
    else fail++;
  }

  lines.push(`SUMMARY fail=${fail} warn=${warn} ok=${ok}`);
  return lines.join('\n');
}
