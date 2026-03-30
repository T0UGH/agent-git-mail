import { describe, it, expect } from 'vitest';
import { parseArgv } from '../src/index.js';

describe('CLI arg parsing', () => {
  it('maps kebab-case flags to camelCase for send', () => {
    const result = parseArgv([
      'send',
      '--from', 'atlas',
      '--to', 'boron',
      '--subject', 'hello',
      '--body-file', '/tmp/body.txt',
      '--expects-reply',
    ]);

    expect(result.subcommand).toBe('send');
    expect(result.argv).toMatchObject({
      from: 'atlas',
      to: 'boron',
      subject: 'hello',
      bodyFile: '/tmp/body.txt',
      expectsReply: true,
    });
  });

  it('captures first positional arg as originalFilename for reply', () => {
    const result = parseArgv([
      'reply',
      'mail-001.md',
      '--from', 'boron',
      '--body-file', '/tmp/reply.txt',
    ]);

    expect(result.subcommand).toBe('reply');
    expect(result.argv).toMatchObject({
      originalFilename: 'mail-001.md',
      from: 'boron',
      bodyFile: '/tmp/reply.txt',
    });
  });

  it('captures first positional arg as filename for read and archive', () => {
    const read = parseArgv(['read', 'mail-002.md', '--agent', 'boron', '--dir', 'inbox']);
    expect(read.argv).toMatchObject({
      filename: 'mail-002.md',
      agent: 'boron',
      dir: 'inbox',
    });

    const archive = parseArgv(['archive', 'mail-003.md', '--agent', 'boron']);
    expect(archive.argv).toMatchObject({
      filename: 'mail-003.md',
      agent: 'boron',
    });
  });
});
