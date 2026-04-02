/**
 * Activation checkpoint store.
 * Persists which mail files have already triggered an activation,
 * preventing duplicate activations on restart/polling.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';

interface ActivatedEntry {
  activatedAt: string;
}

interface ActivationState {
  processed: Record<string, ActivatedEntry>;
}

const DEFAULT_STATE: ActivationState = { processed: {} };

function getStatePath(): string {
  const base = process.env.AGM_CONFIG_DIR ?? join(homedir(), '.config', 'agm');
  return join(base, 'activation-state.json');
}

function loadState(): ActivationState {
  const path = getStatePath();
  if (!existsSync(path)) {
    return DEFAULT_STATE;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as ActivationState;
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(state: ActivationState): void {
  const path = getStatePath();
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(state, null, 2), 'utf-8');
}

export function hasActivated(filename: string): boolean {
  const state = loadState();
  return filename in state.processed;
}

export function markActivated(filename: string): void {
  const state = loadState();
  state.processed[filename] = {
    activatedAt: new Date().toISOString(),
  };
  saveState(state);
}

export function getActivatedFiles(): string[] {
  const state = loadState();
  return Object.keys(state.processed);
}
