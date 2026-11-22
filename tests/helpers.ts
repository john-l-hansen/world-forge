import minesJson from '../src/worlds/forgotten-mines.json';
import { minesForParty } from '../src/worlds';
import { validateWorld } from '../src/schema/validate';
import { DIR_X, DIR_Y, compileWorld, type CompiledWorld } from '../src/world/compile';
import { activeMember, enemyAt, isOpenCell, partyIsBusy, step } from '../src/engine/sim';
import { loadWorld } from '../src/world/load';
import cryptJson from '../src/worlds/sunken-crypt.json';
import type { Command, EnemyState, GameEvent, SessionState } from '../src/engine/types';

export const minesData = (): any => structuredClone(minesJson);

export function loadMines(): CompiledWorld {
  const result = validateWorld(minesData());
  if (!result.ok) throw new Error(result.issues.map((i) => i.message).join('\n'));
  return compileWorld(result.world);
}

/** The party-of-four version of the Mines, validated and compiled. */
export function loadPartyMines(): CompiledWorld {
  const result = validateWorld(minesForParty(minesData()));
  if (!result.ok) throw new Error(result.issues.map((i) => i.message).join('\n'));
  return compileWorld(result.world);
}

/** The Sunken Crypt, validated and compiled through the loader. */
export function loadCrypt(): CompiledWorld {
  const result = loadWorld(structuredClone(cryptJson));
  if (!result.ok) throw new Error(result.issues.map((i) => i.message).join('\n'));
  return result.world;
}

export const HERO = 'char_fighter';

/**
 * The helpers were written for Brannoc. In a world without him, their commands
 * go to whoever the player is driving.
 */
function send(state: SessionState, world: CompiledWorld, commands: Command[]): GameEvent[] {
  const known = (id: string) => state.party.members.some((m) => m.id === id);
  return step(state, world, commands.map((c) => (c.actor === HERO && !known(HERO) ? { ...c, actor: activeMember(state).id } : c)));
}

/** Send one command, then run until the party is free again. */
export function act(state: SessionState, world: CompiledWorld, command: Command, extraTicks = 40): GameEvent[] {
  const events = send(state, world, [command]);
  for (let i = 0; i < extraTicks; i++) events.push(...step(state, world, []));
  return events;
}

/** Heavy blows on whatever is ahead until a breakable wall there gives way (at most ten). */
export function smash(state: SessionState, world: CompiledWorld): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < 10 && !events.some((e) => e.type === 'wall.broken'); i++) {
    events.push(...act(state, world, { type: 'attack', actor: HERO, kind: 'heavy' }, 70));
  }
  return events;
}

export function run(state: SessionState, world: CompiledWorld, ticks: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...step(state, world, []));
  return events;
}

export const move = (dir: 'forward' | 'back' | 'left' | 'right'): Command => ({ type: 'move', actor: HERO, dir });
export const turn = (dir: 'left' | 'right'): Command => ({ type: 'turn', actor: HERO, dir });
export const attack = (): Command => ({ type: 'attack', actor: HERO });
export const heavy = (): Command => ({ type: 'attack', actor: HERO, kind: 'heavy' });
export const block = (held: boolean): Command => ({ type: 'block', actor: HERO, held });
export const dodge = (dir?: 'forward' | 'back' | 'left' | 'right'): Command => ({ type: 'dodge', actor: HERO, dir });
export const interact = (): Command => ({ type: 'interact', actor: HERO });

// ---------------------------------------------------------------------------
// A small scripted player, used to play whole adventures in tests.
// ---------------------------------------------------------------------------

const REL = ['forward', 'right', 'back', 'left'] as const;

function dirTo(fromX: number, fromY: number, toX: number, toY: number): number {
  for (let d = 0; d < 4; d++) if (fromX + DIR_X[d] === toX && fromY + DIR_Y[d] === toY) return d;
  return -1;
}

/** Turn the party to face an absolute direction (0 north, 1 east, 2 south, 3 west). */
export function face(state: SessionState, world: CompiledWorld, dir: number): GameEvent[] {
  const events: GameEvent[] = [];
  if (dir < 0 || dir > 3) throw new Error(`cannot face direction ${dir}`);
  for (let guard = 0; guard < 4 && state.party.facing !== dir && state.status === 'playing'; guard++) {
    const diff = (dir - state.party.facing + 4) % 4;
    events.push(...act(state, world, turn(diff === 3 ? 'left' : 'right'), 12));
  }
  return events;
}

