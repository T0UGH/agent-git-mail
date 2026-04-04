import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadConfig, isConfigV3 } from '../src/config/index.js';
import { resolveProfile, requireProfile, getProfileNames, hasProfile } from '../src/config/profile.js';
import { parseYaml } from 'yaml';

describe('config schema (V3 profile format)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'agm-config-test-'));

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function writeConfig(content: string): string {
    const p = join(tmp, `config-${Date.now()}.yaml`);
    writeFileSync(p, content, 'utf-8');
    return p;
  }

  it('V3 config loads successfully', () => {
    const configPath = writeConfig(`
profiles:
  mt:
    self:
      id: mt
      remote_repo_url: https://github.com/test/mt.git
    contacts:
      hex:
        remote_repo_url: https://github.com/test/hex.git
    notifications:
      default_target: main
      bind_session_key: null
      forced_session_key: null
    runtime:
      poll_interval_seconds: 30
`);
    const config = loadConfig(configPath);
    expect(isConfigV3(config)).toBe(true);
  });

  it('resolveProfile(config, "mt") returns the mt profile', () => {
    const configPath = writeConfig(`
profiles:
  mt:
    self:
      id: mt
      remote_repo_url: https://github.com/test/mt.git
    contacts:
      hex:
        remote_repo_url: https://github.com/test/hex.git
    notifications:
      default_target: main
      bind_session_key: null
      forced_session_key: null
    runtime:
      poll_interval_seconds: 30
  hex:
    self:
      id: hex
      remote_repo_url: https://github.com/test/hex.git
    contacts: {}
    notifications:
      default_target: main
      bind_session_key: null
      forced_session_key: null
    runtime:
      poll_interval_seconds: 30
`);
    const config = loadConfig(configPath);
    const profile = resolveProfile(config, 'mt');
    expect(profile.self.id).toBe('mt');
    expect(profile.self.remote_repo_url).toBe('https://github.com/test/mt.git');
  });

  it('resolveProfile(config, "unknown") throws with available profiles listed', () => {
    const configPath = writeConfig(`
profiles:
  mt:
    self:
      id: mt
      remote_repo_url: https://github.com/test/mt.git
    contacts: {}
    notifications:
      default_target: main
      bind_session_key: null
      forced_session_key: null
    runtime:
      poll_interval_seconds: 30
  hex:
    self:
      id: hex
      remote_repo_url: https://github.com/test/hex.git
    contacts: {}
    notifications:
      default_target: main
      bind_session_key: null
      forced_session_key: null
    runtime:
      poll_interval_seconds: 30
`);
    const config = loadConfig(configPath);
    expect(() => resolveProfile(config, 'unknown')).toThrow();
    expect(() => resolveProfile(config, 'unknown')).toThrow('Available profiles: mt, hex');
  });

  it('requireProfile(null) throws', () => {
    expect(() => requireProfile(null)).toThrow('--profile');
    expect(() => requireProfile(undefined)).toThrow('--profile');
  });

  it('requireProfile("mt") returns "mt"', () => {
    expect(requireProfile('mt')).toBe('mt');
  });

  it('getProfileNames(config) returns all profile names', () => {
    const configPath = writeConfig(`
profiles:
  mt:
    self:
      id: mt
      remote_repo_url: https://github.com/test/mt.git
    contacts: {}
    notifications:
      default_target: main
      bind_session_key: null
      forced_session_key: null
    runtime:
      poll_interval_seconds: 30
  hex:
    self:
      id: hex
      remote_repo_url: https://github.com/test/hex.git
    contacts: {}
    notifications:
      default_target: main
      bind_session_key: null
      forced_session_key: null
    runtime:
      poll_interval_seconds: 30
`);
    const config = loadConfig(configPath);
    const names = getProfileNames(config);
    expect(names).toContain('mt');
    expect(names).toContain('hex');
    expect(names).toHaveLength(2);
  });

  it('hasProfile(config, "mt") returns true', () => {
    const configPath = writeConfig(`
profiles:
  mt:
    self:
      id: mt
      remote_repo_url: https://github.com/test/mt.git
    contacts: {}
    notifications:
      default_target: main
      bind_session_key: null
      forced_session_key: null
    runtime:
      poll_interval_seconds: 30
`);
    const config = loadConfig(configPath);
    expect(hasProfile(config, 'mt')).toBe(true);
    expect(hasProfile(config, 'unknown')).toBe(false);
  });

  it('isConfigV3(config) returns true for V3 config', () => {
    const configPath = writeConfig(`
profiles:
  mt:
    self:
      id: mt
      remote_repo_url: https://github.com/test/mt.git
    contacts: {}
    notifications:
      default_target: main
      bind_session_key: null
      forced_session_key: null
    runtime:
      poll_interval_seconds: 30
`);
    const config = loadConfig(configPath);
    expect(isConfigV3(config)).toBe(true);
  });

  it('old V1 format (top-level self) is rejected', () => {
    const configPath = writeConfig(`
self:
  id: mt
  remote_repo_url: https://github.com/test/mt.git
contacts:
  hex:
    remote_repo_url: https://github.com/test/hex.git
runtime:
  poll_interval_seconds: 30
`);
    // V1 format should fail schema validation since V3 requires 'profiles' key
    expect(() => loadConfig(configPath)).toThrow();
  });

  it('V3 config with activation section loads correctly', () => {
    const configPath = writeConfig(`
profiles:
  mt:
    self:
      id: mt
      remote_repo_url: https://github.com/test/mt.git
    contacts: {}
    notifications:
      default_target: main
      bind_session_key: null
      forced_session_key: null
    runtime:
      poll_interval_seconds: 30
    activation:
      enabled: true
      activator: feishu-openclaw-agent
      dedupe_mode: filename
      feishu:
        open_id: ou_xxx
        message_template: "hello"
`);
    const config = loadConfig(configPath);
    const profile = resolveProfile(config, 'mt');
    expect(profile.activation?.enabled).toBe(true);
    expect(profile.activation?.feishu?.open_id).toBe('ou_xxx');
  });

  it('V3 config with host_integration section loads correctly', () => {
    const configPath = writeConfig(`
profiles:
  mt:
    self:
      id: mt
      remote_repo_url: https://github.com/test/mt.git
    contacts: {}
    notifications:
      default_target: main
      bind_session_key: null
      forced_session_key: null
    runtime:
      poll_interval_seconds: 30
    host_integration:
      kind: happyclaw
      happyclaw:
        base_url: http://127.0.0.1:3000/internal
        bearer_token_env: HAPPYCLAW_INTERNAL_SECRET
        target_jid: "test-jid"
`);
    const config = loadConfig(configPath);
    const profile = resolveProfile(config, 'mt');
    expect(profile.host_integration?.kind).toBe('happyclaw');
    expect(profile.host_integration?.happyclaw?.target_jid).toBe('test-jid');
  });
});
