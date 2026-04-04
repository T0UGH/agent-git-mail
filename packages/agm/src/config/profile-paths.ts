/**
 * Profile path resolver.
 *
 * Derives all profile-scoped paths from a profile name.
 *
 * Path model:
 *   self repo:    ~/.agm/profiles/<profile>/self
 *   contact cache: ~/.agm/profiles/<profile>/contacts/<contact>
 *   state dir:    ~/.config/agm/state/<profile>/
 */

import { homedir } from 'os';
import { resolve } from 'path';

export function getAgmBaseDir(): string {
  return process.env['AGM_BASE_DIR'] ?? resolve(homedir(), '.agm');
}

export function getStateBaseDir(): string {
  return process.env['AGM_CONFIG_DIR'] ?? resolve(homedir(), '.config', 'agm');
}

/** Self repo path for a profile */
export function getSelfRepoPath(profile: string): string {
  return resolve(getAgmBaseDir(), 'profiles', profile, 'self');
}

/** Contact cache repo path */
export function getContactCachePath(profile: string, contactId: string): string {
  return resolve(getAgmBaseDir(), 'profiles', profile, 'contacts', contactId);
}

/** State directory for a profile */
export function getProfileStateDir(profile: string): string {
  return resolve(getStateBaseDir(), 'state', profile);
}

/** Activation state file for a profile */
export function getActivationStatePath(profile: string): string {
  return resolve(getProfileStateDir(profile), 'activation-state.json');
}

/** Events log file for a profile */
export function getEventsPath(profile: string): string {
  return resolve(getProfileStateDir(profile), 'events.jsonl');
}

/** Session bindings file for a profile */
export function getSessionBindingsPath(profile: string): string {
  return resolve(getProfileStateDir(profile), 'session-bindings.json');
}

/** Daemon stdout log path for a profile */
export function getDaemonStdoutPath(profile: string): string {
  return resolve(getProfileStateDir(profile), 'daemon.stdout.log');
}

/** Daemon stderr log path for a profile */
export function getDaemonStderrPath(profile: string): string {
  return resolve(getProfileStateDir(profile), 'daemon.stderr.log');
}
