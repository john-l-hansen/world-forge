/**
 * The game simulation. Fixed 60 Hz steps, driven only by commands, with all
 * randomness drawn from the session's seeded generator. It knows nothing
 * about rendering, audio, React or the network.
 */
import {
  DIR_X,
  DIR_Y,
  TILE_DOORWAY,
  TILE_WALL,
  inBounds,
  roomAtCell,
  type CompiledWorld,
} from '../world/compile';
import type { EnemyAttackDef, EnemyDef, WeaponDef } from '../schema/world';
import { randomInt } from './rng';
import {
  BLOCK_DAMAGE_SHARE,
  BLOCK_STAMINA_COST,
  BUMP_TICKS,
  DODGE_COOLDOWN_TICKS,
  DODGE_INVULNERABLE_TICKS,
  DODGE_STAMINA_COST,
  DODGE_TICKS,
  ENEMY_ATTACK_POSE_TICKS,
  GUARD_BREAK_DAMAGE_SHARE,
  HIT_STOP_TICKS,
  INPUT_BUFFER_TICKS,
  MOVE_TICKS,
  PARRY_STAGGER_TICKS,
  PARRY_WINDOW_TICKS,
  STAMINA_REGEN_DELAY,
  STAMINA_REGEN_INTERVAL,
  TURN_TICKS,
  type BumpReason,
  type Command,
  type EnemyState,
  type GameEvent,
  type MoveDir,
  type PartyMember,
  type SessionState,
} from './types';

const NEVER = -1000;

// ---------------------------------------------------------------------------
// Session creation and serialization
// ---------------------------------------------------------------------------

export function createSession(world: CompiledWorld, seed = 1): SessionState {
  const def = world.def;
  const members: PartyMember[] = def.settings.startingPartyIds.map((charId) => {
    const c = def.characters.find((ch) => ch.id === charId)!;
    return {
      id: c.id,
      controller: 'local',
      hp: c.maxHealth,
      maxHp: c.maxHealth,
      stamina: c.maxStamina,
      maxStamina: c.maxStamina,
      staminaRegenFrom: 0,
      blocking: false,
      blockStart: NEVER,
      action: { kind: 'idle' },
    };
  });

  const enemies: EnemyState[] = world.spawns.map((s) => {
    const e = def.enemies.find((en) => en.id === s.enemyId)!;
    return {
      id: s.instanceId,
      defId: e.id,
      x: s.x,
      y: s.y,
      prevX: s.x,
      prevY: s.y,
      moveStart: NEVER,
      facing: s.facing,
      hp: e.health,
      maxHp: e.health,
      ai: 'idle',
      aiStart: 0,
      aiEnd: 0,
      targetX: s.x,
      targetY: s.y,
      attackId: e.attacks[0].id,
      alerted: false,
      lastHitTick: NEVER,
    };
  });

  const doorsOpen: Record<string, boolean> = {};
  for (const door of world.doors) doorsOpen[door.def.id] = door.def.kind === 'archway';

  const quests: SessionState['quests'] = {};
  for (const questId of def.settings.startingQuestIds) quests[questId] = { done: {}, completed: false };

  const startRoom = roomAtCell(world, world.start.x, world.start.y);
  const state: SessionState = {
    stateVersion: 3,
    worldId: def.world.id,
    tick: 0,
    rng: seed | 0,
    hitStop: 0,
    status: 'playing',
    party: {
      x: world.start.x,
      y: world.start.y,
      facing: world.start.facing,
      prevX: world.start.x,
      prevY: world.start.y,
      moveStart: NEVER,
      moveTicks: MOVE_TICKS,
      invulnerableUntil: NEVER,
      dodgeReadyAt: 0,
      prevFacing: world.start.facing,
      turnStart: NEVER,
      bumpStart: NEVER,
      bumpDir: 0,
      members,
    },
    buffered: null,
    enemies,
    doorsOpen,
    doorsUnlocked: {},
    chestsOpened: {},
    pickupsTaken: {},
    inventory: {},
    quests,
    encountersStarted: [],
    explored: new Array(world.width * world.height).fill(0),
    currentRoomId: startRoom ? startRoom.id : null,
    visitedRoomIds: startRoom ? [startRoom.id] : [],
  };
  reveal(state, world);
  return state;
}

