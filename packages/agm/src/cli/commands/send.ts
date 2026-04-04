import { sendMessage, type SendOptions } from '../../app/send-message.js';

export async function cmdSend(argv: SendOptions): Promise<void> {
  const result = await sendMessage({
    from: argv.from as string,
    to: argv.to as string,
    subject: argv.subject as string,
    bodyFile: argv.bodyFile as string,
    replyTo: argv.replyTo as string | undefined,
    expectsReply: argv.expectsReply as boolean | undefined,
    profile: argv.profile as string,
    configPath: argv.configPath as string | undefined,
  });
  console.log(`Sent: ${result.filename}`);
}
