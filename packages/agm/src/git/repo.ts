import { git, GitExecError } from './exec.js';

export class GitRepo {
  constructor(private repoPath: string) {}

  private run(args: string[]): string {
    return git(this.repoPath, args).stdout.trim();
  }

  async verify(): Promise<boolean> {
    try {
      this.run(['rev-parse', '--git-dir']);
      return true;
    } catch {
      return false;
    }
  }

  async getHeadSha(): Promise<string> {
    return this.run(['rev-parse', 'HEAD']);
  }

  async getCurrentBranch(): Promise<string> {
    return this.run(['rev-parse', '--abbrev-ref', 'HEAD']);
  }

  async add(file: string): Promise<void> {
    this.run(['add', '--', file]);
  }

  async commit(message: string, file: string): Promise<string> {
    // Commit only the specific file, preserving other changes
    const stdout = this.run(['commit', '-m', message, '--', file]);
    return stdout;
  }

  async push(): Promise<void> {
    try {
      this.run(['push']);
    } catch (e) {
      if (e instanceof GitExecError && e.exitCode === 0) return;
      throw e;
    }
  }

  async pull(): Promise<void> {
    this.run(['pull', '--rebase']);
  }

  async moveFile(from: string, to: string): Promise<void> {
    this.run(['mv', from, to]);
  }

  async diffNames(commitA: string, commitB: string): Promise<string> {
    return this.run(['diff', '--name-status', commitA, commitB]);
  }

  async getRef(ref: string): Promise<string | null> {
    try {
      return this.run(['rev-parse', '--verify', ref]);
    } catch {
      return null;
    }
  }

  async updateRef(ref: string, sha: string): Promise<void> {
    this.run(['update-ref', ref, sha]);
  }

  async getMergedBase(from: string, to: string): Promise<string> {
    return this.run(['merge-base', from, to]);
  }

  async hasRemote(): Promise<boolean> {
    try {
      this.run(['rev-parse', '--verify', 'origin/main']);
      return true;
    } catch {
      return false;
    }
  }
}
