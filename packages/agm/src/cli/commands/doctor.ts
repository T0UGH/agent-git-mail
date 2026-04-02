/**
 * agm doctor CLI command.
 * Usage: agm doctor [config|git|runtime|state] [--json]
 */

import { runDoctor, formatDoctorOutput, type DoctorGroup } from '../../doctor/index.js';
import { appendEvent } from '../../log/events.js';
import { loadConfigSafe } from '../../config/load.js';
import { isConfigV2 } from '../../config/schema.js';

const VALID_GROUPS: DoctorGroup[] = ['config', 'git', 'runtime', 'state'];

export async function cmdDoctor(argv: Record<string, unknown>): Promise<void> {
  const groupArg = String(argv['group'] ?? 'all');
  const json = argv['json'] === true;

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
  if (configResult.ok && isConfigV2(configResult.data)) {
    selfId = configResult.data.self?.id ?? 'unknown';
  }

  // Write doctor_run event
  try {
    appendEvent({
      ts: new Date().toISOString(),
      type: 'doctor_run',
      level: 'info',
      self_id: selfId,
      message: `doctor ${group === 'all' ? '' : group} run`,
      details: { group },
    });
  } catch {
    // Non-fatal: don't fail if we can't write the event
  }

  // Run doctor
  const results = runDoctor({ group, json });
  const output = formatDoctorOutput(results, json);
  console.log(output);
}