export function serializeSession(state: SessionState): string {
  return JSON.stringify(state);
}

export function deserializeSession(json: string): SessionState {
  const state = JSON.parse(json) as SessionState;
  if (state.stateVersion !== 3) throw new Error(`Unsupported session version ${String(state.stateVersion)}`);
  return state;
}

// ---------------------------------------------------------------------------
// Queries shared with the renderer and interface
// ---------------------------------------------------------------------------

export function isDoorOpenAt(state: SessionState, world: CompiledWorld, x: number, y: number): boolean {
  const door = world.doorAt.get(y * world.width + x);
  return door ? state.doorsOpen[door.def.id] === true : true;
}

/** Can anything stand in this cell, ignoring creatures? */
export function isOpenCell(state: SessionState, world: CompiledWorld, x: number, y: number): boolean {
  if (!inBounds(world, x, y)) return false;
  const i = y * world.width + x;
  const tile = world.tiles[i];
  if (tile === TILE_WALL) return false;
  if (tile === TILE_DOORWAY && !isDoorOpenAt(state, world, x, y)) return false;
  return world.blocked[i] === 0;
}

export function enemyAt(state: SessionState, x: number, y: number): EnemyState | null {
  for (const e of state.enemies) if (e.ai !== 'dead' && e.x === x && e.y === y) return e;
  return null;
}

/** Can sight pass through this cell? Props do not block sight. */
function seeThrough(state: SessionState, world: CompiledWorld, x: number, y: number): boolean {
  if (!inBounds(world, x, y)) return false;
  const tile = world.tiles[y * world.width + x];
  if (tile === TILE_WALL) return false;
  return tile !== TILE_DOORWAY || isDoorOpenAt(state, world, x, y);
}

export function hasLineOfSight(
  state: SessionState,
  world: CompiledWorld,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (x !== x1 || y !== y1) {
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
    if ((x !== x1 || y !== y1) && !seeThrough(state, world, x, y)) return false;
  }
  return true;
}

export function partyIsBusy(state: SessionState): boolean {
  const p = state.party;
  if (state.tick < p.moveStart + p.moveTicks) return true;
  if (state.tick < p.turnStart + TURN_TICKS) return true;
  // A bump counts as a very short action so a held key does not spam it.
  if (state.tick < p.bumpStart + BUMP_TICKS) return true;
  return p.members.some((m) => m.action.kind === 'attack' && state.tick < m.action.end);
}

/** True while the guard is actually up: held, and not in the middle of a swing. */
export function isGuarding(member: PartyMember): boolean {
  return member.blocking && member.hp > 0 && member.action.kind === 'idle';
}

/** The cells an enemy's wound-up attack will hit. */
export function attackCells(enemy: EnemyState, attack: EnemyAttackDef): { x: number; y: number }[] {
  const cells = [{ x: enemy.targetX, y: enemy.targetY }];
  if (attack.pattern === 'sweep') {
    // The cells to the left and right of the target, as the enemy faces it.
    for (const side of [1, 3]) {
      const dir = (enemy.facing + side) % 4;
      cells.push({ x: enemy.targetX + DIR_X[dir], y: enemy.targetY + DIR_Y[dir] });
    }
  }
  return cells;
}

export function livingEnemies(state: SessionState): number {
  return state.enemies.filter((e) => e.ai !== 'dead').length;
}

// ---------------------------------------------------------------------------
// The step
// ---------------------------------------------------------------------------

/**
 * Advance the simulation by one tick. Commands that cannot run yet are held
 * briefly, so a key pressed slightly early still counts.
 */
