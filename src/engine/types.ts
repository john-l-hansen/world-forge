/**
 * Simulation types. Everything here is plain JSON-serializable data, so a
 * session can be saved, hashed, replayed or (later) sent to another player.
 */

import type { EquipSlot } from '../schema/world';
import type { Attributes, ClassId } from './classes';

export const TICKS_PER_SECOND = 60;
export const MOVE_TICKS = 14;
export const TURN_TICKS = 10;
export const BUMP_TICKS = 10;
export const INPUT_BUFFER_TICKS = 18;
export const HIT_STOP_TICKS = 4;
export const ENEMY_ATTACK_POSE_TICKS = 12;

/** One point of stamina returns every this many ticks (12 a second). */
export const STAMINA_REGEN_INTERVAL = 5;
/** Stamina does not return for this long after it is spent. */
export const STAMINA_REGEN_DELAY = 30;
/** A block raised no more than this many ticks before the blow is a parry. */
export const PARRY_WINDOW_TICKS = 9;
/** A blocked blow does this share of its damage. */
export const BLOCK_DAMAGE_SHARE = 0.3;
export const BLOCK_STAMINA_COST = 10;
/** A blow that breaks a tired guard does this share of its damage. */
export const GUARD_BREAK_DAMAGE_SHARE = 0.7;
export const PARRY_STAGGER_TICKS = 60;
export const DODGE_TICKS = 7;
export const DODGE_STAMINA_COST = 10;
/** The party cannot be hit for this long after a dodge begins. */
export const DODGE_INVULNERABLE_TICKS = 12;
export const DODGE_COOLDOWN_TICKS = 24;

export type AttackKind = 'light' | 'heavy';

export type MoveDir = 'forward' | 'back' | 'left' | 'right';

/**
 * The only way anything outside the simulation can change it. Every command
 * names the character acting, so a controller can be a local player today
 * and party AI or a remote player later.
 */
export type Command =
  | { type: 'move'; actor: string; dir: MoveDir }
  | { type: 'turn'; actor: string; dir: 'left' | 'right' }
  | { type: 'attack'; actor: string; kind?: AttackKind }
  /** Raise (held: true) or lower the guard. Takes effect at once. */
  | { type: 'block'; actor: string; held: boolean }
  /** A quick step, backward unless a direction is given. */
  | { type: 'dodge'; actor: string; dir?: MoveDir }
  | { type: 'interact'; actor: string }
  | { type: 'use'; actor: string; itemId: string }
  /** Wear or wield an item from the pack. What it replaces goes back in. */
  | { type: 'equip'; actor: string; itemId: string }
  | { type: 'unequip'; actor: string; slot: EquipSlot };

export type Controller = 'local' | 'ai' | 'remote';

export type MemberAction =
  | { kind: 'idle' }
  | { kind: 'attack'; attack: AttackKind; start: number; hitTick: number; end: number; resolved: boolean }
  | { kind: 'cast'; spellId: string; start: number; hitTick: number; end: number; resolved: boolean };

export interface PartyMember {
  /** Character ID from the world definition. */
  id: string;
  controller: Controller;
  classId: ClassId;
  level: number;
  /** Total experience earned. */
  xp: number;
  /** A copy of the character's attributes. These grow as levels are gained. */
  attributes: Attributes;
  /** What is worn and held right now: slot to item ID. */
  equipment: Partial<Record<EquipSlot, string>>;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  /** Tick from which stamina starts to return. */
  staminaRegenFrom: number;
  /** The player is holding the guard up. It only counts while not attacking. */
  blocking: boolean;
  /** Tick the guard last became effective, which decides block or parry. */
  blockStart: number;
  action: MemberAction;
}

export interface PartyState {
  x: number;
  y: number;
  facing: number;
  prevX: number;
  prevY: number;
  /** Tick the current step began, or -1000 when never moved. */
  moveStart: number;
  /** How long the current step takes: a walk or a quicker dodge. */
  moveTicks: number;
  /** The party cannot be hit before this tick (set by a dodge). */
  invulnerableUntil: number;
  dodgeReadyAt: number;
  prevFacing: number;
  turnStart: number;
  bumpStart: number;
  bumpDir: number;
  members: PartyMember[];
}

export type EnemyAiState = 'idle' | 'move' | 'telegraph' | 'attack' | 'recover' | 'stagger' | 'dead';

