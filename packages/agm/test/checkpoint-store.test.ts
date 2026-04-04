/**
 * Tests for the activation checkpoint store.
 * Verifies dedupe behavior: hasActivated / markActivated, selfId scoping, filename scoping.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('checkpoint store', () => {
  // Each test gets its own unique tmp dir + config dir
  const baseTmp = mkdtempSync(join(tmpdir(), 'agm-checkpoint-'));
  const TEST_PROFILE = 'test';

  beforeEach(() => {
    // Reset modules to clear any cached state from previous tests
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  afterAll(() => {
    rmSync(baseTmp, { recursive: true, force: true });
  });

  it('hasActivated returns false for unseen filename', async () => {
    const configDir = join(baseTmp, `test-${Date.now()}`);
    process.env.AGM_CONFIG_DIR = configDir;
    const { hasActivated } = await import('../src/activator/checkpoint-store.js');
    expect(hasActivated('mt', 'unknown-file.md', TEST_PROFILE)).toBe(false);
  });

  it('hasActivated returns true after markActivated', async () => {
    const configDir = join(baseTmp, `test-${Date.now()}`);
    process.env.AGM_CONFIG_DIR = configDir;
    const { hasActivated, markActivated } = await import('../src/activator/checkpoint-store.js');
    markActivated('mt', 'mail-1.md', TEST_PROFILE);
    expect(hasActivated('mt', 'mail-1.md', TEST_PROFILE)).toBe(true);
  });

  it('hasActivated is scoped to selfId (different agents do not share state)', async () => {
    const configDir = join(baseTmp, `test-${Date.now()}`);
    process.env.AGM_CONFIG_DIR = configDir;
    const { hasActivated, markActivated } = await import('../src/activator/checkpoint-store.js');
    markActivated('mt', 'mail-1.md', TEST_PROFILE);
    expect(hasActivated('hex', 'mail-1.md', TEST_PROFILE)).toBe(false);
  });

  it('hasActivated is scoped to filename (different files do not collide)', async () => {
    const configDir = join(baseTmp, `test-${Date.now()}`);
    process.env.AGM_CONFIG_DIR = configDir;
    const { hasActivated, markActivated } = await import('../src/activator/checkpoint-store.js');
    markActivated('mt', 'mail-a.md', TEST_PROFILE);
    expect(hasActivated('mt', 'mail-b.md', TEST_PROFILE)).toBe(false);
  });

  it('getActivatedFiles returns all activated keys', async () => {
    const configDir = join(baseTmp, `test-${Date.now()}`);
    process.env.AGM_CONFIG_DIR = configDir;
    const { hasActivated, markActivated, getActivatedFiles } = await import('../src/activator/checkpoint-store.js');
    markActivated('mt', 'mail-1.md', TEST_PROFILE);
    markActivated('mt', 'mail-2.md', TEST_PROFILE);
    markActivated('hex', 'mail-3.md', TEST_PROFILE);
    const files = getActivatedFiles(TEST_PROFILE);
    expect(files).toContain('mt::mail-1.md');
    expect(files).toContain('mt::mail-2.md');
    expect(files).toContain('hex::mail-3.md');
    expect(files).toHaveLength(3);
  });

  it('multiple markActivated calls for same key are idempotent', async () => {
    const configDir = join(baseTmp, `test-${Date.now()}`);
    process.env.AGM_CONFIG_DIR = configDir;
    const { hasActivated, markActivated, getActivatedFiles } = await import('../src/activator/checkpoint-store.js');
    markActivated('mt', 'mail-1.md', TEST_PROFILE);
    markActivated('mt', 'mail-1.md', TEST_PROFILE);
    markActivated('mt', 'mail-1.md', TEST_PROFILE);
    expect(hasActivated('mt', 'mail-1.md', TEST_PROFILE)).toBe(true);
    expect(getActivatedFiles(TEST_PROFILE)).toHaveLength(1);
  });

  it('activatedAt timestamp is ISO string', async () => {
    const configDir = join(baseTmp, `test-${Date.now()}`);
    process.env.AGM_CONFIG_DIR = configDir;
    const { markActivated, getActivatedFiles } = await import('../src/activator/checkpoint-store.js');
    markActivated('mt', 'mail-1.md', TEST_PROFILE);
    expect(getActivatedFiles(TEST_PROFILE)).toContain('mt::mail-1.md');
    const state = JSON.parse(readFileSync(join(configDir, 'state', TEST_PROFILE, 'activation-state.json'), 'utf-8'));
    expect(state.processed['mt::mail-1.md'].activatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});