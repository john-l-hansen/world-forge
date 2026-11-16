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
import type { EnemyDef, ItemDef } from '../schema/world';
import { randomInt } from './rng';
import {
  BUMP_TICKS,
  ENEMY_ATTACK_POSE_TICKS,
  HIT_STOP_TICKS,
  INPUT_BUFFER_TICKS,
  MOVE_TICKS,
  TURN_TICKS,
  type BumpReason,
  type Command,
  type EnemyState,
  type GameEvent,
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
    return { id: c.id, controller: 'local', hp: c.maxHealth, maxHp: c.maxHealth, action: { kind: 'idle' } };
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
      alerted: false,
      lastHitTick: NEVER,
    };
  });

  const doorsOpen: Record<string, boolean> = {};
  for (const door of world.doors) doorsOpen[door.def.id] = door.def.kind === 'archway';

  const startRoom = roomAtCell(world, world.start.x, world.start.y);
  const state: SessionState = {
    stateVersion: 1,
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
      prevFacing: world.start.facing,
      turnStart: NEVER,
      bumpStart: NEVER,
      bumpDir: 0,
      members,
    },
    buffered: null,
    enemies,
    doorsOpen,
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
  if (state.stateVersion !== 1) throw new Error(`Unsupported session version ${String(state.stateVersion)}`);
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
  if (state.tick < p.moveStart + MOVE_TICKS) return true;
  if (state.tick < p.turnStart + TURN_TICKS) return true;
  // A bump counts as a very short action so a held key does not spam it.
  if (state.tick < p.bumpStart + BUMP_TICKS) return true;
  return p.members.some((m) => m.action.kind === 'attack' && state.tick < m.action.end);
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
    if (state.party.members.some((m) => m.id === command.actor && m.hp > 0)) {
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
      const offset = { forward: 0, right: 1, back: 2, left: 3 }[command.dir];
      const dir = (p.facing + offset) % 4;
      const nx = p.x + DIR_X[dir];
      const ny = p.y + DIR_Y[dir];
      const reason = blockReason(state, world, nx, ny);
      if (reason) {
        p.bumpStart = state.tick;
        p.bumpDir = dir;
        events.push({ type: 'party.bumped', reason });
        return;
      }
      p.prevX = p.x;
      p.prevY = p.y;
      p.x = nx;
      p.y = ny;
      p.moveStart = state.tick;
      events.push({ type: 'party.moved', x: nx, y: ny });
      reveal(state, world);
      const room = roomAtCell(world, nx, ny);
      if (room && room.id !== state.currentRoomId) {
        const firstVisit = !state.visitedRoomIds.includes(room.id);
        if (firstVisit) state.visitedRoomIds.push(room.id);
        state.currentRoomId = room.id;
        events.push({ type: 'room.entered', roomId: room.id, firstVisit });
      }
      return;
    }
    case 'attack': {
      const member = p.members.find((m) => m.id === command.actor);
      if (!member || member.hp <= 0) return;
      const weapon = weaponOf(world, member);
      member.action = {
        kind: 'attack',
        start: state.tick,
        hitTick: state.tick + weapon.weapon.windupTicks,
        end: state.tick + weapon.weapon.windupTicks + weapon.weapon.recoveryTicks,
        resolved: false,
      };
      events.push({ type: 'attack.swing', actor: member.id });
      return;
    }
    case 'interact': {
      const fx = p.x + DIR_X[p.facing];
      const fy = p.y + DIR_Y[p.facing];
      const door = inBounds(world, fx, fy) ? world.doorAt.get(fy * world.width + fx) : undefined;
      if (!door || door.def.kind !== 'door') {
        events.push({ type: 'interact.nothing' });
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
      } else {
        state.doorsOpen[door.def.id] = true;
        events.push({ type: 'door.opened', doorId: door.def.id });
      }
      return;
    }
  }
}

