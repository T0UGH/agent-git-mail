import { describe, it, expect } from 'vitest';
import { parseFrontmatter, serializeFrontmatter, type MessageFrontmatter } from '../src/domain/frontmatter.js';

describe('frontmatter', () => {
  it('parses valid frontmatter block', () => {
    const raw = `---
from: mt
to: hex
subject: Test subject
created_at: 2026-03-29T14:00:00+08:00
reply_to: 2026-03-29T13-00-00-mt-to-hex.md
expects_reply: true
---

Some body text.`;

    const result = parseFrontmatter(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.from).toBe('mt');
      expect(result.data.to).toBe('hex');
      expect(result.data.subject).toBe('Test subject');
      expect(result.data.created_at).toBe('2026-03-29T14:00:00+08:00');
      expect(result.data.reply_to).toBe('2026-03-29T13-00-00-mt-to-hex.md');
      expect(result.data.expects_reply).toBe(true);
      expect(result.body).toBe('Some body text.');
    }
  });

  it('parses frontmatter without optional reply_to', () => {
    const raw = `---
from: mt
to: hex
subject: Hello
created_at: 2026-03-29T14:00:00+08:00
expects_reply: false
---

Body`;

    const result = parseFrontmatter(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.reply_to).toBeUndefined();
      expect(result.data.expects_reply).toBe(false);
    }
  });

  it('rejects missing required fields', () => {
    const raw = `---
from: mt
subject: No to field
created_at: 2026-03-29T14:00:00+08:00
expects_reply: false
---

Body`;

    const result = parseFrontmatter(raw);
    expect(result.ok).toBe(false);
  });

  it('serializes frontmatter to string', () => {
    const fm: MessageFrontmatter = {
      from: 'mt',
      to: 'hex',
      subject: 'Test',
      created_at: '2026-03-29T14:00:00+08:00',
      reply_to: 'original.md',
      expects_reply: true,
    };
    const result = serializeFrontmatter(fm);
    expect(result).toContain('from: mt');
    expect(result).toContain('to: hex');
    expect(result).toContain('subject: Test');
    expect(result).toContain('reply_to: original.md');
    expect(result).toContain('expects_reply: true');
  });
});
