import { readMessage } from '../../app/read-message.js';
import { serializeFrontmatter } from '../../domain/frontmatter.js';

export async function cmdRead(argv: { filename: string; agent: string; profile?: string; dir?: string; configPath?: string }): Promise<void> {
  const result = await readMessage({
    filename: argv.filename as string,
    agent: argv.agent as string,
    profile: argv.profile as string,
    dir: argv.dir as 'inbox' | 'outbox' | 'archive' | undefined,
    configPath: argv.configPath as string | undefined,
  });
  console.log(serializeFrontmatter(result.frontmatter));
  console.log('\n---\n');
  console.log(result.body);
}
