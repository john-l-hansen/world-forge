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
  kind: 'dealt' | 'heavy' | 'spell' | 'taken' | 'healed' | 'parry' | 'block' | 'level' | 'ally';
  /** For a companion's blow: their place in the party, so numbers do not pile up. */
  slot?: number;
}

export interface BeltItem {
  itemId: string;
  name: string;
  description: string;
  icon: 'key' | 'flask' | 'coins' | 'short_sword' | 'dagger' | 'staff' | 'mace' | 'shield' | 'jerkin' | 'helm' | 'scroll';
  count: number;
  /** What clicking it does, if anything. */
  action: 'drink' | 'read' | 'equip' | null;
}

export interface QuestView {
  id: string;
  /** Main quests win the adventure; side quests are extra. */
  main: boolean;
  title: string;
  description: string;
  completed: boolean;
  objectives: { id: string; text: string; done: boolean; optional: boolean }[];
}

/** One character in the party panel. */
export interface PartyView {
  id: string;
  name: string;
  className: string;
  portrait: 'fighter' | 'rogue' | 'mage' | 'cleric';
  level: number;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  mana: number;
  maxMana: number;
  row: 'front' | 'back';
  /** The character the player is driving. */
  active: boolean;
  guarding: boolean;
  /** What they are in the middle of, for the panel to show. */
  busy: 'attack' | 'cast' | null;
  /** Counts blows taken and healing received; a change replays the flash. */
  hurt: number;
  mended: number;
}

/** A spell the driven character can cast, with its number key. */
export interface SpellView {
  id: string;
  name: string;
  description: string;
  cost: number;
  /** Enough mana to cast it right now. */
  ready: boolean;
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
  /** Empty for a character with no mana. */
  mana: string;
  row: 'front' | 'back';
  /** False when the character adventures alone and rows mean nothing. */
  canChangeRow: boolean;
  spells: string[];
  light: string;
  heavy: string;
  critical: string;
  weapon: string;
  defence: number;
  /** One row per equipment slot that holds something. */
  equipment: { slot: string; label: string; itemId: string; name: string; detail: string }[];
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
  /** Every character, in party order. One entry for a lone adventurer. */
  party: PartyView[];
  spells: SpellView[];
  facing: number;
  roomName: string;
  log: LogEntry[];
  target: { name: string; hp: number; maxHp: number; winding: boolean; danger: boolean; boss: boolean } | null;
  belt: BeltItem[];
  /** The quest the adventure is about: the first main quest held. */
  quest: QuestView | null;
  /** Every quest held, main quests first. */
  quests: QuestView[];
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
  party: [],
  spells: [],
  facing: 0,
  roomName: '',
  log: [],
  target: null,
  belt: [],
  quest: null,
  quests: [],
  floaters: [],
  mapVersion: 0,
  hurtPulse: 0,
  muted: false,
  cleared: false,
}));

export function pushLog(text: string, tone: Tone) {
  useHud.setState((s) => ({ log: [...s.log.slice(-39), { id: nextId++, text, tone }] }));
}

export function pushFloater(text: string, kind: Floater['kind'], lifeMs = 800, slot?: number) {
  const id = nextId++;
  useHud.setState((s) => ({ floaters: [...s.floaters, { id, text, kind, slot }] }));
  setTimeout(() => useHud.setState((s) => ({ floaters: s.floaters.filter((f) => f.id !== id) })), lifeMs);
}