/** Shortest open path from the party to a cell, as a list of cells. */
function pathTo(state: SessionState, world: CompiledWorld, tx: number, ty: number): { x: number; y: number }[] | null {
  const w = world.width;
  const start = state.party.y * w + state.party.x;
  const goal = ty * w + tx;
  const from = new Int32Array(w * world.height).fill(-1);
  from[start] = start;
  const queue = [start];
  while (queue.length) {
    const i = queue.shift()!;
    if (i === goal) break;
    const cx = i % w;
    const cy = Math.floor(i / w);
    for (let d = 0; d < 4; d++) {
      const nx = cx + DIR_X[d];
      const ny = cy + DIR_Y[d];
      const ni = ny * w + nx;
      if (from[ni] !== -1 || !isOpenCell(state, world, nx, ny) || enemyAt(state, nx, ny)) continue;
      from[ni] = i;
      queue.push(ni);
    }
  }
  if (from[goal] === -1) return null;
  const path: { x: number; y: number }[] = [];
  for (let i = goal; i !== start; i = from[i]) path.unshift({ x: i % w, y: Math.floor(i / w) });
  return path;
}

/** Walk to a cell by the shortest open route. Throws if there is none. */
export function walkTo(state: SessionState, world: CompiledWorld, tx: number, ty: number): GameEvent[] {
  const events: GameEvent[] = [];
  // Re-plan after every step, in case something has moved into the way.
  for (let guard = 0; guard < 200 && state.status === 'playing'; guard++) {
    if (state.party.x === tx && state.party.y === ty) return events;
    const path = pathTo(state, world, tx, ty);
    if (!path) throw new Error(`no open route to (${tx}, ${ty}) from (${state.party.x}, ${state.party.y})`);
    events.push(...face(state, world, dirTo(state.party.x, state.party.y, path[0].x, path[0].y)));
    events.push(...act(state, world, move('forward'), 16));
  }
  if (state.status === 'playing') throw new Error(`could not reach (${tx}, ${ty})`);
  return events;
}

/**
 * Fight one enemy the way a careful player would: step out of every
 * wind-up, close in while it recovers, and drink a draught when hurt.
 */
export function fight(state: SessionState, world: CompiledWorld, enemy: EnemyState, tickLimit = 30000): GameEvent[] {
  const events: GameEvent[] = [];
  const hero = activeMember(state);
  for (let i = 0; i < tickLimit && enemy.ai !== 'dead' && state.status === 'playing'; i++) {
    const p = state.party;
    let command: Command | null = null;
    if (!partyIsBusy(state) && !state.buffered) {
      const dist = Math.abs(enemy.x - p.x) + Math.abs(enemy.y - p.y);
      const aimedAtUs = enemy.ai === 'telegraph' && enemy.targetX === p.x && enemy.targetY === p.y;
      const draught = Object.keys(state.inventory).find((id) => {
        const item = world.def.items.find((it) => it.id === id);
        return item?.category === 'consumable' && item.effect.type === 'heal';
      });
      if (aimedAtUs) {
        const away = dirTo(enemy.x, enemy.y, p.x, p.y);
        for (const d of [away, (away + 1) % 4, (away + 3) % 4]) {
          const nx = p.x + DIR_X[d];
          const ny = p.y + DIR_Y[d];
          if (d >= 0 && isOpenCell(state, world, nx, ny) && !enemyAt(state, nx, ny)) {
            command = move(REL[(d - p.facing + 4) % 4]);
            break;
          }
        }
      } else if (draught && hero.hp <= hero.maxHp - 20 && hero.hp <= 18 && enemy.ai !== 'telegraph') {
        command = { type: 'use', actor: HERO, itemId: draught };
      } else if (dist === 1 && enemy.ai !== 'telegraph') {
        const need = dirTo(p.x, p.y, enemy.x, enemy.y);
        if (p.facing !== need) command = turn((need - p.facing + 4) % 4 === 3 ? 'left' : 'right');
        else if (hero.stamina >= 4) command = attack();
      } else if (dist > 1 && (!enemy.alerted || enemy.ai === 'attack' || enemy.ai === 'recover')) {
        const path = adjacentPath(state, world, enemy);
        const next = path?.[0];
        if (next) {
          const d = dirTo(p.x, p.y, next.x, next.y);
          command = p.facing === d ? move('forward') : turn((d - p.facing + 4) % 4 === 3 ? 'left' : 'right');
        }
      }
    }
    events.push(...send(state, world, command ? [command] : []));
  }
  return events;
}

