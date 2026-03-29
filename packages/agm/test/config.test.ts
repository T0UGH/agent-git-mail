import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Schema under test
const ConfigSchema = z.object({
  agents: z.record(z.object({
    repo_path: z.string(),
  })),
  runtime: z.object({
    poll_interval_seconds: z.number().optional().default(30),
  }).optional().default({}),
});

describe('config schema', () => {
  it('accepts valid config with agents and repo_path', () => {
    const config = {
      agents: {
        mt: { repo_path: '/path/to/mt' },
        hex: { repo_path: '/path/to/hex' },
      },
      runtime: { poll_interval_seconds: 30 },
    };
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('accepts config without runtime section', () => {
    const config = {
      agents: {
        mt: { repo_path: '/path/to/mt' },
      },
    };
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.runtime.poll_interval_seconds).toBe(30);
    }
  });

  it('rejects missing agents', () => {
    const config = { runtime: { poll_interval_seconds: 30 } };
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('rejects agent without repo_path', () => {
    const config = {
      agents: {
        mt: { not_repo_path: '/wrong' },
      },
    };
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});
