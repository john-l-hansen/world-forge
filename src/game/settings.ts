/**
 * How the player likes the game shown. These are presentation choices only:
 * they never reach the simulation and are not part of a save. Kept in the
 * browser when it allows; otherwise they last for the visit.
 */
import type { GoreLevel } from '../renderer/stains';

export interface DisplaySettings {
  /** Full: sprays, pools and bodies torn apart. Low: dark stains and plain deaths. */
  gore: GoreLevel;
  /** Floating damage and healing numbers over the view. Off by default: wounds show on bodies and in the log. */
  numbers: boolean;
}

const KEY = 'worldforge.settings';
export const DEFAULT_SETTINGS: DisplaySettings = { gore: 'full', numbers: false };

let current: DisplaySettings | null = null;

export function getSettings(): DisplaySettings {
  if (current) return current;
  current = { ...DEFAULT_SETTINGS };
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Partial<DisplaySettings>;
    if (saved.gore === 'full' || saved.gore === 'low') current.gore = saved.gore;
    if (typeof saved.numbers === 'boolean') current.numbers = saved.numbers;
  } catch {
    /* defaults it is */
  }
  return current;
}

export function updateSettings(change: Partial<DisplaySettings>): DisplaySettings {
  current = { ...getSettings(), ...change };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* kept for this visit only */
  }
  return current;
}