export function step(state: SessionState, world: CompiledWorld, commands: readonly Command[]): GameEvent[] {
  const events: GameEvent[] = [];
  if (state.status !== 'playing') return events;

  for (const command of commands) {
    const member = state.party.members.find((m) => m.id === command.actor && m.hp > 0);
    if (!member) continue;
    if (command.type === 'block') {
      // Raising or lowering the guard is never queued behind other actions.
      if (command.held && !member.blocking) member.blockStart = state.tick + 1;
      member.blocking = command.held;
    } else {
      state.buffered = { command, tick: state.tick };
    }
  }

  // Hit-stop: the world holds its breath for a few ticks after a solid blow.
  if (state.hitStop > 0) {
    state.hitStop--;
    return events;
  }

  state.tick++;

  if (state.buffered && state.tick - state.buffered.tick > INPUT_BUFFER_TICKS) state.buffered = null;
  if (state.buffered && !partyIsBusy(state)) {
    const { command } = state.buffered;
    state.buffered = null;
    runCommand(state, world, command, events);
  }

  resolvePartyAttacks(state, world, events);
  for (const enemy of state.enemies) updateEnemy(state, world, enemy, events);
  restoreStamina(state);
  trackQuests(state, world, events);

  return events;
}

// ---------------------------------------------------------------------------
// Party
// ---------------------------------------------------------------------------

