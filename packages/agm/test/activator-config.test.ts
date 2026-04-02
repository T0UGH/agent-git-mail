/**
 * Tests for external activator config consumption.
 * Verifies:
 * - createActivator returns null when activation is not enabled
 * - createActivator returns feishu-openclaw-agent with correct config fields
 * - The activator correctly passes snake_case fields (open_id, message_template)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Mock child_process at module level — this replaces execFileSync everywhere
vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

describe('activator config factory', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'agm-activator-config-test-'));

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function writeConfig(content: string): string {
    const p = join(tmp, `config-${Date.now()}.yaml`);
    writeFileSync(p, content, 'utf-8');
    return p;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createActivator returns null when activation is not enabled', async () => {
    const { loadConfig } = await import('../src/config/index.js');
    const { createActivator } = await import('../src/activator/index.js');
    const configPath = writeConfig(`
self:
  id: mt
  local_repo_path: /tmp/mt
  remote_repo_url: https://github.com/T0UGH/mt-mailbox.git
`);
    const config = loadConfig(configPath);
    expect(createActivator(config)).toBeNull();
  });

  it('createActivator returns a feishu-openclaw-agent when enabled', async () => {
    const { loadConfig } = await import('../src/config/index.js');
    const { createActivator } = await import('../src/activator/index.js');
    const configPath = writeConfig(`
self:
  id: mt
  local_repo_path: /tmp/mt
  remote_repo_url: https://github.com/T0UGH/mt-mailbox.git
activation:
  enabled: true
  activator: feishu-openclaw-agent
  dedupe_mode: filename
  feishu:
    open_id: ou_test123
    message_template: "hello"
`);
    const config = loadConfig(configPath);
    const activator = createActivator(config);
    expect(activator).not.toBeNull();
    expect(activator!.name).toBe('feishu-openclaw-agent');
  });

  it('activator passes snake_case open_id to execFileSync', async () => {
    const { loadConfig } = await import('../src/config/index.js');
    const { createActivator } = await import('../src/activator/index.js');
    const { execFileSync } = await import('child_process');

    const configPath = writeConfig(`
self:
  id: mt
  local_repo_path: /tmp/mt
  remote_repo_url: https://github.com/T0UGH/mt-mailbox.git
activation:
  enabled: true
  activator: feishu-openclaw-agent
  dedupe_mode: filename
  feishu:
    open_id: ou_abc456
    message_template: "FILE: {{filename}}"
`);
    const config = loadConfig(configPath);
    const activator = createActivator(config)!;

    await activator.activate({
      selfId: 'mt',
      filename: 'test-mail.md',
      from: 'hex',
      subject: null,
      message: 'FILE: test-mail.md',
    });

    expect(execFileSync).toHaveBeenCalledTimes(1);
    const argv = (execFileSync as any).mock.calls[0][1];
    expect(argv).toContain('-t');
    expect(argv).toContain('ou_abc456');
  });

  it('activator passes rendered message to execFileSync -m arg', async () => {
    const { loadConfig } = await import('../src/config/index.js');
    const { createActivator } = await import('../src/activator/index.js');
    const { execFileSync } = await import('child_process');

    const configPath = writeConfig(`
self:
  id: mt
  local_repo_path: /tmp/mt
  remote_repo_url: https://github.com/T0UGH/mt-mailbox.git
activation:
  enabled: true
  activator: feishu-openclaw-agent
  dedupe_mode: filename
  feishu:
    open_id: ou_xyz
    message_template: "CUSTOM: {{filename}} from {{from}}"
`);
    const config = loadConfig(configPath);
    const activator = createActivator(config)!;

    await activator.activate({
      selfId: 'mt',
      filename: 'mail.md',
      from: 'boron',
      subject: 'hello',
      message: 'CUSTOM: mail.md from boron',
    });

    const argv = (execFileSync as any).mock.calls[0][1];
    const mIdx = argv.indexOf('-m');
    expect(mIdx).toBeGreaterThan(-1);
    expect(argv[mIdx + 1]).toBe('CUSTOM: mail.md from boron');
  });

  it('loadConfig rejects config missing feishu.open_id (schema validation)', async () => {
    const { loadConfig } = await import('../src/config/index.js');
    const configPath = writeConfig(`
self:
  id: mt
  local_repo_path: /tmp/mt
  remote_repo_url: https://github.com/T0UGH/mt-mailbox.git
activation:
  enabled: true
  activator: feishu-openclaw-agent
  dedupe_mode: filename
  feishu:
    message_template: "hello"
`);
    // Schema validation fails at loadConfig — open_id is required
    expect(() => loadConfig(configPath)).toThrow();
  });
});
