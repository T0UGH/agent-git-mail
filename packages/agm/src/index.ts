#!/usr/bin/env node

import { cmdConfigShow, cmdConfigGet } from './cli/commands/config.js';
import { cmdSend } from './cli/commands/send.js';
import { cmdReply } from './cli/commands/reply.js';
import { cmdRead } from './cli/commands/read.js';
import { cmdList } from './cli/commands/list.js';
import { cmdArchive } from './cli/commands/archive.js';

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

Examples:
  agm config show
  agm send --from mt --to hex --subject "Hello" --body-file ./body.txt
  agm list --agent mt --dir inbox
`);
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main();
}
