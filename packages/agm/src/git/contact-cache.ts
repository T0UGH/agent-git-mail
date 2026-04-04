/**
 * Contact Cache Manager.
 *
 * Manages local git clones of contact remote repos.
 * Each profile's contact cache lives at:
 *   ~/.agm/profiles/<profile>/contacts/<contact>
 *
 * Responsibilities:
 * - Clone contact remote on first access (ensureContactCache)
 * - Fetch/pull on subsequent access (refreshContactCache)
 * - Validate remote URL matches config (origin mismatch → error)
 * - Return clear errors when remote is unreachable
 */

import { existsSync, mkdirSync } from 'fs';
import { git } from './exec.js';
import { GitRepo } from './repo.js';
import { getContactCachePath } from '../config/profile-paths.js';

export interface EnsureContactCacheOptions {
  profile: string;
  contactId: string;
  remoteRepoUrl: string;
}

export interface RefreshContactCacheOptions {
  profile: string;
  contactId: string;
  remoteRepoUrl: string;
}

export class ContactCacheError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'ContactCacheError';
  }
}

/**
 * Ensure a local clone of the contact's remote repo exists.
 * If the cache directory doesn't exist, clone the remote.
 * If it exists but origin URL doesn't match, throw OriginMismatchError.
 * If it's not a git repo, throw CorruptionError.
 */
export async function ensureContactCache(opts: EnsureContactCacheOptions): Promise<string> {
  const cachePath = getContactCachePath(opts.profile, opts.contactId);

  if (!existsSync(cachePath)) {
    // First access: clone the remote repo
    await cloneContactRepo(cachePath, opts.remoteRepoUrl);
    return cachePath;
  }

  // Cache exists: verify it's a valid git repo
  const repo = new GitRepo(cachePath);
  const valid = await repo.verify();
  if (!valid) {
    throw new ContactCacheError(
      `Contact cache at ${cachePath} is not a valid git repository. Remove it and try again.`,
      'CACHE_CORRUPTED'
    );
  }

  // Verify origin URL matches
  const existingUrl = await repo.getRemoteUrl('origin');
  if (existingUrl && existingUrl.trim() !== opts.remoteRepoUrl.trim()) {
    throw new ContactCacheError(
      `Origin URL mismatch for contact ${opts.contactId}.\n` +
      `  Config:    ${opts.remoteRepoUrl}\n` +
      `  Cache at:  ${existingUrl}\n` +
      `Remove the cache at ${cachePath} to resolve.`,
      'ORIGIN_MISMATCH'
    );
  }

  return cachePath;
}

/**
 * Refresh the local clone of a contact's remote repo.
 * Performs git fetch to update remote tracking branches.
 * Throws if cache doesn't exist.
 */
export async function refreshContactCache(opts: RefreshContactCacheOptions): Promise<string> {
  const cachePath = getContactCachePath(opts.profile, opts.contactId);

  if (!existsSync(cachePath)) {
    // Not yet cached: delegate to ensureContactCache
    return ensureContactCache(opts);
  }

  // Verify origin URL matches
  const repo = new GitRepo(cachePath);
  const valid = await repo.verify();
  if (!valid) {
    throw new ContactCacheError(
      `Contact cache at ${cachePath} is not a valid git repository.`,
      'CACHE_CORRUPTED'
    );
  }

  const existingUrl = await repo.getRemoteUrl('origin');
  if (existingUrl && existingUrl.trim() !== opts.remoteRepoUrl.trim()) {
    throw new ContactCacheError(
      `Origin URL mismatch for contact ${opts.contactId}.\n` +
      `  Config:    ${opts.remoteRepoUrl}\n` +
      `  Cache at:  ${existingUrl}`,
      'ORIGIN_MISMATCH'
    );
  }

  // Fetch latest from all remotes
  try {
    await repo.fetchRemote('origin');
  } catch (e) {
    if (e instanceof Error) {
      throw new ContactCacheError(
        `Failed to fetch from ${opts.remoteRepoUrl}: ${e.message}`,
        'FETCH_FAILED'
      );
    }
    throw e;
  }

  return cachePath;
}

/**
 * Clone a contact's remote repo to the local cache path.
 */
async function cloneContactRepo(cachePath: string, remoteUrl: string): Promise<void> {
  // Ensure parent directory exists
  mkdirSync(cachePath, { recursive: true });

  try {
    git(cachePath, ['clone', '--origin', 'origin', remoteUrl, '.']);
  } catch (e) {
    if (e instanceof Error) {
      throw new ContactCacheError(
        `Failed to clone ${remoteUrl}: ${e.message}`,
        'CLONE_FAILED'
      );
    }
    throw e;
  }
}
