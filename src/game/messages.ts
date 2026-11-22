/**
 * Turns simulation events into lines for the message log.
 */
import { activeMember } from '../engine/sim';
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
  // The log speaks to the player as the character they are driving, and names everyone else.
  const you = activeMember(state).id;
  const alone = state.party.members.length === 1;
  /** "You hit" for the driven character, "Sela hits" for a companion. */
  const does = (charId: string, verb: string, theirs = `${verb}s`) => (charId === you ? `You ${verb}` : `${heroName(charId)} ${theirs}`);
  const spellName = (spellId: string) => (def.spells.find((sp) => sp.id === spellId)?.name ?? 'spell').toLowerCase();

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
    case 'item.equipped': {
      const item = def.items.find((i) => i.id === event.itemId);
      const verb = event.slot === 'mainHand' ? 'draw' : event.slot === 'offHand' ? 'take up' : 'put on';
      return { text: `${does(event.actor, verb)} the ${(item?.name ?? 'item').toLowerCase()}.`, tone: 'good' };
    }
    case 'item.unequipped': {
      const item = def.items.find((i) => i.id === event.itemId);
      return { text: `${does(event.actor, 'put')} the ${(item?.name ?? 'item').toLowerCase()} away.`, tone: 'plain' };
    }
    case 'item.used': {
      const item = def.items.find((i) => i.id === event.itemId);
      return { text: `${heroName(event.actor)} drinks the ${(item?.name ?? 'draught').toLowerCase()}. +${event.healed} health.`, tone: 'good' };
    }
    case 'item.refused':
      if (event.reason === 'full_health') return { text: 'You are not hurt.', tone: 'plain' };
      if (event.reason === 'none_left') {
        const item = def.items.find((i) => i.id === event.itemId);
        const scroll = item?.category === 'consumable' && item.effect.type === 'cast';
        return { text: scroll ? 'You have no scroll to read.' : 'You have nothing to drink.', tone: 'plain' };
      }
      if (event.reason === 'no_target') return { text: 'There is nothing ahead to strike. You keep the scroll.', tone: 'plain' };
      return null;
    case 'spell.cast': {
      const spell = def.spells.find((sp) => sp.id === event.spellId);
      if (event.itemId) return { text: `${heroName(event.actor)} reads the scroll. ${spell?.name ?? 'Power'} gathers!`, tone: 'speech' };
      // A companion's spell is reported when it lands, not when it starts.
      return event.actor === you ? { text: `You speak the words of ${spellName(event.spellId)}.`, tone: 'speech' } : null;
    }
    case 'spell.healed': {
      const whom = event.target === event.actor ? (event.actor === you ? 'yourself' : 'their own wounds') : event.target === you ? 'you' : heroName(event.target);
      return { text: `${does(event.actor, 'mend')} ${whom}. +${event.healed} health.`, tone: 'good' };
    }
    case 'spell.refused':
      if (event.actor !== you) return null;
      if (event.reason === 'no_mana') return { text: `You have not the mana for ${spellName(event.spellId)}.`, tone: 'plain' };
      if (event.reason === 'no_target') {
        const heals = def.spells.find((sp) => sp.id === event.spellId)?.shape === 'heal';
        return { text: heals ? 'No one is hurt.' : 'There is nothing ahead to strike.', tone: 'plain' };
      }
      return null;
    case 'party.control':
      return { text: `${heroName(event.actor)} takes the lead.`, tone: 'lore' };
    case 'member.row':
      return { text: `${does(event.actor, 'move')} to the ${event.row} row.`, tone: 'plain' };
    case 'member.fell':
      return { text: `${heroName(event.actor)} falls!`, tone: 'bad' };
    case 'attack.out_of_reach':
      return event.actor === you ? { text: 'You cannot reach from the back row.', tone: 'plain' } : null;
    case 'spell.hit': {
      const spell = def.spells.find((sp) => sp.id === event.spellId);
      return event.killed
        ? { text: `The ${(spell?.name ?? 'spell').toLowerCase()} destroys the ${enemyName(event.enemyId)}!`, tone: 'good' }
        : { text: `The ${(spell?.name ?? 'spell').toLowerCase()} strikes the ${enemyName(event.enemyId)} for ${event.damage}.`, tone: 'good' };
    }
    case 'spell.fizzled':
      return { text: 'The spell finds nothing and fades.', tone: 'plain' };
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
      return quest ? { text: `${quest.kind === 'side' ? 'Side quest' : 'Quest'} complete: ${quest.title}. ${quest.completionText}`.trim(), tone: 'quest' } : null;
    }
    case 'interact.nothing':
      return { text: 'Nothing to use here.', tone: 'plain' };
    case 'attack.hit':
      return event.killed
        ? { text: `${does(event.actor, 'strike')} the ${enemyName(event.enemyId)} down!`, tone: 'good' }
        : {
            text: `${event.critical ? 'Critical! ' : ''}${event.kind === 'heavy' ? does(event.actor, 'cleave') : does(event.actor, 'hit')} the ${enemyName(event.enemyId)} for ${event.damage}.`,
            // A companion's ordinary blows are reported quietly.
            tone: event.critical ? 'quest' : event.actor === you ? 'good' : 'plain',
          };
    case 'xp.gained':
      return { text: alone ? `You gain ${event.amount} experience.` : `Each of you gains ${event.amount} experience.`, tone: 'plain' };
    case 'level.up':
      return { text: `${heroName(event.actor)} reaches level ${event.level}! +${event.healthGained} health, +${event.staminaGained} stamina.`, tone: 'quest' };
    case 'attack.clang':
      return event.actor === you ? { text: 'Your blade rings off the stone.', tone: 'plain' } : null;
    case 'enemy.alerted': {
      const enemy = state.enemies.find((e) => e.id === event.enemyId);
      const line = def.enemies.find((d) => d.id === enemy?.defId)?.alertText;
      return { text: line ?? `A ${enemyName(event.enemyId).toLowerCase()} snarls in the dark!`, tone: 'warn' };
    }
    case 'enemy.telegraph': {
      const enemy = state.enemies.find((e) => e.id === event.enemyId);
      const attack = def.enemies.find((d) => d.id === enemy?.defId)?.attacks.find((a) => a.id === event.attackId);
      if (attack && !attack.blockable)
        return { text: `The ${enemyName(event.enemyId)} draws back for a ${attack.name}. No guard will stop it!`, tone: 'bad' };
      // An attack's name is a noun ("chop", "raking cut"), so the line reads for any world's attacks.
      return { text: `The ${enemyName(event.enemyId)} rears back for a ${attack?.name ?? 'blow'}!`, tone: 'warn' };
    }
    case 'stamina.low':
      return event.actor === you ? { text: 'You are too winded.', tone: 'plain' } : null;
    case 'attack.blocked':
      if (event.shieldId) {
        const who = event.target === you ? 'Your shield' : `${heroName(event.target)}'s shield`;
        return { text: event.damage === 0 ? `${who} takes the blow. No harm done.` : `${who} takes the blow. Only ${event.damage} gets through.`, tone: 'good' };
      }
      return { text: `${does(event.target, 'block')}. The blow still costs ${event.target === you ? 'you' : 'them'} ${event.damage}.`, tone: 'plain' };
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
      return { text: alone ? 'The dark closes in.' : 'The last of you falls. The dark closes in.', tone: 'bad' };
    default:
      return null;
  }
}
