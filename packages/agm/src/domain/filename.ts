import { randomBytes } from 'crypto';

export interface FilenameComponents {
  from: string;
  to: string;
  createdAt: string;
  suffix?: string;
}

export function generateFilename(opts: { from: string; to: string; createdAt: string; suffix?: string }): string {
  const ts = opts.createdAt.replace(/:/g, '-');
  const base = `${ts}-${opts.from}-to-${opts.to}`;
  const withSuffix = opts.suffix ? `${base}-${opts.suffix}` : base;
  return `${withSuffix}.md`;
}

export function generateUniqueSuffix(): string {
  return randomBytes(2).toString('hex').slice(0, 4);
}

export interface ParseFilenameResult {
  from: string;
  to: string;
  createdAt: string;
  suffix?: string;
}

export function parseFilename(filename: string): { ok: true; data: ParseFilenameResult } | { ok: false } {
  // filename format: {ts}-{from}-to-{to}[-{suffix}].md
  // ts format: YYYY-MM-DDTHH-mm-ss+ZZ:zz or similar
  const m = filename.match(/^(.+)-([^-]+)-to-([^-]+)(?:-([a-z0-9]+))?\.md$/);
  if (!m) return { ok: false };
  return {
    ok: true,
    data: {
      createdAt: m[1].replace(/-/g, ':').replace('+', '+'), // restore original
      from: m[2],
      to: m[3],
      suffix: m[4],
    },
  };
}
