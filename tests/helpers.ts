import minesJson from '../src/worlds/forgotten-mines.json';
import { validateWorld } from '../src/schema/validate';
import { DIR_X, DIR_Y, compileWorld, type CompiledWorld } from '../src/world/compile';
import { enemyAt, isOpenCell, partyIsBusy, step } from '../src/engine/sim';
import type { Command, EnemyState, GameEvent, SessionState } from '../src/engine/types';

export const minesData = (): any => structuredClone(minesJson);

export function loadMines(): CompiledWorld {
  const result = validateWorld(minesData());
  if (!result.ok) throw new Error(result.issues.map((i) => i.message).join('\n'));
  return compileWorld(result.world);
}

export const HERO = 'char_fighter';

/** Send one command, then run until the party is free again. */
export function act(state: SessionState, world: CompiledWorld, command: Command, extraTicks = 40): GameEvent[] {
  const events = step(state, world, [command]);
  for (let i = 0; i < extraTicks; i++) events.push(...step(state, world, []));
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
  const hero = state.party.members[0];
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
    events.push(...step(state, world, command ? [command] : []));
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
