import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadConfig, getAgentRepoPath, getAgentEntries, isConfigV1 } from '../src/config/index.js';

describe('config schema (v1 self + contacts)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'agm-config-test-'));

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function writeConfig(content: string): string {
    const p = join(tmp, `config-${Date.now()}.yaml`);
    writeFileSync(p, content, 'utf-8');
    return p;
  }

  it('accepts valid v1 config with self + contacts', () => {
    const configPath = writeConfig(`
self:
  id: mt
  repo_path: /path/to/mt
contacts:
  hex: /path/to/hex
runtime:
  poll_interval_seconds: 30
`);
    const config = loadConfig(configPath);
    expect(isConfigV1(config)).toBe(true);
  });

  it('getAgentRepoPath returns self repo for self.id', () => {
    const configPath = writeConfig(`
self:
  id: mt
  repo_path: /path/to/mt
contacts:
  hex: /path/to/hex
`);
    const config = loadConfig(configPath);
    expect(getAgentRepoPath(config, 'mt')).toBe('/path/to/mt');
  });

  it('getAgentRepoPath returns contact repo for contact name', () => {
    const configPath = writeConfig(`
self:
  id: mt
  repo_path: /path/to/mt
contacts:
  hex: /path/to/hex
`);
    const config = loadConfig(configPath);
    expect(getAgentRepoPath(config, 'hex')).toBe('/path/to/hex');
  });

  it('getAgentRepoPath returns null for unknown agent', () => {
    const configPath = writeConfig(`
self:
  id: mt
  repo_path: /path/to/mt
contacts:
  hex: /path/to/hex
`);
    const config = loadConfig(configPath);
    expect(getAgentRepoPath(config, 'unknown')).toBe(null);
  });

  it('getAgentEntries returns self + all contacts', () => {
    const configPath = writeConfig(`
self:
  id: mt
  repo_path: /path/to/mt
contacts:
  hex: /path/to/hex
  alice: /path/to/alice
`);
    const config = loadConfig(configPath);
    const entries = getAgentEntries(config);
    expect(entries).toContainEqual(['mt', '/path/to/mt']);
    expect(entries).toContainEqual(['hex', '/path/to/hex']);
    expect(entries).toContainEqual(['alice', '/path/to/alice']);
  });

  it('getAgentEntries handles contacts optional (self-only config)', () => {
    const configPath = writeConfig(`
self:
  id: mt
  repo_path: /path/to/mt
`);
    const config = loadConfig(configPath);
    const entries = getAgentEntries(config);
    expect(entries).toEqual([['mt', '/path/to/mt']]);
  });

  it('rejects self without id', () => {
    const configPath = writeConfig(`
self:
  repo_path: /path/to/mt
contacts:
  hex: /path/to/hex
`);
    expect(() => loadConfig(configPath)).toThrow();
  });

  it('accepts self-only config (bootstrap minimum init)', () => {
    const configPath = writeConfig(`
self:
  id: mt
  repo_path: /path/to/mt
`);
    const config = loadConfig(configPath);
    expect(isConfigV1(config)).toBe(true);
    expect(getAgentRepoPath(config, 'mt')).toBe('/path/to/mt');
  });

  it('getAgentRepoPath works with old agents: format for backwards compat', () => {
    const configPath = writeConfig(`
agents:
  mt:
    repo_path: /path/to/mt
  hex:
    repo_path: /path/to/hex
`);
    const config = loadConfig(configPath);
    expect(isConfigV1(config)).toBe(false);
    expect(getAgentRepoPath(config, 'mt')).toBe('/path/to/mt');
    expect(getAgentRepoPath(config, 'hex')).toBe('/path/to/hex');
    expect(getAgentRepoPath(config, 'unknown')).toBe(null);
    const entries = getAgentEntries(config);
    expect(entries).toContainEqual(['mt', '/path/to/mt']);
    expect(entries).toContainEqual(['hex', '/path/to/hex']);
  });
});
