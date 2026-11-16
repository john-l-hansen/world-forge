/**
 * Turns simulation events into lines for the message log.
 */
import type { GameEvent, SessionState } from '../engine/types';
import type { CompiledWorld } from '../world/compile';

export type Tone = 'plain' | 'good' | 'bad' | 'warn' | 'lore' | 'speech' | 'quest';
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
    case 'door.locked':
      return { text: 'The door is locked. It wants a key.', tone: 'plain' };
    case 'door.unlocked': {
      const key = def.items.find((i) => i.id === event.itemId);
      return { text: `The ${(key?.name ?? 'key').toLowerCase()} turns. The lock gives.`, tone: 'good' };
    }
    case 'secret.found':
      return { text: 'The stonework shifts. A hidden way opens!', tone: 'quest' };
    case 'chest.opened': {
      const chest = def.objects.find((o) => o.id === event.objectId);
      return { text: `You lift the lid of the ${(chest?.name ?? 'chest').toLowerCase()}.`, tone: 'plain' };
    }
    case 'item.gained': {
      const item = def.items.find((i) => i.id === event.itemId);
      return { text: `You take the ${(item?.name ?? 'item').toLowerCase()}.`, tone: 'good' };
    }
    case 'item.used': {
      const item = def.items.find((i) => i.id === event.itemId);
      return { text: `${heroName(event.actor)} drinks the ${(item?.name ?? 'draught').toLowerCase()}. +${event.healed} health.`, tone: 'good' };
    }
    case 'item.refused':
      if (event.reason === 'full_health') return { text: 'You are not hurt.', tone: 'plain' };
      if (event.reason === 'none_left') return { text: 'You have nothing to drink.', tone: 'plain' };
      return null;
    case 'encounter.started': {
      const encounter = def.encounters.find((e) => e.id === event.encounterId);
      return encounter?.intro ? { text: `"${encounter.intro}"`, tone: 'speech' } : null;
    }
    case 'quest.objective': {
      const objective = def.quests.find((q) => q.id === event.questId)?.objectives.find((o) => o.id === event.objectiveId);
      return objective ? { text: `Done: ${objective.description}.`, tone: 'quest' } : null;
    }
    case 'quest.completed': {
      const quest = def.quests.find((q) => q.id === event.questId);
      return quest ? { text: `Quest complete: ${quest.title}. ${quest.completionText}`.trim(), tone: 'quest' } : null;
    }
    case 'interact.nothing':
      return { text: 'Nothing to use here.', tone: 'plain' };
    case 'attack.hit':
      return event.killed
        ? { text: `You strike the ${enemyName(event.enemyId)} down!`, tone: 'good' }
        : {
            text: `${event.critical ? 'Critical! ' : ''}You ${event.kind === 'heavy' ? 'cleave' : 'hit'} the ${enemyName(event.enemyId)} for ${event.damage}.`,
            tone: event.critical ? 'quest' : 'good',
          };
    case 'xp.gained':
      return { text: `You gain ${event.amount} experience.`, tone: 'plain' };
    case 'level.up':
      return { text: `${heroName(event.actor)} reaches level ${event.level}! +${event.healthGained} health, +${event.staminaGained} stamina.`, tone: 'quest' };
    case 'attack.clang':
      return { text: 'Your blade rings off the stone.', tone: 'plain' };
    case 'enemy.alerted':
      return { text: `A ${enemyName(event.enemyId).toLowerCase()} snarls in the dark!`, tone: 'warn' };
    case 'enemy.telegraph': {
      const enemy = state.enemies.find((e) => e.id === event.enemyId);
      const attack = def.enemies.find((d) => d.id === enemy?.defId)?.attacks.find((a) => a.id === event.attackId);
      if (attack && !attack.blockable)
        return { text: `The ${enemyName(event.enemyId)} draws back for a ${attack.name}. No guard will stop it!`, tone: 'bad' };
      return { text: `The ${enemyName(event.enemyId)} rears back to ${attack?.name ?? 'strike'}!`, tone: 'warn' };
    }
    case 'stamina.low':
      return { text: 'You are too winded.', tone: 'plain' };
    case 'attack.blocked':
      return { text: `You block. The blow still costs you ${event.damage}.`, tone: 'plain' };
    case 'attack.parried':
      return { text: `Parried! The ${enemyName(event.enemyId)} reels.`, tone: 'quest' };
    case 'guard.broken':
      return { text: `Your guard is smashed aside. ${event.damage} damage!`, tone: 'bad' };
    case 'enemy.attack.dodged':
      return { text: 'You slip past the blow.', tone: 'good' };
    case 'enemy.interrupted':
      return { text: `Your blow breaks the ${enemyName(event.enemyId)}'s wind-up!`, tone: 'good' };
    case 'enemy.attack.hit':
      return { text: `The ${enemyName(event.enemyId)} hits ${heroName(event.target)} for ${event.damage}.`, tone: 'bad' };
    case 'enemy.attack.miss':
      return { text: `The ${enemyName(event.enemyId)} cuts only air.`, tone: 'good' };
    case 'encounter.cleared':
      return null;
    case 'party.died':
      return { text: 'The dark closes in.', tone: 'bad' };
    default:
      return null;
  }
}
