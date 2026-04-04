import { archiveMessage } from '../../app/archive-message.js';

export async function cmdArchive(argv: { filename: string; agent: string; profile?: string }): Promise<void> {
  await archiveMessage({
    filename: argv.filename,
    agent: argv.agent,
    profile: argv.profile as string,
  });
  console.log(`Archived: ${argv.filename}`);
}
