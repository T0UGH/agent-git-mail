#!/usr/bin/env node

import { realpathSync } from 'fs';
import { fileURLToPath } from 'url';
import { cmdConfigShow, cmdConfigGet } from './cli/commands/config.js';
import { cmdDoctor } from './cli/commands/doctor.js';
import { cmdLog } from './cli/commands/log.js';
import { cmdSend } from './cli/commands/send.js';
import { cmdReply } from './cli/commands/reply.js';
import { cmdRead } from './cli/commands/read.js';
import { cmdList } from './cli/commands/list.js';
import { cmdArchive } from './cli/commands/archive.js';
import { cmdBootstrap } from './cli/commands/bootstrap.js';

const subcommands: Record<string, (argv: Record<string, unknown>) => Promise<void>> = {
  config: async (argv) => {
    // profile is guaranteed to exist here (enforced by main() profile check)
    const profile = String(argv['profile']);
    const args = process.argv.slice(3);
    if (args[0] === 'show') {
      await cmdConfigShow(profile);
    } else if (args[0] === 'get') {
      await cmdConfigGet(profile, args[1] ?? '');
    } else if (args[0] === 'set') {
      const { cmdConfigSet } = await import('./cli/commands/config.js');
      await cmdConfigSet(profile, args[1] ?? '', args[2] ?? '');
    } else {
      await cmdConfigShow(profile);
    }
  },
  send: async (argv) => {
    await cmdSend(argv as unknown as Parameters<typeof cmdSend>[0]);
  },
  reply: async (argv) => {
    await cmdReply(argv as unknown as Parameters<typeof cmdReply>[0]);
  },
  read: async (argv) => {
    await cmdRead(argv as unknown as Parameters<typeof cmdRead>[0]);
  },
  list: async (argv) => {
    await cmdList(argv as unknown as Parameters<typeof cmdList>[0]);
  },
  archive: async (argv) => {
    await cmdArchive(argv as unknown as Parameters<typeof cmdArchive>[0]);
  },
  daemon: async (argv) => {
    const { runDaemon } = await import('./app/run-daemon.js');
    const { loadConfig } = await import('./config/load.js');
    const { requireProfile } = await import('./config/profile.js');
    const config = loadConfig();
    const profile = requireProfile(argv['profile'] as string | undefined);
    const once = argv['once'] === true;
    await runDaemon({
      config,
      profile,
      // Pass a no-op onNewMail to trigger one-shot mode
      ...(once ? { onNewMail: async () => {} } : {}),
    });
  },
  doctor: async (argv) => {
    await cmdDoctor(argv as unknown as Parameters<typeof cmdDoctor>[0]);
  },
  log: async (argv) => {
    await cmdLog(argv as unknown as Parameters<typeof cmdLog>[0]);
  },
  bootstrap: async (argv) => {
    const opts = {
      selfId: argv['selfId'] ? String(argv['selfId']) : undefined,
      selfRemoteRepoUrl: argv['selfRemoteRepoUrl'] ? String(argv['selfRemoteRepoUrl']) : undefined,
      selfLocalRepoPath: argv['selfLocalRepoPath'] ? String(argv['selfLocalRepoPath']) : undefined,
      profile: String(argv['profile'] ?? ''),
      configPath: argv['configPath'] ? String(argv['configPath']) : undefined,
      activationOpenId: argv['activationOpenId'] ? String(argv['activationOpenId']) : undefined,
      dryRun: argv['dryRun'] === true,
      json: argv['json'] === true,
    };
    await cmdBootstrap(opts);
  },
};

function toCamelCase(key: string): string {
  return key.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
}

function positionalKeyFor(subcommand: string): string | null {
  switch (subcommand) {
    case 'reply':
      return 'originalFilename';
    case 'read':
    case 'archive':
      return 'filename';
    case 'doctor':
      return 'group';
    default:
      return null;
  }
}