export interface EnemyState {
  id: string;
  defId: string;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  moveStart: number;
  facing: number;
  hp: number;
  maxHp: number;
  ai: EnemyAiState;
  aiStart: number;
  aiEnd: number;
  /** The cell a telegraphed blow will land on. */
  targetX: number;
  targetY: number;
  /** Which of its attacks the enemy is winding up or has just used. */
  attackId: string;
  alerted: boolean;
  lastHitTick: number;
}

export interface QuestProgress {
  /** Objective ID to done flag. */
  done: Record<string, boolean>;
  completed: boolean;
}

export interface SessionState {
  stateVersion: 6;
  worldId: string;
  tick: number;
  rng: number;
  hitStop: number;
  status: 'playing' | 'dead';
  party: PartyState;
  buffered: { command: Command; tick: number } | null;
  enemies: EnemyState[];
  /** Door ID to open flag. Archways are always true. */
  doorsOpen: Record<string, boolean>;
  /** Locked doors the party has unlocked. */
  doorsUnlocked: Record<string, boolean>;
  chestsOpened: Record<string, boolean>;
  pickupsTaken: Record<string, boolean>;
  /** Items the party carries, shared by all members: item ID to count. */
  inventory: Record<string, number>;
  /** Quests the party holds, by quest ID. */
  quests: Record<string, QuestProgress>;
  /** Encounters whose enemies have noticed the party. */
  encountersStarted: string[];
  /** 1 for every cell the party has seen up close. */
  explored: number[];
  currentRoomId: string | null;
  visitedRoomIds: string[];
}

export type BumpReason = 'wall' | 'door' | 'enemy' | 'object';

export type GameEvent =
  | { type: 'party.moved'; x: number; y: number }
  | { type: 'party.turned'; facing: number }
  | { type: 'party.bumped'; reason: BumpReason }
  | { type: 'room.entered'; roomId: string; firstVisit: boolean }
  | { type: 'door.opened'; doorId: string }
  | { type: 'door.closed'; doorId: string }
  | { type: 'door.locked'; doorId: string }
  | { type: 'door.unlocked'; doorId: string; itemId: string }
  | { type: 'secret.found'; doorId: string }
  | { type: 'chest.opened'; objectId: string }
  | { type: 'item.gained'; itemId: string; from: 'pickup' | 'chest' }
  | { type: 'item.equipped'; actor: string; itemId: string; slot: EquipSlot; auto: boolean }
  | { type: 'item.unequipped'; actor: string; itemId: string; slot: EquipSlot }
  | { type: 'item.used'; itemId: string; actor: string; healed: number }
  | { type: 'item.refused'; itemId: string; reason: 'full_health' | 'none_left' | 'not_usable' | 'no_target' }
  | { type: 'spell.cast'; actor: string; spellId: string; itemId?: string }
  | { type: 'spell.hit'; actor: string; spellId: string; enemyId: string; damage: number; killed: boolean }
  | { type: 'spell.fizzled'; actor: string; spellId: string }
  | { type: 'encounter.started'; encounterId: string }
  | { type: 'quest.objective'; questId: string; objectiveId: string }
  | { type: 'quest.completed'; questId: string }
  | { type: 'interact.nothing' }
  | { type: 'attack.swing'; actor: string; kind: AttackKind }
  | { type: 'stamina.low'; actor: string }
  | { type: 'party.dodged'; dir: number }
  | { type: 'attack.blocked'; enemyId: string; target: string; damage: number }
  | { type: 'attack.parried'; enemyId: string; actor: string }
  | { type: 'guard.broken'; enemyId: string; target: string; damage: number }
  | { type: 'enemy.attack.dodged'; enemyId: string }
  | { type: 'enemy.interrupted'; enemyId: string }
  | { type: 'attack.hit'; actor: string; enemyId: string; damage: number; killed: boolean; kind: AttackKind; critical: boolean }
  | { type: 'xp.gained'; amount: number; enemyId: string }
  | { type: 'level.up'; actor: string; level: number; healthGained: number; staminaGained: number }
  | { type: 'attack.miss'; actor: string }
  | { type: 'attack.clang'; actor: string }
  | { type: 'enemy.alerted'; enemyId: string }
  | { type: 'enemy.moved'; enemyId: string }
  | { type: 'enemy.telegraph'; enemyId: string; attackId: string }
  | { type: 'enemy.attack.hit'; enemyId: string; target: string; damage: number; attackId: string }
  | { type: 'enemy.attack.miss'; enemyId: string }
  | { type: 'enemy.died'; enemyId: string }
  | { type: 'encounter.cleared'; encounterId: string }
  | { type: 'party.died' };
