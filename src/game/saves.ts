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
