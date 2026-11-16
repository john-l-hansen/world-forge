/**
 * Simulation types. Everything here is plain JSON-serializable data, so a
 * session can be saved, hashed, replayed or (later) sent to another player.
 */

export const TICKS_PER_SECOND = 60;
export const MOVE_TICKS = 14;
export const TURN_TICKS = 10;
export const BUMP_TICKS = 10;
export const INPUT_BUFFER_TICKS = 18;
export const HIT_STOP_TICKS = 4;
export const ENEMY_ATTACK_POSE_TICKS = 12;

export type MoveDir = 'forward' | 'back' | 'left' | 'right';

/**
 * The only way anything outside the simulation can change it. Every command
 * names the character acting, so a controller can be a local player today
 * and party AI or a remote player later.
 */
export type Command =
  | { type: 'move'; actor: string; dir: MoveDir }
  | { type: 'turn'; actor: string; dir: 'left' | 'right' }
  | { type: 'attack'; actor: string }
  | { type: 'interact'; actor: string }
  | { type: 'use'; actor: string; itemId: string };

export type Controller = 'local' | 'ai' | 'remote';

export type MemberAction =
  | { kind: 'idle' }
  | { kind: 'attack'; start: number; hitTick: number; end: number; resolved: boolean };

export interface PartyMember {
  /** Character ID from the world definition. */
  id: string;
  controller: Controller;
  hp: number;
  maxHp: number;
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
  alerted: boolean;
  lastHitTick: number;
}

export interface QuestProgress {
  /** Objective ID to done flag. */
  done: Record<string, boolean>;
  completed: boolean;
}

export interface SessionState {
  stateVersion: 2;
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
  | { type: 'item.used'; itemId: string; actor: string; healed: number }
  | { type: 'item.refused'; itemId: string; reason: 'full_health' | 'none_left' | 'not_usable' }
  | { type: 'encounter.started'; encounterId: string }
  | { type: 'quest.objective'; questId: string; objectiveId: string }
  | { type: 'quest.completed'; questId: string }
  | { type: 'interact.nothing' }
  | { type: 'attack.swing'; actor: string }
  | { type: 'attack.hit'; actor: string; enemyId: string; damage: number; killed: boolean }
  | { type: 'attack.miss'; actor: string }
  | { type: 'attack.clang'; actor: string }
  | { type: 'enemy.alerted'; enemyId: string }
  | { type: 'enemy.moved'; enemyId: string }
  | { type: 'enemy.telegraph'; enemyId: string }
  | { type: 'enemy.attack.hit'; enemyId: string; target: string; damage: number }
  | { type: 'enemy.attack.miss'; enemyId: string }
  | { type: 'enemy.died'; enemyId: string }
  | { type: 'encounter.cleared'; encounterId: string }
  | { type: 'party.died' };