function runCommand(state: SessionState, world: CompiledWorld, command: Command, events: GameEvent[]) {
  const p = state.party;
  switch (command.type) {
    case 'turn': {
      p.prevFacing = p.facing;
      p.facing = (p.facing + (command.dir === 'right' ? 1 : 3)) % 4;
      p.turnStart = state.tick;
      events.push({ type: 'party.turned', facing: p.facing });
      return;
    }
    case 'move': {
      const dir = (p.facing + MOVE_OFFSET[command.dir]) % 4;
      moveParty(state, world, dir, MOVE_TICKS, events);
      return;
    }
    case 'dodge': {
      const member = p.members.find((m) => m.id === command.actor);
      if (!member || member.hp <= 0) return;
      if (state.tick < p.dodgeReadyAt) return;
      if (member.stamina < DODGE_STAMINA_COST) {
        events.push({ type: 'stamina.low', actor: member.id });
        return;
      }
      const dir = (p.facing + MOVE_OFFSET[command.dir ?? 'back']) % 4;
      if (!moveParty(state, world, dir, DODGE_TICKS, events)) return;
      spendStamina(state, member, DODGE_STAMINA_COST);
      p.invulnerableUntil = state.tick + DODGE_INVULNERABLE_TICKS;
      p.dodgeReadyAt = state.tick + DODGE_COOLDOWN_TICKS;
      events.push({ type: 'party.dodged', dir });
      return;
    }
    case 'attack': {
      const member = p.members.find((m) => m.id === command.actor);
      if (!member || member.hp <= 0) return;
      const kind = command.kind ?? 'light';
      const attack = weaponOf(world, member).weapon[kind];
      if (member.stamina < attack.staminaCost) {
        events.push({ type: 'stamina.low', actor: member.id });
        return;
      }
      spendStamina(state, member, attack.staminaCost);
      member.action = {
        kind: 'attack',
        attack: kind,
        start: state.tick,
        hitTick: state.tick + attack.windupTicks,
        end: state.tick + attack.windupTicks + attack.recoveryTicks,
        resolved: false,
      };
      events.push({ type: 'attack.swing', actor: member.id, kind });
      return;
    }
    case 'interact': {
      const fx = p.x + DIR_X[p.facing];
      const fy = p.y + DIR_Y[p.facing];
      const front = inBounds(world, fx, fy) ? fy * world.width + fx : -1;

      const chest = world.chestAt.get(front);
      if (chest) {
        if (state.chestsOpened[chest.id]) {
          events.push({ type: 'interact.nothing' });
          return;
        }
        state.chestsOpened[chest.id] = true;
        events.push({ type: 'chest.opened', objectId: chest.id });
        for (const itemId of chest.contents) gainItem(state, itemId, 'chest', events);
        return;
      }

      const door = world.doorAt.get(front);
      if (!door || door.def.kind === 'archway') {
        events.push({ type: 'interact.nothing' });
        return;
      }
      if (door.def.kind === 'secret') {
        // A secret door opens once and stays open.
        if (state.doorsOpen[door.def.id]) events.push({ type: 'interact.nothing' });
        else {
          state.doorsOpen[door.def.id] = true;
          events.push({ type: 'secret.found', doorId: door.def.id });
        }
        return;
      }
      if (state.doorsOpen[door.def.id]) {
        // A door cannot close on something standing in it.
        if (enemyAt(state, fx, fy)) {
          events.push({ type: 'interact.nothing' });
          return;
        }
        state.doorsOpen[door.def.id] = false;
        events.push({ type: 'door.closed', doorId: door.def.id });
        return;
      }
      const lock = door.def.lock;
      if (lock && !state.doorsUnlocked[door.def.id]) {
        if (!state.inventory[lock.keyItemId]) {
          events.push({ type: 'door.locked', doorId: door.def.id });
          return;
        }
        state.doorsUnlocked[door.def.id] = true;
        events.push({ type: 'door.unlocked', doorId: door.def.id, itemId: lock.keyItemId });
      }
      state.doorsOpen[door.def.id] = true;
      events.push({ type: 'door.opened', doorId: door.def.id });
      return;
    }
    case 'use': {
      const member = p.members.find((m) => m.id === command.actor);
      const item = world.def.items.find((it) => it.id === command.itemId);
      if (!member || member.hp <= 0) return;
      if (!item || item.category !== 'consumable') {
        events.push({ type: 'item.refused', itemId: command.itemId, reason: 'not_usable' });
        return;
      }
      if (!state.inventory[item.id]) {
        events.push({ type: 'item.refused', itemId: item.id, reason: 'none_left' });
        return;
      }
      if (member.hp >= member.maxHp) {
        events.push({ type: 'item.refused', itemId: item.id, reason: 'full_health' });
        return;
      }
      const healed = Math.min(item.effect.amount, member.maxHp - member.hp);
      member.hp += healed;
      state.inventory[item.id] -= 1;
      if (state.inventory[item.id] === 0) delete state.inventory[item.id];
      events.push({ type: 'item.used', itemId: item.id, actor: member.id, healed });
      return;
    }
  }
}

const MOVE_OFFSET: Record<MoveDir, number> = { forward: 0, right: 1, back: 2, left: 3 };

/** Step the party one cell in an absolute direction. False if something is in the way. */
function moveParty(state: SessionState, world: CompiledWorld, dir: number, ticks: number, events: GameEvent[]): boolean {
  const p = state.party;
  const nx = p.x + DIR_X[dir];
  const ny = p.y + DIR_Y[dir];
  const reason = blockReason(state, world, nx, ny);
  if (reason) {
    p.bumpStart = state.tick;
    p.bumpDir = dir;
    events.push({ type: 'party.bumped', reason });
    return false;
  }
  p.prevX = p.x;
  p.prevY = p.y;
  p.x = nx;
  p.y = ny;
  p.moveStart = state.tick;
  p.moveTicks = ticks;
  events.push({ type: 'party.moved', x: nx, y: ny });
  reveal(state, world);
  for (const pickup of world.pickups) {
    if (pickup.x !== nx || pickup.y !== ny || state.pickupsTaken[pickup.id]) continue;
    state.pickupsTaken[pickup.id] = true;
    gainItem(state, pickup.itemId, 'pickup', events);
  }
  const room = roomAtCell(world, nx, ny);
  if (room && room.id !== state.currentRoomId) {
    const firstVisit = !state.visitedRoomIds.includes(room.id);
    if (firstVisit) state.visitedRoomIds.push(room.id);
    state.currentRoomId = room.id;
    events.push({ type: 'room.entered', roomId: room.id, firstVisit });
  }
  return true;
}

