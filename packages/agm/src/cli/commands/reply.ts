import { replyMessage, type ReplyOptions } from '../../app/reply-message.js';

export async function cmdReply(argv: ReplyOptions & { bodyFile: string }): Promise<void> {
  const result = await replyMessage({
    originalFilename: argv.originalFilename,
    from: argv.from,
    bodyFile: argv.bodyFile,
    dir: argv.dir,
    configPath: undefined,
  });
  console.log(`Sent reply: ${result.filename}`);
}
