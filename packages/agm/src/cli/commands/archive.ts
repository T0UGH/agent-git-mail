import { archiveMessage } from '../../app/archive-message.js';

export async function cmdArchive(argv: { filename: string; agent: string }): Promise<void> {
  await archiveMessage({
    filename: argv.filename,
    agent: argv.agent,
    configPath: undefined,
  });
  console.log(`Archived: ${argv.filename}`);
}
