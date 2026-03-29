import type { OpenClawPluginApi, OpenClawPluginService } from 'openclaw';
import type { Config, AgentConfig } from '@t0u9h/agent-git-mail/config';
import { SessionBindingStore } from './session-binding.js';

const sessionBindings = new SessionBindingStore();

let pluginRuntime: OpenClawPluginApi['runtime'] | null = null;

const plugin = {
  id: 'openclaw-agent-git-mail',
  name: 'Agent Git Mail',
  description: 'Git-based async mailbox for assistant-style agents',

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

export default plugin;

function createService(
  api: OpenClawPluginApi,
  sessionBindings: SessionBindingStore,
): OpenClawPluginService {
  let running = false;

  return {
    id: 'agent-git-mail-daemon',
    start(ctx) {
      running = true;
      ctx.logger.info('[agm] stage=daemon_start service=agent-git-mail-daemon pollMs=30000');

      const pollMs = 30_000; // 30 seconds

      const poll = async () => {
        while (running) {
          const start = Date.now();
          ctx.logger.info('[agm] stage=poll_start');
          try {
            await pollOnce(ctx.logger);
          } catch (e) {
            ctx.logger.error('[agm] stage=poll_error error=' + String(e));
          }
          const elapsed = Date.now() - start;
          ctx.logger.info(`[agm] stage=poll_end elapsedMs=${elapsed}`);
          await sleep(Math.max(0, pollMs - elapsed));
        }
      };

      poll().catch(e => ctx.logger.error('[agm] stage=daemon_loop_error error=' + String(e)));
    },
    stop(ctx) {
      running = false;
      ctx.logger.info('[agm] stage=daemon_stop service=agent-git-mail-daemon');
    },
  };
}

async function pollOnce(logger: { info(msg: string): void; error(msg: string): void; warn?: (msg: string) => void }): Promise<void> {
  if (!pluginRuntime) {
    logger.info('[agm] stage=runtime_missing');
    return;
  }

  let config: Config | null = null;
  try {
    const { loadConfig } = await import('@t0u9h/agent-git-mail/config');
    config = loadConfig();
    logger.info(`[agm] stage=config_loaded agents=${Object.keys(config.agents).length}`);
  } catch (e) {
    if (logger.warn) {
      logger.warn('[agm] stage=config_load_failed error=' + String(e));
    } else {
      logger.info('[agm] stage=config_load_failed error=' + String(e));
    }
    return;
  }

  const { watchAgentOnce } = await import('./watch-agent.js');

  const entries = Object.entries(config.agents) as Array<[string, AgentConfig]>;
  const forcedSessionKey = process.env.AGM_FORCED_SESSION_KEY ?? null;
  for (const [name, agent] of entries) {
    const boundSessionKey = sessionBindings.get(name);
    const sessionKey = forcedSessionKey ?? boundSessionKey;
    const routeSource = forcedSessionKey ? 'forced-env' : boundSessionKey ? 'binding' : 'missing';

    logger.info(
      `[agm] stage=route agent=${name} source=${routeSource} sessionKey=${sessionKey ?? 'none'} repo=${agent.repo_path}`,
    );

    if (!sessionKey) continue;

    try {
      await watchAgentOnce(name, agent.repo_path, logger, async (mail) => {
        const text = `New agent git mail: from=${mail.from}, file=${mail.filename}`;
        logger.info(
          `[agm] stage=deliver_prepare agent=${name} sessionKey=${sessionKey} file=${mail.filename} from=${mail.from}`,
        );
        pluginRuntime!.system.enqueueSystemEvent(text, { sessionKey });
        logger.info(
          `[agm] stage=enqueue_done agent=${name} sessionKey=${sessionKey} file=${mail.filename}`,
        );
        pluginRuntime!.system.requestHeartbeatNow({ sessionKey });
        logger.info(
          `[agm] stage=heartbeat_requested agent=${name} sessionKey=${sessionKey} file=${mail.filename}`,
        );
      });
    } catch (e) {
      logger.error(
        `[agm] stage=watch_agent_error agent=${name} repo=${agent.repo_path} error=${String(e)}`,
      );
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
