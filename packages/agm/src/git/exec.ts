import { execFileSync, execFile } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

export class GitExecError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = 'GitExecError';
  }
}

export interface GitResult {
  stdout: string;
  stderr: string;
}

export function git(cwd: string, args: string[]): GitResult {
  if (!existsSync(cwd)) {
    throw new GitExecError(`Directory does not exist: ${cwd}`, 1, '');
  }
  try {
    const stdout = execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout: stdout as string, stderr: '' };
  } catch (err: unknown) {
    const e = err as { status?: number; stderr?: string; message?: string };
    const exitCode = e.status ?? 1;
    const stderr = e.stderr ?? '';
    throw new GitExecError(e.message ?? `git ${args.join(' ')} failed`, exitCode, stderr);
  }
}

export async function gitAsync(cwd: string, args: string[]): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, encoding: 'utf-8' }, (err, stdout, stderr) => {
      if (err) {
        const e = err as { code?: number };
        reject(new GitExecError(err.message, e.code ?? 1, stderr));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}
