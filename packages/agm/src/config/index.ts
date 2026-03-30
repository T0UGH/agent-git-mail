export { loadConfig, loadConfigSafe } from './load.js';
export { getConfigPath, getConfigDir } from './paths.js';
export {
  ConfigSchema,
  ConfigSchemaV1,
  isConfigV1,
  getAgentEntries,
  getAgentRepoPath,
  type Config,
  type ConfigV1,
  type AgentConfig,
  type SelfConfig,
  type NotificationsConfig,
  type RuntimeConfig,
} from './schema.js';
