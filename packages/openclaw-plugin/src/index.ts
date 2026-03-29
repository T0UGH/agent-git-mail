import type { OpenClawPluginApi, OpenClawPluginService } from 'openclaw';
import type { Config } from '@agent-git-mail/agm/config';
import { SessionBindingStore } from './session-binding.js';

const sessionBindings = new SessionBindingStore();

let pluginRuntime: OpenClawPluginApi['runtime'] | null = null;

export function createPlugin(): {
  id: string;
  name: string;
  description: string;
  register: (api: OpenClawPluginApi) => void;
} {
  return {
    id: 'agent-git-mail',
    name: 'Agent Git Mail',
    description: 'Git-based async mailbox for agent-to-agent communication',

    register(api: OpenClawPluginApi): void {
      pluginRuntime = api.runtime;

      // Register session binding hooks
      api.on('session_start', (event) => {
        if (!event.sessionKey) return;
        const parts = event.sessionKey.split(':');
        const agentId = parts[1] ?? '';
        if (agentId && sessionBindings.canBind(event.sessionKey)) {
          sessionBindings.bind(event.sessionKey, agentId);
          api.logger.info(`[agm] bound session ${event.sessionKey} to agent ${agentId}`);
        }
      });

      api.on('session_end', (event) => {
        if (!event.sessionKey) return;
        const parts = event.sessionKey.split(':');
        const agentId = parts[1] ?? '';
        if (agentId) {
          sessionBindings.unbind(agentId);
          api.logger.info(`[agm] unbound session for agent ${agentId}`);
        }
      });

      // Register the daemon service
      const service = createService(api, sessionBindings);
      api.registerService(service);
    },
  };
}

function createService(
  api: OpenClawPluginApi,
  sessionBindings: SessionBindingStore,
): OpenClawPluginService {
  let running = false;

  return {
    id: 'agent-git-mail-daemon',
    start(ctx) {
      running = true;
      ctx.logger.info('[agm] daemon service starting');

      const pollMs = 30_000; // 30 seconds

      const poll = async () => {
        while (running) {
          const start = Date.now();
          try {
            await pollOnce();
          } catch (e) {
            ctx.logger.error('[agm] poll error: ' + String(e));
          }
          const elapsed = Date.now() - start;
          await sleep(Math.max(0, pollMs - elapsed));
        }
      };

      poll().catch(e => ctx.logger.error('[agm] daemon loop error: ' + String(e)));
    },
    stop() {
      running = false;
    },
  };
}

async function pollOnce(): Promise<void> {
  if (!pluginRuntime) return;

  let config: Config | null = null;
  try {
    const { loadConfig } = await import('@agent-git-mail/agm/config');
    config = loadConfig();
  } catch {
    return; // no config
  }

  const { watchAgentOnce } = await import('./watch-agent.js');

  const entries = Object.entries(config.agents);
  for (const [name, agent] of entries) {
    const sessionKey = sessionBindings.get(name);
    if (!sessionKey) continue;

    try {
      await watchAgentOnce(name, agent.repo_path, async (mail) => {
        const text = `New agent git mail: from=${mail.from}, file=${mail.filename}`;
        pluginRuntime!.system.enqueueSystemEvent(text, { sessionKey });
        pluginRuntime!.system.requestHeartbeatNow({ sessionKey });
      });
    } catch {
      // log but don't crash
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