function blockReason(state: SessionState, world: CompiledWorld, x: number, y: number): BumpReason | null {
  if (!inBounds(world, x, y)) return 'wall';
  const i = y * world.width + x;
  if (world.tiles[i] === TILE_WALL) return 'wall';
  if (world.tiles[i] === TILE_DOORWAY && !isDoorOpenAt(state, world, x, y)) return 'door';
  if (world.blocked[i]) return 'object';
  if (enemyAt(state, x, y)) return 'enemy';
  return null;
}

function weaponOf(world: CompiledWorld, member: PartyMember): ItemDef {
  const c = world.def.characters.find((ch) => ch.id === member.id)!;
  return world.def.items.find((it) => it.id === c.equipment.mainHand)!;
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
        const weapon = weaponOf(world, member);
        const def = enemyDef(world, enemy);
        const rolled = randomInt(state, weapon.weapon.damage.min, weapon.weapon.damage.max);
        const damage = Math.max(1, rolled - def.defence);
        enemy.hp = Math.max(0, enemy.hp - damage);
        enemy.lastHitTick = state.tick;
        enemy.alerted = true;
        const killed = enemy.hp === 0;
        events.push({ type: 'attack.hit', actor: member.id, enemyId: enemy.id, damage, killed });
        state.hitStop = HIT_STOP_TICKS;
        if (killed) {
          killEnemy(state, world, enemy, events);
        } else if (enemy.ai === 'idle' || enemy.ai === 'move') {
          // A blow interrupts an enemy that is not already committed to a swing.
          setAi(state, enemy, 'stagger', def.staggerTicks);
        } else if (enemy.ai === 'attack') {
          setAi(state, enemy, 'recover', def.attack.recoverTicks);
        } else if (enemy.ai === 'recover') {
          // Never shorten a recovery: hitting an open enemy must not speed it up.
          enemy.aiEnd = Math.max(enemy.aiEnd, state.tick + def.staggerTicks);
        }
      } else if (!inBounds(world, fx, fy) || world.tiles[fy * world.width + fx] === TILE_WALL || !isDoorOpenAt(state, world, fx, fy)) {
        events.push({ type: 'attack.clang', actor: member.id });
      } else {
        events.push({ type: 'attack.miss', actor: member.id });
      }
    }
    if (state.tick >= action.end) member.action = { kind: 'idle' };
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
      // The blow lands on the cell it was aimed at. Stepping away avoids it.
      if (p.x === enemy.targetX && p.y === enemy.targetY) {
        const target = p.members.find((m) => m.hp > 0);
        if (target) {
          const damage = randomInt(state, def.damage.min, def.damage.max);
          target.hp = Math.max(0, target.hp - damage);
          events.push({ type: 'enemy.attack.hit', enemyId: enemy.id, target: target.id, damage });
          if (!p.members.some((m) => m.hp > 0)) {
            state.status = 'dead';
            events.push({ type: 'party.died' });
          }
        }
      } else {
        events.push({ type: 'enemy.attack.miss', enemyId: enemy.id });
      }
      setAi(state, enemy, 'attack', ENEMY_ATTACK_POSE_TICKS);
      return;
    }

    case 'attack':
      if (state.tick >= enemy.aiEnd) setAi(state, enemy, 'recover', def.attack.recoverTicks);
      return;

    case 'idle': {
      if (!enemy.alerted) {
        const dx = p.x - enemy.x;
        const dy = p.y - enemy.y;
        const near = dx * dx + dy * dy <= def.sightRange * def.sightRange;
        if (near && hasLineOfSight(state, world, enemy.x, enemy.y, p.x, p.y)) {
          enemy.alerted = true;
          events.push({ type: 'enemy.alerted', enemyId: enemy.id });
        }
        return;
      }

      const adjacent = Math.abs(p.x - enemy.x) + Math.abs(p.y - enemy.y) === 1;
      if (adjacent) {
        enemy.facing = facingToward(enemy.x, enemy.y, p.x, p.y, enemy.facing);
        enemy.targetX = p.x;
        enemy.targetY = p.y;
        setAi(state, enemy, 'telegraph', def.attack.telegraphTicks);
        events.push({ type: 'enemy.telegraph', enemyId: enemy.id });
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
