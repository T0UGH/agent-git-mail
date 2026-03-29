import { GitRepo } from './repo.js';

const WATERLINE_REF = 'refs/agm/last-seen';

export class GitWaterline {
  constructor(private repo: GitRepo) {}

  async read(): Promise<string | null> {
    return await this.repo.getRef(WATERLINE_REF);
  }

  async write(sha: string): Promise<void> {
    await this.repo.updateRef(WATERLINE_REF, sha);
  }
}
