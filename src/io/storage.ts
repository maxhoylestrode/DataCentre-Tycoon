// Browser-side persistence: localStorage for the save and settings, plus
// save file export/import. The save format itself lives in sim/save.ts.

import { CONFIG } from '../config';
import { deserialize, type LoadResult, serialize } from '../sim/save';
import type { GameState } from '../sim/state';

const { storageKey, settingsKey } = CONFIG.save;

export interface Settings {
  autosave: boolean;
  // Whether the how-to guide has been shown once already.
  seenGuide: boolean;
  sound: boolean;
  // 0..1
  volume: number;
  // Whether the scene's lighting follows the time of day.
  dayLighting: boolean;
}

const DEFAULT_SETTINGS: Settings = { autosave: true, seenGuide: false, sound: true, volume: 0.5, dayLighting: true };

// localStorage can throw (private mode, storage full, blocked site data).
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

// null when there is no save yet. A save that fails to load is copied to a
// backup key first, so starting a new game can never destroy it.
export function loadGame(): LoadResult | null {
  const text = read(storageKey);
  if (text === null) return null;
  const result = deserialize(text);
  if (!result.ok) write(`${storageKey}.backup`, text);
  return result;
}

export function saveGame(state: GameState): boolean {
  return write(storageKey, serialize(state));
}

export function loadSettings(): Settings {
  const text = read(settingsKey);
  if (!text) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(text) as Partial<Settings>;
    return {
      autosave: typeof parsed.autosave === 'boolean' ? parsed.autosave : DEFAULT_SETTINGS.autosave,
      seenGuide: parsed.seenGuide === true,
      sound: typeof parsed.sound === 'boolean' ? parsed.sound : DEFAULT_SETTINGS.sound,
      volume:
        typeof parsed.volume === 'number' && parsed.volume >= 0 && parsed.volume <= 1 ? parsed.volume : DEFAULT_SETTINGS.volume,
      dayLighting: typeof parsed.dayLighting === 'boolean' ? parsed.dayLighting : DEFAULT_SETTINGS.dayLighting,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  write(settingsKey, JSON.stringify(settings));
}

export function exportSaveFile(state: GameState): void {
  const blob = new Blob([serialize(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `datacentre-tycoon-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Validates without applying, so the caller can confirm before replacing the game.
export async function readSaveFile(file: File): Promise<LoadResult> {
  try {
    return deserialize(await file.text());
  } catch {
    return { ok: false, error: 'Could not read that file.' };
  }
}
