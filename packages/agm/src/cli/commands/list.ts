import { listMessages } from '../../app/list-messages.js';

export async function cmdList(argv: { agent: string; dir?: string; format?: string }): Promise<void> {
  const entries = await listMessages({
    agent: argv.agent,
    dir: argv.dir as 'inbox' | 'outbox' | 'archive' | undefined,
    format: argv.format as 'table' | 'json' | undefined,
    configPath: undefined,
  });

  if (argv.format === 'json') {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  if (entries.length === 0) {
    console.log('(no messages)');
    return;
  }

  console.log(`${'FILENAME'.padEnd(44)} ${'FROM'.padEnd(8)} ${'TO'.padEnd(8)} ${'SUBJECT'}`);
  console.log('─'.repeat(100));
  for (const e of entries) {
    console.log(
      `${e.filename.padEnd(44)} ${e.from.padEnd(8)} ${e.to.padEnd(8)} ${e.subject}`,
    );
  }
}
