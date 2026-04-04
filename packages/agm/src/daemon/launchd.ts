/**
 * launchd integration for AGM daemon lifecycle management.
 *
 * Responsibilities:
 * - Generate launchd label / plist path / stdout-stderr paths
 * - Generate plist content for a profile's daemon job
 * - Write plist to ~/Library/LaunchAgents/
 * - launchctl wrappers: start, stop, query
 *
 * What AGM does NOT do:
 * - No pid files as source of truth
 * - No fork/daemonize
 * - No background process management
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'fs';
import { homedir, platform } from 'os';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { getDaemonStdoutPath, getDaemonStderrPath } from '../config/profile-paths.js';

export const LAUNCHD_LABEL_PREFIX = 'ai.agm.daemon.';

/** Generate launchd label for a profile */
export function getLaunchdLabel(profile: string): string {
  return `${LAUNCHD_LABEL_PREFIX}${profile}`;
}

/** Get the plist filename for a profile */
export function getLaunchdPlistFilename(profile: string): string {
  return `${getLaunchdLabel(profile)}.plist`;
}

/** Get the full plist path for a profile */
export function getLaunchdPlistPath(profile: string): string {
  return resolve(homedir(), 'Library', 'LaunchAgents', getLaunchdPlistFilename(profile));
}

/** Get the launchd domain target for the current user (for bootstrap) */
export function getLaunchdDomainTarget(): string {
  const uid = execSync('id -u', { encoding: 'utf-8' }).trim();
  return `gui/${uid}`;
}

/** Get the launchd service target for a profile (for kickstart/bootout/list) */
export function getLaunchdServiceTarget(profile: string): string {
  const uid = execSync('id -u', { encoding: 'utf-8' }).trim();
  return `gui/${uid}/${getLaunchdLabel(profile)}`;
}

/** Resolve the actual agm entry point path (handles symlinks) */
function resolveAgmExecutable(): string {
  try {
    return realpathSync(process.argv[1]);
  } catch {
    // Fallback: resolve relative to this file's location
    const selfPath = fileURLToPath(import.meta.url);
    return resolve(selfPath, '..', '..', 'dist', 'index.js');
  }
}

export interface LaunchdJobState {
  /** 'running' | 'stopped' | 'not-installed' | 'error' */
  state: 'running' | 'stopped' | 'not-installed' | 'error';
  pid?: number;
  label: string;
  plistPath: string;
  stdoutPath: string;
  stderrPath: string;
  error?: string;
}

/** Query launchd job status for a profile */
export function queryLaunchdJob(profile: string): LaunchdJobState {
  const label = getLaunchdLabel(profile);
  const plistPath = getLaunchdPlistPath(profile);
  const stdoutPath = getDaemonStdoutPath(profile);
  const stderrPath = getDaemonStderrPath(profile);

  if (!existsSync(plistPath)) {
    return { state: 'not-installed', label, plistPath, stdoutPath, stderrPath };
  }

  try {
    const output = execSync(`launchctl list "${label}" 2>&1`, { encoding: 'utf-8' });
    // Output looks like:
    // {
    //   "Label" = "ai.agm.daemon.mt";
    //   "Pid" = 12345;
    //   ...
    // }
    const pidMatch = output.match(/"Pid"\s*=\s*(\d+)/);
    const pid = pidMatch ? parseInt(pidMatch[1], 10) : undefined;
    return {
      state: pid !== undefined ? 'running' : 'stopped',
      pid,
      label,
      plistPath,
      stdoutPath,
      stderrPath,
    };
  } catch (e) {
    // exit code != 0 means job not found in launchd
    const msg = e instanceof Error ? e.message : String(e);
    // If the error mentions the label not found, it's not-installed
    if (msg.includes('not found') || msg.includes('No such process')) {
      return { state: 'not-installed', label, plistPath, stdoutPath, stderrPath };
    }
    return {
      state: 'error',
      label,
      plistPath,
      stdoutPath,
      stderrPath,
      error: msg,
    };
  }
}

/** Generate plist content object for a profile's daemon */
export function generateLaunchdPlist(profile: string): Record<string, unknown> {
  const label = getLaunchdLabel(profile);
  const stdoutPath = getDaemonStdoutPath(profile);
  const stderrPath = getDaemonStderrPath(profile);
  const agmBin = resolveAgmExecutable();

  return {
    Label: label,
    // Direct argument array: no shell wrapping, no manual >> redirection.
    // launchd handles stdout/stderr via StandardOutPath/StandardErrorPath.
    ProgramArguments: [
      'node',
      agmBin,
      'daemon',
      'run',
      '--profile',
      profile,
    ],
    RunAtLoad: true,
    KeepAlive: {
      SuccessfulExit: false,
    },
    StandardOutPath: stdoutPath,
    StandardErrorPath: stderrPath,
    WorkingDirectory: homedir(),
    EnvironmentVariables: {
      HOME: homedir(),
      PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    },
  };
}

