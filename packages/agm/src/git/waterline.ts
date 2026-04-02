import { GitRepo } from './repo.js';

const DEFAULT_WATERLINE_REF = 'refs/agm/last-seen';

export class GitWaterline {
  constructor(
    private repo: GitRepo,
    private refName: string = DEFAULT_WATERLINE_REF,
  ) {}

  async read(): Promise<string | null> {
    return await this.repo.getRef(this.refName);
  }

  async write(sha: string): Promise<void> {
    await this.repo.updateRef(this.refName, sha);
  }
}