/** Route to any open cell next to the enemy (its own cell is never open). */
function adjacentPath(state: SessionState, world: CompiledWorld, enemy: EnemyState) {
  let best: { x: number; y: number }[] | null = null;
  for (let d = 0; d < 4; d++) {
    const path = pathTo(state, world, enemy.x + DIR_X[d], enemy.y + DIR_Y[d]);
    if (path && (!best || path.length < best.length)) best = path;
  }
  return best;
}

/**
 * A bot that plays any world it is given, knowing nothing of its layout in
 * advance: nearest thing first, it fights what it meets, picks things up,
 * opens chests and doors (unlocking those it has the key for), smashes cracked
 * walls and searches secret ones, until every main quest is done or there is
 * nothing left it can reach. Returns why it stopped.
 */
export function explore(state: SessionState, world: CompiledWorld, maxSteps = 600): 'won' | 'dead' | 'stuck' {
  const def = world.def;
  const mainDone = () => {
    const mains = def.quests.filter((q) => q.kind === 'main' && state.quests[q.id]);
    return mains.length > 0 && mains.every((q) => state.quests[q.id].completed);
  };
  const w = world.width;
  let misses = 0;
  for (let step = 0; step < maxSteps; step++) {
    if (state.status !== 'playing') return 'dead';
    if (mainDone()) return 'won';
    // How far every open cell is, walking.
    const dist = new Int32Array(w * world.height).fill(-1);
    const start = state.party.y * w + state.party.x;
    dist[start] = 0;
    const queue = [start];
    while (queue.length) {
      const i = queue.shift()!;
      for (let d = 0; d < 4; d++) {
        const nx = (i % w) + DIR_X[d];
        const ny = Math.floor(i / w) + DIR_Y[d];
        const ni = ny * w + nx;
        if (nx < 0 || ny < 0 || nx >= w || ny >= world.height || dist[ni] !== -1 || !isOpenCell(state, world, nx, ny) || enemyAt(state, nx, ny)) continue;
        dist[ni] = dist[i] + 1;
        queue.push(ni);
      }
    }
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= world.height ? -1 : dist[y * w + x]);
    /** The nearest reachable cell beside (x, y), and the way to face from it. */
    const besides = (x: number, y: number) => {
      let best: { x: number; y: number; d: number; face: number } | null = null;
      for (let k = 0; k < 4; k++) {
        const sx = x - DIR_X[k];
        const sy = y - DIR_Y[k];
        const d = at(sx, sy);
        if (d >= 0 && (!best || d < best.d)) best = { x: sx, y: sy, d, face: k };
      }
      return best;
    };
    type Task = { d: number; run: () => void };
    const tasks: Task[] = [];
    for (const enemy of state.enemies) {
      if (enemy.ai === 'dead') continue;
      const spot = besides(enemy.x, enemy.y);
      const near = Math.abs(enemy.x - state.party.x) + Math.abs(enemy.y - state.party.y);
      if (spot || near === 1) tasks.push({ d: enemy.alerted ? -1 : (spot?.d ?? 0), run: () => fight(state, world, enemy, 12000) });
    }
    for (const p of world.pickups) {
      if (state.pickupsTaken[p.id]) continue;
      const d = at(p.x, p.y);
      if (d >= 0) tasks.push({ d, run: () => walkTo(state, world, p.x, p.y) });
    }
    for (const c of world.chests) {
      if (state.chestsOpened[c.id]) continue;
      const spot = besides(c.x, c.y);
      if (spot) tasks.push({ d: spot.d, run: () => (walkTo(state, world, spot.x, spot.y), face(state, world, spot.face), act(state, world, interact(), 4)) });
    }
    for (const door of world.doors) {
      if (door.def.kind === 'archway' || state.doorsOpen[door.def.id]) continue;
      const lock = door.def.lock;
      if (lock && !state.doorsUnlocked[door.def.id] && !state.inventory[lock.keyItemId]) continue;
      const spot = besides(door.x, door.y);
      if (!spot) continue;
      const open = door.def.kind === 'breakable' ? () => smash(state, world) : () => act(state, world, interact(), 4);
      tasks.push({ d: spot.d + 0.5, run: () => (walkTo(state, world, spot.x, spot.y), face(state, world, spot.face), open()) });
    }
    if (tasks.length === 0) return 'stuck';
    try {
      tasks.sort((a, b) => a.d - b.d)[0].run();
      misses = 0;
    } catch {
      // Something moved into the way mid-walk. Look again; give up only if it keeps happening.
      if (++misses > 25) return 'stuck';
    }
  }
  return 'stuck';
}
