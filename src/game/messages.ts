/**
 * Turns simulation events into lines for the message log.
 */
import type { GameEvent, SessionState } from '../engine/types';
import type { CompiledWorld } from '../world/compile';

export type Tone = 'plain' | 'good' | 'bad' | 'warn' | 'lore';
export interface LogLine {
  text: string;
  tone: Tone;
}

export function describeEvent(event: GameEvent, state: SessionState, world: CompiledWorld): LogLine | null {
  const def = world.def;
  const enemyName = (instanceId: string) => {
    const enemy = state.enemies.find((e) => e.id === instanceId);
    return def.enemies.find((d) => d.id === enemy?.defId)?.name ?? 'creature';
  };
  const heroName = (charId: string) => def.characters.find((c) => c.id === charId)?.name ?? 'You';

  switch (event.type) {
    case 'room.entered': {
      if (!event.firstVisit) return null;
      const room = def.rooms.find((r) => r.id === event.roomId);
      return room ? { text: `${room.name}. ${room.description}`.trim(), tone: 'lore' } : null;
    }
    case 'party.bumped':
      if (event.reason === 'door') return { text: 'The door is shut. Press F to open it.', tone: 'plain' };
      if (event.reason === 'object') return { text: 'Something is in the way.', tone: 'plain' };
      return null;
    case 'door.opened':
      return { text: 'The door grinds upward.', tone: 'plain' };
    case 'door.closed':
      return { text: 'The door drops shut.', tone: 'plain' };
    case 'interact.nothing':
      return { text: 'Nothing to use here.', tone: 'plain' };
    case 'attack.hit':
      return event.killed
        ? { text: `You strike the ${enemyName(event.enemyId)} down!`, tone: 'good' }
        : { text: `You hit the ${enemyName(event.enemyId)} for ${event.damage}.`, tone: 'good' };
    case 'attack.clang':
      return { text: 'Your blade rings off the stone.', tone: 'plain' };
    case 'enemy.alerted':
      return { text: `A ${enemyName(event.enemyId).toLowerCase()} snarls in the dark!`, tone: 'warn' };
    case 'enemy.telegraph':
      return { text: `The ${enemyName(event.enemyId)} rears back to strike!`, tone: 'warn' };
    case 'enemy.attack.hit':
      return { text: `The ${enemyName(event.enemyId)} hits ${heroName(event.target)} for ${event.damage}.`, tone: 'bad' };
    case 'enemy.attack.miss':
      return { text: `The ${enemyName(event.enemyId)} cuts only air.`, tone: 'good' };
    case 'encounter.cleared':
      return { text: 'The mine falls silent. The way is clear.', tone: 'lore' };
    case 'party.died':
      return { text: 'The dark closes in.', tone: 'bad' };
    default:
      return null;
  }
}
