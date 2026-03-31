export { loadConfig, loadConfigSafe } from './load.js';
export { getConfigPath, getConfigDir } from './paths.js';
export {
  ConfigSchema,
  ConfigSchemaV1,
  ContactsConfigSchema,
  isConfigV1,
  getAgentEntries,
  getAgentRepoPath,
  unknownAgentError,
  type Config,
  type ConfigV1,
  type AgentConfig,
  type SelfConfig,
  type NotificationsConfig,
  type RuntimeConfig,
  type ContactsConfig,
} from './schema.js';
