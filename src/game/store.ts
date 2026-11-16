/**
 * Interface state. The simulation is the source of truth; this store holds
 * only what the React interface needs to draw, copied out after each tick.
 */
import { create } from 'zustand';
import type { Tone } from './messages';

export interface LogEntry {
  id: number;
  text: string;
  tone: Tone;
}

export interface Floater {
  id: number;
  text: string;
  kind: 'dealt' | 'heavy' | 'taken' | 'healed' | 'parry' | 'block' | 'level';
}

export interface BeltItem {
  itemId: string;
  name: string;
  description: string;
  icon: 'key' | 'flask' | 'coins' | 'short_sword';
  count: number;
  usable: boolean;
}

export interface QuestView {
  title: string;
  description: string;
  completed: boolean;
  objectives: { id: string; text: string; done: boolean; optional: boolean }[];
}

/** Everything the character sheet shows, worked out by the game layer. */
export interface SheetView {
  name: string;
  className: string;
  role: string;
  level: number;
  xp: number;
  /** Experience at which the current level began and the next begins. */
  levelStart: number;
  nextLevel: number;
  attributes: { label: string; value: number; modifier: number; primary: boolean }[];
  health: string;
  stamina: string;
  light: string;
  heavy: string;
  critical: string;
  weapon: string;
}

export interface HudState {
  screen: 'title' | 'playing' | 'journal' | 'sheet' | 'victory' | 'dead';
  heroName: string;
  heroClass: string;
  weaponName: string;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  guarding: boolean;
  level: number;
  /** Progress through the current level, 0 to 1. */
  xpProgress: number;
  sheet: SheetView | null;
  facing: number;
  roomName: string;
  log: LogEntry[];
  target: { name: string; hp: number; maxHp: number; winding: boolean; danger: boolean; boss: boolean } | null;
  belt: BeltItem[];
  quest: QuestView | null;
  floaters: Floater[];
  mapVersion: number;
  hurtPulse: number;
  muted: boolean;
  cleared: boolean;
}

let nextId = 1;

export const useHud = create<HudState>(() => ({
  screen: 'title',
  heroName: '',
  heroClass: '',
  weaponName: '',
  hp: 0,
  maxHp: 1,
  stamina: 0,
  maxStamina: 1,
  guarding: false,
  level: 1,
  xpProgress: 0,
  sheet: null,
  facing: 0,
  roomName: '',
  log: [],
  target: null,
  belt: [],
  quest: null,
  floaters: [],
  mapVersion: 0,
  hurtPulse: 0,
  muted: false,
  cleared: false,
}));

export function pushLog(text: string, tone: Tone) {
  useHud.setState((s) => ({ log: [...s.log.slice(-39), { id: nextId++, text, tone }] }));
}

export function pushFloater(text: string, kind: Floater['kind'], lifeMs = 800) {
  const id = nextId++;
  useHud.setState((s) => ({ floaters: [...s.floaters, { id, text, kind }] }));
  setTimeout(() => useHud.setState((s) => ({ floaters: s.floaters.filter((f) => f.id !== id) })), lifeMs);
}
