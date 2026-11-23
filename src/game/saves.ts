/**
 * Where saves are kept in the browser. Storage can be missing, full or
 * forbidden (some embedded pages), so every call is guarded and reports
 * failure instead of throwing.
 */
import { readSaveText, serializeSave, type ReadSaveResult, type SaveFile } from '../engine/save';

export type SlotId = 'quick' | 'auto';

const KEY = (slot: SlotId) => `worldforge.save.${slot}`;

export interface SlotSummary {
  slot: SlotId;
  label: string;
  savedAt: number;
}

export function writeSlot(slot: SlotId, save: SaveFile): boolean {
  try {
    window.localStorage.setItem(KEY(slot), serializeSave(save));
    return true;
  } catch {
    return false;
  }
}

export function readSlot(slot: SlotId): ReadSaveResult | null {
  let text: string | null = null;
  try {
    text = window.localStorage.getItem(KEY(slot));
  } catch {
    return null;
  }
  return text ? readSaveText(text) : null;
}

/** A cheap look at a slot, without validating the world inside it. */
export function peekSlot(slot: SlotId): SlotSummary | null {
  try {
    const text = window.localStorage.getItem(KEY(slot));
    if (!text) return null;
    const data = JSON.parse(text) as { label?: unknown; savedAt?: unknown };
    return { slot, label: typeof data.label === 'string' ? data.label : 'Saved game', savedAt: typeof data.savedAt === 'number' ? data.savedAt : 0 };
  } catch {
    return null;
  }
}

/** The most recent save in any slot. */
export function latestSlot(): SlotSummary | null {
  const all = (['quick', 'auto'] as const).map(peekSlot).filter((s): s is SlotSummary => s !== null);
  all.sort((a, b) => b.savedAt - a.savedAt);
  return all[0] ?? null;
}

// ---------------------------------------------------------------------------
// Time away
// ---------------------------------------------------------------------------

const SEEN_KEY = 'worldforge.lastSeen';

function readLastSeen(): number | null {
  try {
    const n = Number(window.localStorage.getItem(SEEN_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** When the game was last open, as it stood when this page loaded. */
const lastSeenAtLoad = typeof window === 'undefined' ? null : readLastSeen();
let awayTaken = false;

/** Note that the game is open now. Called every few seconds while playing, and as the page closes. */
export function touchLastSeen(now = Date.now()) {
  try {
    window.localStorage.setItem(SEEN_KEY, String(now));
  } catch {
    /* time away will be measured from the save instead */
  }
}

/**
 * How long the world was left alone, in world minutes (a second away is a
 * minute of world time): from when the game was last open, or when the save
 * was made if later. Counted once per visit, so loading again in the same
 * sitting does not pass the same time twice.
 */
export function takeAwayMinutes(savedAt: number, now = Date.now()): number {
  if (awayTaken) return 0;
  awayTaken = true;
  const from = Math.max(savedAt, lastSeenAtLoad ?? savedAt);
  return Math.max(0, Math.floor((now - from) / 1000));
}
