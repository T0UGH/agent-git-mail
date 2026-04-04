/**
 * agm doctor CLI command.
 * Usage: agm doctor [config|git|runtime|state] [--profile <name>] [--json]
 */

import { runDoctor, formatDoctorOutput, type DoctorGroup } from '../../doctor/index.js';
import { appendEvent } from '../../log/events.js';
import { loadConfigSafe } from '../../config/load.js';
import { resolveProfile } from '../../config/profile.js';
import { getProfileSelfId } from '../../config/index.js';

const VALID_GROUPS: DoctorGroup[] = ['config', 'git', 'runtime', 'state'];

export async function cmdDoctor(argv: Record<string, unknown>): Promise<void> {
  const groupArg = String(argv['group'] ?? 'all');
  const json = argv['json'] === true;
  const profileArg = String(argv['profile']);

  // Determine group
  let group: DoctorGroup | 'all' = 'all';
  if (groupArg !== 'all') {
    if (VALID_GROUPS.includes(groupArg as DoctorGroup)) {
      group = groupArg as DoctorGroup;
    } else {
      console.error(`Invalid group: ${groupArg}. Use: ${VALID_GROUPS.join('|')} or 'all'`);
      process.exit(1);
    }
  }

  // Load config for self_id
  const configResult = loadConfigSafe();
  let selfId = 'unknown';
  if (configResult.ok) {
    try {
      const profile = resolveProfile(configResult.data, profileArg);
      selfId = getProfileSelfId(profile) ?? 'unknown';
    } catch {
      // profile not found, use unknown
    }
  }

  // Write doctor_run event
  try {
    appendEvent({
      ts: new Date().toISOString(),
      type: 'doctor_run',
      level: 'info',
      self_id: selfId,
      message: `doctor ${group === 'all' ? '' : group} run`,
      details: { group, profile: profileArg },
    }, profileArg);
  } catch {
    // Non-fatal: don't fail if we can't write the event
  }

  // Run doctor
  const results = runDoctor({ group, profile: profileArg, json });
  const output = formatDoctorOutput(results, json);
  console.log(output);
}
