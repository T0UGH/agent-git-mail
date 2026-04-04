/**
 * Activation checkpoint store.
 * Persists which mail files have already triggered an activation,
 * preventing duplicate activations on restart/polling.
 *
 * Path model (V3): ~/.config/agm/state/<profile>/activation-state.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { getActivationStatePath } from '../config/profile-paths.js';

interface ActivatedEntry {
  activatedAt: string;
}

interface ActivationState {
  processed: Record<string, ActivatedEntry>;
}

const DEFAULT_STATE: ActivationState = { processed: {} };

function loadState(profile: string): ActivationState {
  const path = getActivationStatePath(profile);
  if (!existsSync(path)) {
    return DEFAULT_STATE;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as ActivationState;
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(state: ActivationState, profile: string): void {
  const path = getActivationStatePath(profile);
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(state, null, 2), 'utf-8');
}

export function hasActivated(selfId: string, filename: string, profile: string): boolean {
  const state = loadState(profile);
  const key = `${selfId}::${filename}`;
  return key in state.processed;
}

export function markActivated(selfId: string, filename: string, profile: string): void {
  const state = loadState(profile);
  const key = `${selfId}::${filename}`;
  state.processed[key] = {
    activatedAt: new Date().toISOString(),
  };
  saveState(state, profile);
}

export function getActivatedFiles(profile: string): string[] {
  const state = loadState(profile);
  return Object.keys(state.processed);
}
