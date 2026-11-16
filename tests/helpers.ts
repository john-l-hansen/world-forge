import minesJson from '../src/worlds/forgotten-mines.json';
import { validateWorld } from '../src/schema/validate';
import { compileWorld, type CompiledWorld } from '../src/world/compile';
import { step } from '../src/engine/sim';
import type { Command, GameEvent, SessionState } from '../src/engine/types';

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
export const interact = (): Command => ({ type: 'interact', actor: HERO });
