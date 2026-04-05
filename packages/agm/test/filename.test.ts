import { describe, it, expect } from 'vitest';
import { generateFilename, parseFilename, generateUniqueSuffix } from '../src/domain/filename.js';

describe('filename', () => {
  it('generates readable timestamp filename', () => {
    const createdAt = '2026-03-29T14-00-00+08:00';
    const filename = generateFilename({ from: 'mt', to: 'hex', createdAt });
    expect(filename).toMatch(/^2026-03-29T14-00-00\+08-00-mt-to-hex(\-[a-z0-9]+)?\.md$/);
    expect(filename.endsWith('.md')).toBe(true);
  });

  it('includes from and to in filename', () => {
    const createdAt = '2026-03-29T14-00-00+08:00';
    const filename = generateFilename({ from: 'alice', to: 'bob', createdAt });
    expect(filename).toContain('alice');
    expect(filename).toContain('bob');
    expect(filename).toContain('to');
  });

  it('generates unique filenames for same timestamp with suffix', () => {
    const createdAt = '2026-03-29T14-00-00+08:00';
    const f1 = generateFilename({ from: 'mt', to: 'hex', createdAt, suffix: generateUniqueSuffix() });
    const f2 = generateFilename({ from: 'mt', to: 'hex', createdAt, suffix: generateUniqueSuffix() });
    // Suffix must produce different filenames for the same timestamp
    expect(f1).not.toBe(f2);
    expect(f1.endsWith('.md')).toBe(true);
    expect(f2.endsWith('.md')).toBe(true);
  });

  it('generateUniqueSuffix produces 8 hex characters (4 bytes)', () => {
    const suffix = generateUniqueSuffix();
    // 4 random bytes = 8 hex characters
    expect(suffix).toMatch(/^[a-f0-9]{8}$/);
  });

  it('generateUniqueSuffix has negligible collision probability (4 bytes)', () => {
    // With 4 bytes (8 hex chars), collision probability is ~1/4B per pair
    // Generate 1000 suffixes and verify all unique
    const suffixes = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      suffixes.add(generateUniqueSuffix());
    }
    expect(suffixes.size).toBe(1000);
  });

  it('parses filename back to components', () => {
    const createdAt = '2026-03-29T14-00-00+08:00';
    const filename = generateFilename({ from: 'mt', to: 'hex', createdAt });
    const parsed = parseFilename(filename);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.from).toBe('mt');
      expect(parsed.data.to).toBe('hex');
    }
  });
});
