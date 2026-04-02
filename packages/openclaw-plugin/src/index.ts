import type { OpenClawPluginApi, OpenClawPluginService } from 'openclaw';
import type { Config, AgentConfig } from '@t0u9h/agent-git-mail/config';
import { isConfigV1, isConfigV2, getAgentEntries } from '@t0u9h/agent-git-mail/config';
import { SessionBindingStore } from './session-binding.js';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

const sessionBindings = new SessionBindingStore();

let pluginRuntime: OpenClawPluginApi['runtime'] | null = null;

export function resolveRouteTarget(opts: {
  forcedSessionKey: string | null;
  boundSessionKey: string | undefined;
}): { sessionKey: string; routeSource: 'forced-env' | 'binding' | 'default-main' } {
  if (opts.forcedSessionKey) {
    return { sessionKey: opts.forcedSessionKey, routeSource: 'forced-env' };
  }
  if (opts.boundSessionKey) {
    return { sessionKey: opts.boundSessionKey, routeSource: 'binding' };
  }
  return { sessionKey: 'agent:main:main', routeSource: 'default-main' };
}

const plugin = {
  id: 'openclaw-agent-git-mail',
  name: 'Agent Git Mail',
  description: 'Git-based async mailbox for assistant-style agents',

  register(api: OpenClawPluginApi): void {
    pluginRuntime = api.runtime;

    // Register session binding hooks
    api.on('session_start', (event) => {
      if (!event.sessionKey) return;
      if (!sessionBindings.canBind(event.sessionKey)) return;

      import('@t0u9h/agent-git-mail/config').then(({ loadConfigSafe, getSelfId }) => {
        const result = loadConfigSafe();
        if (!result.ok) return;
        const selfId = getSelfId(result.data);
        if (!selfId) return;
        sessionBindings.bind(event.sessionKey, selfId);
        api.logger.info(`[agm] bound session ${event.sessionKey} to agent ${selfId}`);
      }).catch(() => {
        // ignore config load errors in hook path
      });
    });

    api.on('session_end', (event) => {
      if (!event.sessionKey) return;

      import('@t0u9h/agent-git-mail/config').then(({ loadConfigSafe, getSelfId }) => {
        const result = loadConfigSafe();
        if (!result.ok) return;
        const selfId = getSelfId(result.data);
        if (!selfId) return;
        sessionBindings.unbind(selfId, event.sessionKey);
        api.logger.info(`[agm] unbound session ${event.sessionKey} for agent ${selfId}`);
      }).catch(() => {
        // ignore config load errors in hook path
      });
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

  const { loadConfigSafe } = await import('@t0u9h/agent-git-mail/config');

  const result = loadConfigSafe();
  if (!result.ok) {
    if (logger.warn) {
      logger.warn('[agm] stage=config_load_failed error=' + String(result.error));
    } else {
      logger.info('[agm] stage=config_load_failed error=' + String(result.error));
    }
    return;
  }
  const config = result.data;

  if (isConfigV2(config)) {
    // v2 / mailbox model: watch self local inbox (mail is delivered via dual-write)
    const { watchAgentOnce } = await import('./watch-agent.js');

    // Preflight: check self local repo exists
    const selfRepoPath = config.self.local_repo_path;
    if (!existsSync(selfRepoPath)) {
      (logger.warn ?? logger.info)(`[agm] stage=preflight_failed reason=missing_self_repo_path id=${config.self.id} path=${selfRepoPath}`);
      return;
    }
    try {
      execSync('git rev-parse --git-dir', { cwd: selfRepoPath, stdio: 'pipe' });
    } catch {
      (logger.warn ?? logger.info)(`[agm] stage=preflight_failed reason=not_a_git_repo id=${config.self.id} path=${selfRepoPath}`);
      return;
    }
    logger.info(`[agm] stage=preflight_passed id=${config.self.id} repo=${selfRepoPath}`);

    const forcedSessionKey = process.env.AGM_FORCED_SESSION_KEY ?? config.notifications?.bind_session_key ?? config.notifications?.forced_session_key ?? null;
    const selfId = config.self.id;
    const boundSessionKey = sessionBindings.get(selfId);
    const { sessionKey, routeSource } = resolveRouteTarget({ forcedSessionKey, boundSessionKey });

    logger.info(
      `[agm] stage=v2_discovery id=${selfId} source=${routeSource} sessionKey=${sessionKey}`,
    );

    try {
      await watchAgentOnce(selfId, selfRepoPath, logger, async (mail) => {
        const text = `New agent git mail: from=${mail.from}, file=${mail.filename}`;
        logger.info(
          `[agm] stage=deliver_prepare agent=${selfId} sessionKey=${sessionKey} file=${mail.filename} from=${mail.from}`,
        );
        pluginRuntime!.system.enqueueSystemEvent(text, { sessionKey });
        logger.info(
          `[agm] stage=enqueue_done agent=${selfId} sessionKey=${sessionKey} file=${mail.filename}`,
        );
        pluginRuntime!.system.requestHeartbeatNow({ sessionKey });
        logger.info(
          `[agm] stage=heartbeat_requested agent=${selfId} sessionKey=${sessionKey} file=${mail.filename}`,
        );
      });
    } catch (e) {
      logger.error(`[agm] stage=v2_discovery_error id=${selfId} error=${String(e)}`);
    }
    return;
  }

  // Legacy v0/v1: use local-watching approach
  // Preflight check for v1 config: validate self.repo_path
  if (isConfigV1(config)) {
    const selfRepoPath = config.self.repo_path;
    if (!existsSync(selfRepoPath)) {
      (logger.warn ?? logger.info)(`[agm] stage=preflight_failed reason=missing_self_repo_path id=${config.self.id} path=${selfRepoPath}`);
      return;
    }
    try {
      execSync('git rev-parse --git-dir', { cwd: selfRepoPath, stdio: 'pipe' });
    } catch {
      (logger.warn ?? logger.info)(`[agm] stage=preflight_failed reason=not_a_git_repo id=${config.self.id} path=${selfRepoPath}`);
      return;
    }
    logger.info(`[agm] stage=preflight_passed id=${config.self.id} repo=${selfRepoPath}`);
  }

  const { watchAgentOnce } = await import('./watch-agent.js');

  // Build agent entries using getAgentEntries (handles v1 self+contacts and old agents map)
  const entries = getAgentEntries(config);

  const forcedSessionKey = process.env.AGM_FORCED_SESSION_KEY ?? null;
  for (const [name, repoPath] of entries) {
    const boundSessionKey = sessionBindings.get(name);
    const { sessionKey, routeSource } = resolveRouteTarget({ forcedSessionKey, boundSessionKey });

    logger.info(
      `[agm] stage=route agent=${name} source=${routeSource} sessionKey=${sessionKey} repo=${repoPath}`,
    );

    try {
      await watchAgentOnce(name, repoPath, logger, async (mail) => {
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
        `[agm] stage=watch_agent_error agent=${name} repo=${repoPath} error=${String(e)}`,
      );
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
