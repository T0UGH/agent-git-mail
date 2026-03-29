import type { Config } from '../config/schema.js';

export interface DaemonOptions {
  config: Config;
  agentName?: string;
  onNewMail?: (mail: { agent: string; filename: string; from: string }) => Promise<void>;
}

export async function runDaemon(opts: DaemonOptions): Promise<void> {
  // Stub for now — fleshed out in Chunk 5
  console.log('daemon running (stub)');
  await new Promise(() => {});
}
