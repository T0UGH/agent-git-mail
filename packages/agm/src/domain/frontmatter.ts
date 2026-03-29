import { z } from 'zod';

export const MessageFrontmatterSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  subject: z.string().min(1),
  created_at: z.string(),
  reply_to: z.string().optional(),
  expects_reply: z.boolean(),
});

export type MessageFrontmatter = z.infer<typeof MessageFrontmatterSchema>;

export interface ParsedMessage {
  data: MessageFrontmatter;
  body: string;
}

export function parseFrontmatter(raw: string): { ok: true; data: MessageFrontmatter; body: string } | { ok: false; error: unknown } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { ok: false, error: new Error('Invalid frontmatter format') };
  }
  try {
    const [, yamlBlock, body] = match;
    const yamlLines = yamlBlock.split('\n');
    const obj: Record<string, unknown> = {};
    for (const line of yamlLines) {
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      // Parse booleans and numbers
      if (value === 'true') obj[key] = true;
      else if (value === 'false') obj[key] = false;
      else if (!isNaN(Number(value)) && value !== '') obj[key] = Number(value);
      else obj[key] = value;
    }
    const data = MessageFrontmatterSchema.parse(obj);
    return { ok: true, data, body: body.trim() };
  } catch (e) {
    return { ok: false, error: e };
  }
}

export function serializeFrontmatter(data: MessageFrontmatter): string {
  const lines: string[] = ['---'];
  lines.push(`from: ${data.from}`);
  lines.push(`to: ${data.to}`);
  lines.push(`subject: ${data.subject}`);
  lines.push(`created_at: ${data.created_at}`);
  if (data.reply_to) {
    lines.push(`reply_to: ${data.reply_to}`);
  }
  lines.push(`expects_reply: ${data.expects_reply}`);
  lines.push('---');
  return lines.join('\n');
}
