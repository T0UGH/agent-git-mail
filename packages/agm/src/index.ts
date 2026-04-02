#!/usr/bin/env node

import { realpathSync } from 'fs';
import { fileURLToPath } from 'url';
import { cmdConfigShow, cmdConfigGet } from './cli/commands/config.js';
import { cmdSend } from './cli/commands/send.js';
import { cmdReply } from './cli/commands/reply.js';
import { cmdRead } from './cli/commands/read.js';
import { cmdList } from './cli/commands/list.js';
import { cmdArchive } from './cli/commands/archive.js';
import { cmdBootstrap } from './cli/commands/bootstrap.js';

const subcommands: Record<string, (argv: Record<string, unknown>) => Promise<void>> = {
  config: async () => {
    const args = process.argv.slice(3);
    if (args[0] === 'show') {
      await cmdConfigShow();
    } else if (args[0] === 'get') {
      await cmdConfigGet(args[1] ?? '');
    } else if (args[0] === 'set') {
      const { cmdConfigSet } = await import('./cli/commands/config.js');
      await cmdConfigSet(args[1] ?? '', args[2] ?? '');
    } else {
      await cmdConfigShow();
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
  daemon: async () => {
    const { runDaemon } = await import('./app/run-daemon.js');
    const { loadConfig } = await import('./config/load.js');
    const config = loadConfig();
    await runDaemon({ config });
  },
  bootstrap: async (argv) => {
    const opts = {
      selfId: String(argv['selfId'] ?? ''),
      selfRemoteRepoUrl: String(argv['selfRemoteRepoUrl'] ?? ''),
      selfLocalRepoPath: String(argv['selfLocalRepoPath'] ?? ''),
      configPath: argv['configPath'] ? String(argv['configPath']) : undefined,
      skipPluginInstall: argv['skipPluginInstall'] === true,
      activationOpenId: argv['activationOpenId'] ? String(argv['activationOpenId']) : undefined,
      activationPollIntervalSeconds: argv['activationPollIntervalSeconds']
        ? Number(argv['activationPollIntervalSeconds'])
        : undefined,
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
      argv[key] = true;
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
  config [show|get|set]    Show, get, or set config values
  send --from <a> --to <b> --subject <s> --body-file <f>
  reply <filename.md> --from <a> --body-file <f>
  read <filename.md> --agent <a> [--dir inbox|outbox|archive]
  list --agent <a> [--dir inbox|outbox|archive] [--format table|json]
  archive <filename.md> --agent <a>
  daemon                   Run the mail daemon
  bootstrap                Bootstrap AGM (self + plugin installation)

Bootstrap options:
  --self-id <id>                      Required. Your agent / user ID.
  --self-remote-repo-url <url>        Required. Remote git repo URL (e.g. https://github.com/USER/mailbox.git).
  --self-local-repo-path <path>        Required. Local path where the repo will be cloned / already exists.
  --config-path <path>                 Optional. Custom config path.
  --skip-plugin-install                Optional. Skip plugin installation (legacy, plugin is now optional).
  --activation-open-id <openId>       Optional. Feishu open_id for external activation (activator path).
  --activation-poll-interval-seconds <n>  Optional. Activation poll interval (default 5).
  --dry-run                           Optional. Print what would be done without writing.
  --json                              Optional. Output machine-readable JSON.

Examples:
  agm config show
  agm bootstrap --self-id atlas --self-remote-repo-url https://github.com/T0UGH/test-mailbox-a.git --self-local-repo-path /workspace/mailbox/atlas
  agm bootstrap --self-id boron --self-remote-repo-url https://github.com/T0UGH/test-mailbox-b.git --self-local-repo-path /workspace/mailbox/boron --dry-run
  agm bootstrap --self-id atlas --self-remote-repo-url https://github.com/T0UGH/test-mailbox-a.git --self-local-repo-path /workspace/mailbox/atlas --activation-open-id ou_xxx --activation-poll-interval-seconds 5
`);
}

// On macOS (and Linux with symlinked paths), import.meta.url resolves to the real
// path but process.argv[1] uses the symlink path as invoked. Normalize both.
const selfPath = process.argv[1] ? realpathSync(process.argv[1]) : import.meta.filename;
const importPath = fileURLToPath(import.meta.url);
if (selfPath === importPath) {
  main();
}
