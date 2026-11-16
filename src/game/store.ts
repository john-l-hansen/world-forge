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
  kind: 'dealt' | 'heavy' | 'taken' | 'healed' | 'parry' | 'block';
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

export interface HudState {
  screen: 'title' | 'playing' | 'journal' | 'victory' | 'dead';
  heroName: string;
  heroClass: string;
  weaponName: string;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  guarding: boolean;
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

export function pushFloater(text: string, kind: Floater['kind']) {
  const id = nextId++;
  useHud.setState((s) => ({ floaters: [...s.floaters, { id, text, kind }] }));
  setTimeout(() => useHud.setState((s) => ({ floaters: s.floaters.filter((f) => f.id !== id) })), 800);
}