/** Write the plist file for a profile (creates LaunchAgents dir if needed) */
export function writeLaunchdPlist(profile: string): void {
  const plistPath = getLaunchdPlistPath(profile);
  const plist = generateLaunchdPlist(profile);

  // Ensure ~/Library/LaunchAgents/ exists
  const launchAgentsDir = resolve(homedir(), 'Library', 'LaunchAgents');
  if (!existsSync(launchAgentsDir)) {
    mkdirSync(launchAgentsDir, { recursive: true });
  }

  // Ensure state dir exists for stdout/stderr
  const stateDir = resolve(homedir(), '.config', 'agm', 'state', profile);
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }

  // Write plist as XML (node-plist alternative: use defaults write format)
  // We'll generate a simple XML plist manually to avoid extra dependency
  const plistXml = buildPlistXml(plist);
  writeFileSync(plistPath, plistXml, 'utf-8');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPlistXml(plist: Record<string, unknown>): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
  ];

  for (const [key, value] of Object.entries(plist)) {
    lines.push(`<key>${escapeXml(key)}</key>`);
    lines.push(valueToPlist(value));
  }

  lines.push('</dict>');
  lines.push('</plist>');
  return lines.join('\n');
}

function valueToPlist(value: unknown): string {
  if (value === null || value === undefined) {
    return '<string></string>';
  }
  if (typeof value === 'boolean') {
    return value ? '<true/>' : '<false/>';
  }
  if (typeof value === 'number') {
    return `<real>${value}</real>`;
  }
  if (typeof value === 'string') {
    return `<string>${escapeXml(value)}</string>`;
  }
  if (Array.isArray(value)) {
    const items = value.map(v => `    ${valueToPlist(v)}`).join('\n');
    return `<array>\n${items}\n  </array>`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    const inner = entries.map(([k, v]) => {
      return `  <key>${escapeXml(k)}</key>\n  ${valueToPlist(v)}`;
    }).join('\n');
    return `<dict>\n${inner}\n</dict>`;
  }
  return `<string>${escapeXml(String(value))}<\/string>`;
}

/** Install or update the launchd plist for a profile */
export function installOrUpdateLaunchdJob(profile: string): void {
  writeLaunchdPlist(profile);
}

/** Start the launchd job for a profile */
export function startLaunchdJob(profile: string): void {
  const plistPath = getLaunchdPlistPath(profile);

  // First, ensure plist is written
  installOrUpdateLaunchdJob(profile);

  // Check if already running
  const current = queryLaunchdJob(profile);
  if (current.state === 'running') {
    throw new Error(`daemon is already running (pid ${current.pid})`);
  }

  // Bootstrap: domain target (gui/<uid>) + plist path
  // kickstart/bootout: service target (gui/<uid>/<label>)
  try {
    execSync(`launchctl bootstrap "${getLaunchdDomainTarget()}" "${plistPath}" 2>&1`, { stdio: 'pipe' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('already loaded') || msg.includes('Incompatible processstate')) {
      // Already loaded — use kickstart to restart it
      execSync(`launchctl kickstart -k "${getLaunchdServiceTarget(profile)}" 2>&1`, { stdio: 'pipe' });
    } else {
      throw new Error(`launchctl bootstrap failed: ${msg}`);
    }
  }
}

/** Stop the launchd job for a profile */
export function stopLaunchdJob(profile: string): { stopped: boolean; reason: string } {
  const current = queryLaunchdJob(profile);
  if (current.state === 'not-installed') {
    return { stopped: true, reason: 'not installed' };
  }
  if (current.state !== 'running') {
    return { stopped: true, reason: 'already stopped' };
  }

  try {
    execSync(`launchctl bootout "${getLaunchdServiceTarget(profile)}" 2>&1`, { stdio: 'pipe' });
    return { stopped: true, reason: 'stopped' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('No such process') || msg.includes('not found')) {
      return { stopped: true, reason: 'already stopped' };
    }
    return { stopped: false, reason: `launchctl bootout failed: ${msg}` };
  }
}

/** Check if we're on macOS */
export function isMacOS(): boolean {
  return platform() === 'darwin';
}