export function parseArgv(args: string[]): { subcommand: string; argv: Record<string, unknown> } {
  const subcommand = args[0] ?? 'help';
  const argv: Record<string, unknown> = {};
  const positional: string[] = [];

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = toCamelCase(arg.slice(2));
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        argv[key] = next;
        i++;
      } else {
        argv[key] = true;
      }
    } else if (arg.startsWith('-')) {
      const key = toCamelCase(arg.slice(1));
      // Short option: -p <value> style (e.g. -p mt)
      const next = args[i + 1];
      if (next && !next.startsWith('--') && !next.startsWith('-')) {
        argv[key] = next;
        i++;
      } else {
        argv[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  const positionalKey = positionalKeyFor(subcommand);
  if (positionalKey && positional[0] !== undefined) {
    argv[positionalKey] = positional[0];
  }

  return { subcommand, argv };
}

function parseArgs(): { subcommand: string; argv: Record<string, unknown> } {
  return parseArgv(process.argv.slice(2));
}

async function main() {
  const { subcommand, argv } = parseArgs();

  if (subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
    printHelp();
    return;
  }

  // Normalize -p to --profile (parseArgv stores it under 'p' key)
  argv['profile'] ??= argv['p'] as string | undefined;

  // Subcommands that require a profile argument
  const profileSubcommands = ['send', 'reply', 'read', 'list', 'archive', 'doctor', 'log', 'daemon', 'bootstrap', 'config'];
  if (profileSubcommands.includes(subcommand)) {
    const { loadConfig } = await import('./config/load.js');
    const { requireProfile } = await import('./config/profile.js');
    const config = loadConfig();
    // Throws if profile is missing
    requireProfile(argv['profile'] as string | undefined);
    // Also validate profile exists in config
    const { hasProfile } = await import('./config/profile.js');
    if (!hasProfile(config, argv['profile'] as string)) {
      const { getProfileNames } = await import('./config/profile.js');
      const names = getProfileNames(config);
      const avail = names.length > 0 ? `\nAvailable profiles: ${names.join(', ')}` : '\nNo profiles found in config.';
      console.error(`Unknown profile: ${argv['profile']}${avail}`);
      process.exit(1);
    }
  }

  const handler = subcommands[subcommand];
  if (!handler) {
    console.error(`Unknown subcommand: ${subcommand}`);
    printHelp();
    process.exit(1);
    return;
  }

  try {
    await handler(argv);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

function printHelp() {
  console.log(`agm - Agent Git Mail CLI

Usage:
  agm <subcommand> [options]

Subcommands:
  config [show|get|set]    Show, get, or set profile-scoped config values
  send --profile <name> --from <a> --to <b> --subject <s> --body-file <f>
  reply --profile <name> <filename.md> --from <a> --body-file <f>
  read --profile <name> <filename.md> --agent <a> [--dir inbox|outbox|archive]
  list --profile <name> --agent <a> [--dir inbox|outbox|archive] [--format table|json]
  archive --profile <name> <filename.md> --agent <a>
  daemon --profile <name> [--once]
  doctor --profile <name> [config|git|...]  Run health checks (default: all groups)
  log --profile <name> [--tail <n>] [--since <duration>] [--type <type>] [--json]
                            Show structured event log
  bootstrap                Bootstrap AGM (self + daemon + external activator)

Profile options:
  --profile, -p <name>      Required. Profile name (e.g. mt, hex)

Bootstrap options:
  --self-id <id>                      Optional. Your agent / user ID (defaults to profile name).
  --self-remote-repo-url <url>        Optional. Remote git repo URL.
  --self-local-repo-path <path>       Optional. Local repo path (auto-derived from profile if omitted).
  --config-path <path>                 Optional. Custom config path.
  --activation-open-id <openId>       Optional. Feishu open_id for external activation.
  --dry-run                           Optional. Print what would be done without writing.
  --json                              Optional. Output machine-readable JSON.

Examples:
  agm --profile mt config show
  agm --profile mt config get runtime.poll_interval_seconds
  agm --profile mt config set runtime.poll_interval_seconds 60
  agm --profile mt send --from mt --to hex --subject "Hello" --body-file /tmp/body.md
  agm --profile hex daemon
  agm --profile mt doctor
  agm --profile mt bootstrap
  agm --profile mt bootstrap --self-remote-repo-url https://github.com/USER/mailbox.git
`);
}

// On macOS (and Linux with symlinked paths), import.meta.url resolves to the real
// path but process.argv[1] uses the symlink path as invoked. Normalize both.
const selfPath = process.argv[1] ? realpathSync(process.argv[1]) : import.meta.filename;
const importPath = fileURLToPath(import.meta.url);
if (selfPath === importPath) {
  main();
}
