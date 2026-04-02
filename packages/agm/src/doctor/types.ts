export type CheckStatus = 'OK' | 'WARN' | 'FAIL';

export interface CheckResult {
  name: string;       // e.g. "config_schema"
  status: CheckStatus;
  code: string;       // e.g. "CONFIG_INVALID"
  message: string;    // human-readable
  details?: Record<string, unknown>;
}
