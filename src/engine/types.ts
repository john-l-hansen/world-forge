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
/** One point of mana returns every this many ticks. */
export const MANA_REGEN_INTERVAL = 45;
/** The party AI heals a companion whose health falls to this share or below. */
export const AI_HEAL_THRESHOLD = 0.6;

export type AttackKind = 'light' | 'heavy';

/** What a wound leaves on the floor: red blood, dark ichor, or chips of bone from the dead that do not bleed. */
export type StainKind = 'red' | 'dark' | 'bone';

/** Blood where it fell. It stays, and it is saved with the world. */
export interface Stain {
  x: number;
  y: number;
  kind: StainKind;
  /** 1 a few drops, 2 a spatter, 3 a pool. */
  size: 1 | 2 | 3;
  /** Which of the drawn shapes, and where in the cell. From a hash, never from the dice. */
  v: number;
  tick: number;
  /** The world minute it was spilled; old blood dries black and in time is gone. */
  minute: number;
}

/** The floor keeps this many stains; the oldest dry away first. */
export const MAX_STAINS = 160;

/** Lasting harm to one part of the body. */
export type InjuryKind = 'arm' | 'leg' | 'head' | 'ribs';

// ---------------------------------------------------------------------------
// World time
// ---------------------------------------------------------------------------

/** One minute of world time passes for every second of play. A day is 24 minutes at the table. */
export const TICKS_PER_WORLD_MINUTE = 60;
export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 1440;
/** Every world begins on the first day at eight in the morning. */
export const START_MINUTE = 8 * 60;
/** Time away from a save counts at the same pace as play, up to this much. */
export const MAX_CATCH_UP_MINUTES = 30 * MINUTES_PER_DAY;

/** How long an injury takes to heal: two hours of world time, two minutes of play. */
export const INJURY_MINUTES = 120;
/** An arm injury leaves this share of a weapon blow. */
export const ARM_INJURY_DAMAGE_SHARE = 0.75;
/** A leg injury makes each step take this much longer, for the whole party. */
export const LEG_INJURY_MOVE_FACTOR = 1.4;
/** A head injury makes spells cost this much more mana. */
export const HEAD_INJURY_MANA_FACTOR = 1.5;

export interface Injury {
  kind: InjuryKind;
  /** The world minute it heals at. */
  healsAt: number;
}

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
  | { type: 'unequip'; actor: string; slot: EquipSlot }
  /** Cast a spell the character knows, spending mana. */
  | { type: 'cast'; actor: string; spellId: string }
  /** The player takes this character over. Whoever they played before goes to the party AI. */
  | { type: 'control'; actor: string }
  /** Move a character to the front or back row. */
  | { type: 'row'; actor: string; row: Row }
  /** Time passed outside play, such as while the save sat unopened. The world is the actor. */
  | { type: 'time.pass'; actor: 'world'; minutes: number }
  /** The Dungeon Master moves time on. Refused unless the save allows a Dungeon Master. */
  | { type: 'dm.skip'; actor: 'dm'; minutes: number };

export type Row = 'front' | 'back';

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
  /** Front-row members take blows from ahead and can strike with weapons. */
  row: Row;
  /** Spell IDs this character can cast with mana. */
  spells: string[];
  mana: number;
  maxMana: number;
  /** The party AI leaves this character alone until this tick. */
  aiReadyAt: number;
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
  /** Wounds that have not healed yet. */
  injuries: Injury[];
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
  /** Killed by a blow that tore it apart, not merely felled. */
  gore: boolean;
  /** The world minute it died, so its remains can be taken in time. */
  diedAt: number | null;
  /** Its body has been dragged away. */
  gone: boolean;
}

export interface QuestProgress {
  /** Objective ID to done flag. */
  done: Record<string, boolean>;
  completed: boolean;
}

