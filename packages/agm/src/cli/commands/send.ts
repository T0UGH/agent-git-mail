import { sendMessage, type SendOptions } from '../../app/send-message.js';

export async function cmdSend(argv: SendOptions): Promise<void> {
  const result = await sendMessage({
    from: argv.from,
    to: argv.to,
    subject: argv.subject,
    bodyFile: argv.bodyFile,
    replyTo: argv.replyTo,
    expectsReply: argv.expectsReply,
    configPath: undefined,
  });
  console.log(`Sent: ${result.filename}`);
}