function spendStamina(state: SessionState, member: PartyMember, amount: number) {
  member.stamina = Math.max(0, member.stamina - amount);
  member.staminaRegenFrom = state.tick + STAMINA_REGEN_DELAY;
}

/** Stamina returns steadily, but not while swinging or holding the guard up. */
function restoreStamina(state: SessionState) {
  if (state.tick % STAMINA_REGEN_INTERVAL !== 0) return;
  for (const member of state.party.members) {
    if (member.hp <= 0 || member.stamina >= member.maxStamina) continue;
    if (state.tick < member.staminaRegenFrom || member.blocking || member.action.kind !== 'idle') continue;
    member.stamina += 1;
  }
}

function gainItem(state: SessionState, itemId: string, from: 'pickup' | 'chest', events: GameEvent[]) {
  state.inventory[itemId] = (state.inventory[itemId] ?? 0) + 1;
  events.push({ type: 'item.gained', itemId, from });
}

function blockReason(state: SessionState, world: CompiledWorld, x: number, y: number): BumpReason | null {
  if (!inBounds(world, x, y)) return 'wall';
  const i = y * world.width + x;
  if (world.tiles[i] === TILE_WALL) return 'wall';
  if (world.tiles[i] === TILE_DOORWAY && !isDoorOpenAt(state, world, x, y)) {
    // An undiscovered secret door feels exactly like the wall it pretends to be.
    return world.doorAt.get(i)!.def.kind === 'secret' ? 'wall' : 'door';
  }
  if (world.blocked[i]) return 'object';
  if (enemyAt(state, x, y)) return 'enemy';
  return null;
}

function weaponOf(world: CompiledWorld, member: PartyMember): WeaponDef {
  const c = world.def.characters.find((ch) => ch.id === member.id)!;
  // Validation guarantees the main hand holds a weapon.
  return world.def.items.find((it) => it.id === c.equipment.mainHand) as WeaponDef;
}

function resolvePartyAttacks(state: SessionState, world: CompiledWorld, events: GameEvent[]) {
  const p = state.party;
  for (const member of p.members) {
    const action = member.action;
    if (action.kind !== 'attack') continue;
    if (!action.resolved && state.tick >= action.hitTick) {
      action.resolved = true;
      const fx = p.x + DIR_X[p.facing];
      const fy = p.y + DIR_Y[p.facing];
      const enemy = enemyAt(state, fx, fy);
      if (enemy) {
        const attack = weaponOf(world, member).weapon[action.attack];
        const def = enemyDef(world, enemy);
        const rolled = randomInt(state, attack.damage.min, attack.damage.max);
        const damage = Math.max(1, rolled - def.defence);
        const heavy = attack.impact >= 3;
        enemy.hp = Math.max(0, enemy.hp - damage);
        enemy.lastHitTick = state.tick;
        if (!enemy.alerted) alertEnemy(state, world, enemy, events);
        const killed = enemy.hp === 0;
        events.push({ type: 'attack.hit', actor: member.id, enemyId: enemy.id, damage, killed, kind: action.attack });
        state.hitStop = heavy ? HIT_STOP_TICKS + 3 : HIT_STOP_TICKS;
        const staggerTicks = def.staggerTicks * (heavy ? 2 : 1);
        if (killed) {
          killEnemy(state, world, enemy, events);
        } else if (enemy.ai === 'telegraph') {
          // Only a blow at least as heavy as the enemy's poise breaks a wind-up.
          if (attack.impact >= def.poise) {
            setAi(state, enemy, 'stagger', staggerTicks);
            events.push({ type: 'enemy.interrupted', enemyId: enemy.id });
          }
        } else if (enemy.ai === 'idle' || enemy.ai === 'move') {
          // A blow interrupts an enemy that is not already committed to a swing.
          setAi(state, enemy, 'stagger', staggerTicks);
        } else if (enemy.ai === 'attack') {
          setAi(state, enemy, 'recover', currentAttack(def, enemy).recoverTicks);
        } else if (enemy.ai === 'recover' || enemy.ai === 'stagger') {
          // Never shorten a recovery: hitting an open enemy must not speed it up.
          enemy.aiEnd = Math.max(enemy.aiEnd, state.tick + staggerTicks);
        }
      } else if (!inBounds(world, fx, fy) || world.tiles[fy * world.width + fx] === TILE_WALL || !isDoorOpenAt(state, world, fx, fy)) {
        events.push({ type: 'attack.clang', actor: member.id });
      } else {
        events.push({ type: 'attack.miss', actor: member.id });
      }
    }
    if (state.tick >= action.end) {
      member.action = { kind: 'idle' };
      // A guard held through the swing comes up now, and can parry from now.
      if (member.blocking) member.blockStart = state.tick;
    }
  }
}

