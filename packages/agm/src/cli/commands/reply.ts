import { replyMessage, type ReplyOptions } from '../../app/reply-message.js';

export async function cmdReply(argv: ReplyOptions & { bodyFile: string; configPath?: string }): Promise<void> {
  const result = await replyMessage({
    originalFilename: argv.originalFilename as string,
    from: argv.from as string,
    bodyFile: argv.bodyFile as string,
    dir: argv.dir as 'inbox' | 'outbox' | undefined,
    profile: argv.profile as string,
    configPath: argv.configPath as string | undefined,
  });
  console.log(`Sent reply: ${result.filename}`);
}
