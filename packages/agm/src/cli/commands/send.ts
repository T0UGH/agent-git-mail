import { sendMessage, type SendOptions } from '../../app/send-message.js';

interface SendArgv extends SendOptions {
  json?: boolean;
}

export async function cmdSend(argv: SendArgv): Promise<void> {
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

  if (argv.json) {
    console.log(JSON.stringify(result));
  } else {
    if (result.partialFailure) {
      console.log(`Sent: ${result.filename} (partial failure: ${result.partialFailure.stage} — ${result.partialFailure.error})`);
    } else {
      console.log(`Sent: ${result.filename}`);
    }
  }

  // Exit code: 0 = full success, 1 = partial failure or full failure
  if (result.partialFailure || (!result.localSuccess && !result.deliverySuccess)) {
    process.exit(1);
  }
}