function reveal(state: SessionState, world: CompiledWorld) {
  const { x, y } = state.party;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (inBounds(world, x + dx, y + dy)) state.explored[(y + dy) * world.width + (x + dx)] = 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------

function enemyDef(world: CompiledWorld, enemy: EnemyState): EnemyDef {
  return world.def.enemies.find((e) => e.id === enemy.defId)!;
}

function killEnemy(state: SessionState, world: CompiledWorld, enemy: EnemyState, events: GameEvent[]) {
  enemy.ai = 'dead';
  enemy.aiStart = state.tick;
  enemy.aiEnd = state.tick;
  events.push({ type: 'enemy.died', enemyId: enemy.id });
  const encounterId = enemy.id.split('#')[0];
  const remaining = state.enemies.some((e) => e.ai !== 'dead' && e.id.split('#')[0] === encounterId);
  if (!remaining && world.def.encounters.some((enc) => enc.id === encounterId)) {
    events.push({ type: 'encounter.cleared', encounterId });
  }
}

const encounterOf = (enemy: EnemyState) => enemy.id.split('#')[0];

function alertEnemy(state: SessionState, world: CompiledWorld, enemy: EnemyState, events: GameEvent[]) {
  enemy.alerted = true;
  events.push({ type: 'enemy.alerted', enemyId: enemy.id });
  const encounterId = encounterOf(enemy);
  if (!state.encountersStarted.includes(encounterId) && world.def.encounters.some((enc) => enc.id === encounterId)) {
    state.encountersStarted.push(encounterId);
    events.push({ type: 'encounter.started', encounterId });
  }
}

function setAi(state: SessionState, enemy: EnemyState, ai: EnemyState['ai'], duration: number) {
  enemy.ai = ai;
  enemy.aiStart = state.tick;
  enemy.aiEnd = state.tick + duration;
}

function facingToward(fromX: number, fromY: number, toX: number, toY: number, fallback: number): number {
  for (let dir = 0; dir < 4; dir++) if (fromX + DIR_X[dir] === toX && fromY + DIR_Y[dir] === toY) return dir;
  return fallback;
}

function updateEnemy(state: SessionState, world: CompiledWorld, enemy: EnemyState, events: GameEvent[]) {
  if (enemy.ai === 'dead') return;
  const def = enemyDef(world, enemy);
  const p = state.party;

  switch (enemy.ai) {
    case 'move':
    case 'recover':
    case 'stagger':
      if (state.tick >= enemy.aiEnd) setAi(state, enemy, 'idle', 0);
      return;

    case 'telegraph': {
      if (state.tick < enemy.aiEnd) return;
      const attack = currentAttack(def, enemy);
      resolveEnemyAttack(state, enemy, attack, events);
      // A parry leaves the enemy reeling instead of following through.
      if (enemy.ai === 'telegraph') setAi(state, enemy, 'attack', ENEMY_ATTACK_POSE_TICKS);
      return;
    }

    case 'attack':
      if (state.tick >= enemy.aiEnd) setAi(state, enemy, 'recover', currentAttack(def, enemy).recoverTicks);
      return;

    case 'idle': {
      if (!enemy.alerted) {
        const dx = p.x - enemy.x;
        const dy = p.y - enemy.y;
        const near = dx * dx + dy * dy <= def.sightRange * def.sightRange;
        if (near && hasLineOfSight(state, world, enemy.x, enemy.y, p.x, p.y)) {
          alertEnemy(state, world, enemy, events);
        }
        return;
      }

      const adjacent = Math.abs(p.x - enemy.x) + Math.abs(p.y - enemy.y) === 1;
      if (adjacent) {
        enemy.facing = facingToward(enemy.x, enemy.y, p.x, p.y, enemy.facing);
        enemy.targetX = p.x;
        enemy.targetY = p.y;
        const attack = chooseAttack(state, def);
        enemy.attackId = attack.id;
        setAi(state, enemy, 'telegraph', attack.telegraphTicks);
        events.push({ type: 'enemy.telegraph', enemyId: enemy.id, attackId: attack.id });
        return;
      }

      const next = nextStepToward(state, world, enemy, p.x, p.y);
      if (next) {
        enemy.facing = facingToward(enemy.x, enemy.y, next.x, next.y, enemy.facing);
        enemy.prevX = enemy.x;
        enemy.prevY = enemy.y;
        enemy.x = next.x;
        enemy.y = next.y;
        enemy.moveStart = state.tick;
        setAi(state, enemy, 'move', def.moveTicks);
        events.push({ type: 'enemy.moved', enemyId: enemy.id });
      }
      return;
    }
  }
}

function currentAttack(def: EnemyDef, enemy: EnemyState): EnemyAttackDef {
  return def.attacks.find((a) => a.id === enemy.attackId) ?? def.attacks[0];
}

/** Pick one of the enemy's attacks by weight, using the session's seed. */
function chooseAttack(state: SessionState, def: EnemyDef): EnemyAttackDef {
  if (def.attacks.length === 1) return def.attacks[0];
  const total = def.attacks.reduce((sum, a) => sum + a.weight, 0);
  let roll = randomInt(state, 1, total);
  for (const attack of def.attacks) {
    roll -= attack.weight;
    if (roll <= 0) return attack;
  }
  return def.attacks[0];
}

/**
 * The wind-up is over and the blow lands on the cells it was aimed at. The
 * party can avoid it by not being there, by a dodge, by a parry, or soften
 * it with a block.
 */
function resolveEnemyAttack(state: SessionState, enemy: EnemyState, attack: EnemyAttackDef, events: GameEvent[]) {
  const p = state.party;
  const inReach = attackCells(enemy, attack).some((c) => c.x === p.x && c.y === p.y);
  if (!inReach) {
    events.push({ type: 'enemy.attack.miss', enemyId: enemy.id });
    return;
  }
  if (state.tick < p.invulnerableUntil) {
    events.push({ type: 'enemy.attack.dodged', enemyId: enemy.id });
    return;
  }
  const target = p.members.find((m) => m.hp > 0);
  if (!target) return;

  const rolled = randomInt(state, attack.damage.min, attack.damage.max);
  const facingEnemy = p.x + DIR_X[p.facing] === enemy.x && p.y + DIR_Y[p.facing] === enemy.y;
  let damage = rolled;

  if (attack.blockable && facingEnemy && isGuarding(target)) {
    if (state.tick - target.blockStart <= PARRY_WINDOW_TICKS) {
      // Guard raised at the last moment: the blow is turned aside.
      setAi(state, enemy, 'stagger', PARRY_STAGGER_TICKS);
      state.hitStop = HIT_STOP_TICKS + 2;
      events.push({ type: 'attack.parried', enemyId: enemy.id, actor: target.id });
      return;
    }
    if (target.stamina >= BLOCK_STAMINA_COST) {
      damage = Math.max(1, Math.ceil(rolled * BLOCK_DAMAGE_SHARE));
      spendStamina(state, target, BLOCK_STAMINA_COST);
      target.hp = Math.max(0, target.hp - damage);
      events.push({ type: 'attack.blocked', enemyId: enemy.id, target: target.id, damage });
    } else {
      // Too tired to hold the guard: it is knocked aside.
      damage = Math.max(1, Math.ceil(rolled * GUARD_BREAK_DAMAGE_SHARE));
      spendStamina(state, target, target.stamina);
      target.blocking = false;
      target.hp = Math.max(0, target.hp - damage);
      events.push({ type: 'guard.broken', enemyId: enemy.id, target: target.id, damage });
    }
  } else {
    target.hp = Math.max(0, target.hp - damage);
    events.push({ type: 'enemy.attack.hit', enemyId: enemy.id, target: target.id, damage, attackId: attack.id });
  }

  if (!p.members.some((m) => m.hp > 0)) {
    state.status = 'dead';
    events.push({ type: 'party.died' });
  }
}

/** Breadth-first search for the first step of the shortest path to the goal. */
function nextStepToward(
  state: SessionState,
  world: CompiledWorld,
  enemy: EnemyState,
  goalX: number,
  goalY: number,
): { x: number; y: number } | null {
  const w = world.width;
  const start = enemy.y * w + enemy.x;
  const goal = goalY * w + goalX;
  const from = new Int32Array(w * world.height).fill(-1);
  from[start] = start;
  const queue = [start];
  while (queue.length) {
    const i = queue.shift()!;
    if (i === goal) break;
    const cx = i % w;
    const cy = (i - cx) / w;
    for (let dir = 0; dir < 4; dir++) {
      const nx = cx + DIR_X[dir];
      const ny = cy + DIR_Y[dir];
      const ni = ny * w + nx;
      if (!inBounds(world, nx, ny) || from[ni] !== -1) continue;
      if (ni !== goal) {
        if (!isOpenCell(state, world, nx, ny)) continue;
        const other = enemyAt(state, nx, ny);
        if (other && other !== enemy) continue;
      }
      from[ni] = i;
      queue.push(ni);
    }
  }
  if (from[goal] === -1) return null;
  let i = goal;
  while (from[i] !== start) i = from[i];
  if (i === goal) return null; // already adjacent; the caller attacks instead
  return { x: i % w, y: Math.floor(i / w) };
}

// ---------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------

/** Mark quest objectives that this tick's events have satisfied. */
function trackQuests(state: SessionState, world: CompiledWorld, events: GameEvent[]) {
  if (events.length === 0) return;
  const happened = events.slice();
  for (const quest of world.def.quests) {
    const progress = state.quests[quest.id];
    if (!progress || progress.completed) continue;
    for (const objective of quest.objectives) {
      if (progress.done[objective.id]) continue;
      const met = happened.some((e) => {
        switch (objective.type) {
          case 'collect_item':
            return e.type === 'item.gained' && e.itemId === objective.targetId;
          case 'defeat_encounter':
            return e.type === 'encounter.cleared' && e.encounterId === objective.targetId;
          case 'open_chest':
            return e.type === 'chest.opened' && e.objectId === objective.targetId;
          case 'reach_room':
            return e.type === 'room.entered' && e.roomId === objective.targetId;
        }
      });
      if (!met) continue;
      progress.done[objective.id] = true;
      events.push({ type: 'quest.objective', questId: quest.id, objectiveId: objective.id });
    }
    if (quest.objectives.every((o) => o.optional || progress.done[o.id])) {
      progress.completed = true;
      events.push({ type: 'quest.completed', questId: quest.id });
    }
  }
}
