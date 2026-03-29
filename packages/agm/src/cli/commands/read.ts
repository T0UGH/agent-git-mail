import { readMessage } from '../../app/read-message.js';
import { serializeFrontmatter } from '../../domain/frontmatter.js';

export async function cmdRead(argv: { filename: string; agent: string; dir?: string }): Promise<void> {
  const result = await readMessage({
    filename: argv.filename,
    agent: argv.agent,
    dir: argv.dir as 'inbox' | 'outbox' | 'archive' | undefined,
    configPath: undefined,
  });
  console.log(serializeFrontmatter(result.frontmatter));
  console.log('\n---\n');
  console.log(result.body);
}