export interface SessionState {
  stateVersion: 10;
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
  /** Heavy blows each breakable wall has taken. */
  wallDamage: Record<string, number>;
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
  /** Blood on the floor, oldest first. */
  stains: Stain[];
  /** World time, in minutes since the first day began. */
  clock: { minute: number };
  /** What has happened, oldest first. */
  history: WorldEvent[];
  nextEventId: number;
  rules: SessionRules;
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
  /** A heavy blow chipped a breakable wall; `hitsLeft` more bring it down. */
  | { type: 'wall.cracked'; doorId: string; actor: string; hitsLeft: number }
  | { type: 'wall.broken'; doorId: string; actor: string }
  /** A light blow on a breakable wall: it does nothing, and says so. */
  | { type: 'wall.held'; doorId: string; actor: string }
  /** Someone searched a breakable wall. */
  | { type: 'wall.inspected'; doorId: string }
  | { type: 'chest.opened'; objectId: string }
  | { type: 'item.gained'; itemId: string; from: 'pickup' | 'chest' }
  | { type: 'item.equipped'; actor: string; itemId: string; slot: EquipSlot; auto: boolean }
  | { type: 'item.unequipped'; actor: string; itemId: string; slot: EquipSlot }
  | { type: 'item.used'; itemId: string; actor: string; healed: number }
  | { type: 'item.refused'; itemId: string; reason: 'full_health' | 'none_left' | 'not_usable' | 'no_target' }
  | { type: 'party.control'; actor: string }
  | { type: 'member.row'; actor: string; row: Row }
  | { type: 'member.fell'; actor: string }
  | { type: 'member.injured'; actor: string; kind: InjuryKind }
  | { type: 'member.recovered'; actor: string; kind: InjuryKind }
  | { type: 'attack.out_of_reach'; actor: string }
  | { type: 'spell.refused'; actor: string; spellId: string; reason: 'unknown' | 'no_mana' | 'no_target' }
  | { type: 'spell.healed'; actor: string; spellId: string; target: string; healed: number }
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
  | { type: 'attack.blocked'; enemyId: string; target: string; damage: number; shieldId?: string }
  | { type: 'attack.parried'; enemyId: string; actor: string }
  | { type: 'guard.broken'; enemyId: string; target: string; damage: number; shieldId?: string }
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
  | { type: 'party.died' }
  | { type: 'time.passed'; minutes: number; by: 'world' | 'dm' }
  | { type: 'dm.refused'; reason: 'not_allowed' }
  /** Something the world did on its own, for the log. */
  | { type: 'world.changed'; event: WorldEvent };

// ---------------------------------------------------------------------------
// World history: the event bus's record
// ---------------------------------------------------------------------------

export type WorldEventType =
  | 'enemy.slain'
  | 'member.fell'
  | 'member.injured'
  | 'member.recovered'
  | 'item.taken'
  | 'chest.opened'
  | 'door.unlocked'
  | 'wall.broken'
  | 'secret.found'
  | 'quest.completed'
  | 'place.discovered'
  | 'time.passed'
  | 'blood.dried'
  | 'bodies.taken'
  | 'creatures.returned'
  | 'wounds.tended';

/**
 * Something that happened in the world, kept in its history: when, where,
 * who did it, to what, and who saw it. This is what agents will come to know
 * the world by; nobody will read the whole state directly.
 */
export interface WorldEvent {
  id: number;
  minute: number;
  type: WorldEventType;
  /** A party member, an enemy instance, 'world' or 'dm'. */
  actor: string | null;
  /** What it was done to: an enemy, item, object, door, quest or room ID. */
  target: string | null;
  x: number;
  y: number;
  roomId: string | null;
  /** Enemy instances that saw it happen. */
  witnesses: string[];
  /** A count or a number of minutes, where the type has one. */
  amount?: number;
  /** A short qualifier, such as which injury. */
  note?: string;
}

/** The history keeps this many events; older ones are dropped. */
export const MAX_HISTORY = 400;

/** What a save allows. */
export interface SessionRules {
  /** Dungeon Master commands are accepted. */
  dungeonMaster: boolean;
}
