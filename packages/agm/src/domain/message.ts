import type { MessageFrontmatter } from './frontmatter.js';

export interface Message extends MessageFrontmatter {
  filename: string;
  body: string;
}

export function makeMessage(
  fm: MessageFrontmatter,
  filename: string,
  body: string,
): Message {
  return { ...fm, filename, body };
}
