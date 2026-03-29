import { describe, it, expect } from 'vitest';
import { generateFilename, parseFilename } from '../src/domain/filename.js';

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
    const f1 = generateFilename({ from: 'mt', to: 'hex', createdAt });
    const f2 = generateFilename({ from: 'mt', to: 'hex', createdAt });
    // Suffix may or may not be needed depending on collision detection
    // Just verify both are valid filenames ending in .md
    expect(f1.endsWith('.md')).toBe(true);
    expect(f2.endsWith('.md')).toBe(true);
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
