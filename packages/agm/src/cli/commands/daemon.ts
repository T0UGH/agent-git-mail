/**
 * daemon subcommand: handles run/start/stop/status action dispatch.
 *
 * run: foreground daemon loop (delegates to runDaemon)
 * start: install plist + launchctl bootstrap (macOS only)
 * stop: launchctl bootout (macOS only)
 * status: query launchd job state (macOS only)
 */

import { loadConfig } from '../../config/load.js';
import { requireProfile } from '../../config/profile.js';
import { runDaemon } from '../../app/run-daemon.js';
import {
  isMacOS,
  installOrUpdateLaunchdJob,
  startLaunchdJob,
  stopLaunchdJob,
  queryLaunchdJob,
} from '../../daemon/launchd.js';

export type DaemonAction = 'run' | 'start' | 'stop' | 'status';

/** Parse daemon action from argv */
export function parseDaemonAction(argv: Record<string, unknown>): DaemonAction {
  const action = argv['action'];
  if (typeof action === 'string' && ['run', 'start', 'stop', 'status'].includes(action)) {
    return action as DaemonAction;
  }
  // Default to 'run' for backward compatibility with bare `daemon`
  return 'run';
}

export async function cmdDaemon(argv: Record<string, unknown>): Promise<void> {
  const profile = requireProfile(argv['profile'] as string | undefined);
  const config = loadConfig();
  const action = parseDaemonAction(argv);

  switch (action) {
    case 'run':
      await cmdDaemonRun(config, profile, argv);
      break;
    case 'start':
      await cmdDaemonStart(profile);
      break;
    case 'stop':
      await cmdDaemonStop(profile);
      break;
    case 'status':
      await cmdDaemonStatus(profile, argv);
      break;
  }
}

async function cmdDaemonRun(
  config: ReturnType<typeof loadConfig>,
  profile: string,
  argv: Record<string, unknown>,
): Promise<void> {
  const once = argv['once'] === true;
  await runDaemon({
    config,
    profile,
    ...(once ? { onNewMail: async () => {} } : {}),
  });
}

async function cmdDaemonStart(profile: string): Promise<void> {
  if (!isMacOS()) {
    console.error('error: daemon start is only available on macOS');
    console.error("hint: on non-macOS, use 'agm --profile <name> daemon run' to run in the foreground");
    process.exit(1);
    return;
  }

  try {
    installOrUpdateLaunchdJob(profile);
    startLaunchdJob(profile);
    console.log(`daemon started for profile '${profile}'`);
    console.log(`  label: ai.agm.daemon.${profile}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('already running')) {
      console.log(`daemon is already running for profile '${profile}'`);
      return;
    }
    console.error(`error: failed to start daemon: ${msg}`);
    process.exit(1);
  }
}

async function cmdDaemonStop(profile: string): Promise<void> {
  if (!isMacOS()) {
    console.error('error: daemon stop is only available on macOS');
    console.error("hint: on non-macOS, stop the foreground daemon with Ctrl+C");
    process.exit(1);
    return;
  }

  const result = stopLaunchdJob(profile);
  if (result.stopped) {
    console.log(`daemon stopped for profile '${profile}' (${result.reason})`);
  } else {
    console.error(`error: failed to stop daemon: ${result.reason}`);
    process.exit(1);
  }
}

async function cmdDaemonStatus(profile: string, argv: Record<string, unknown>): Promise<void> {
  if (!isMacOS()) {
    console.error('error: daemon status is only available on macOS');
    console.error("hint: on non-macOS, daemon runs in the foreground");
    process.exit(1);
    return;
  }

  const info = queryLaunchdJob(profile);

  if (argv['json'] === true) {
    console.log(JSON.stringify(info, null, 2));
    return;
  }

  console.log(`profile: ${profile}`);
  console.log(`label: ${info.label}`);
  console.log(`state: ${info.state}`);
  console.log(`plist: ${info.plistPath}`);
  console.log(`stdout: ${info.stdoutPath}`);
  console.log(`stderr: ${info.stderrPath}`);
  if (info.pid !== undefined) {
    console.log(`pid: ${info.pid}`);
  }
  if (info.error) {
    console.error(`error: ${info.error}`);
  }
}
