import { replyMessage, type ReplyOptions } from '../../app/reply-message.js';

interface ReplyArgv extends ReplyOptions {
  bodyFile: string;
  configPath?: string;
  json?: boolean;
}

export async function cmdReply(argv: ReplyArgv): Promise<void> {
  const result = await replyMessage({
    originalFilename: argv.originalFilename as string,
    from: argv.from as string,
    bodyFile: argv.bodyFile as string,
    dir: argv.dir as 'inbox' | 'outbox' | undefined,
    profile: argv.profile as string,
    configPath: argv.configPath as string | undefined,
  });

  if (argv.json) {
    console.log(JSON.stringify(result));
  } else {
    if (result.partialFailure) {
      console.log(`Sent reply: ${result.filename} (partial failure: ${result.partialFailure.stage} — ${result.partialFailure.error})`);
    } else {
      console.log(`Sent reply: ${result.filename}`);
    }
  }

  // Exit code: 0 = full success, 1 = partial failure or full failure
  if (result.partialFailure || (!result.localSuccess && !result.deliverySuccess)) {
    process.exit(1);
  }
}
