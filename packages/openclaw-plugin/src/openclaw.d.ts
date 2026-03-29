declare module 'openclaw' {
  export interface SessionEvent {
    sessionKey: string;
    [key: string]: unknown;
  }

  export interface PluginLogger {
    info(msg: string): void;
    warn(msg: string): void;
    error(msg: string): void;
  }

  export interface OpenClawPluginApi {
    id: string;
    config: Record<string, unknown>;
    log: PluginLogger;
    logger: PluginLogger;
    on(event: 'session_start', handler: (event: SessionEvent) => void): void;
    on(event: 'session_end', handler: (event: SessionEvent) => void): void;
    off(event: string, handler: (...args: unknown[]) => void): void;
    registerService(service: OpenClawPluginService): void;
    runtime: {
      getConfig(): Record<string, unknown>;
      getChannel(name: string): unknown;
      system: {
        enqueueSystemEvent(text: string, meta: unknown): void;
        requestHeartbeatNow(meta: unknown): void;
      };
    };
  }

  export interface ServiceContext {
    logger: PluginLogger;
    [key: string]: unknown;
  }

  export interface OpenClawPluginService {
    id: string;
    start(ctx: ServiceContext): void;
    stop(ctx: ServiceContext): void;
  }
}
