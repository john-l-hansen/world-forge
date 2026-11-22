/**
 * The message log speaks to the player as the character they are driving and
 * names everyone else. These lines are part of the game's feedback.
 */
import { describe, expect, it } from 'vitest';
import { describeEvent } from '../src/game/messages';
import { createSession, step } from '../src/engine/sim';
import { validateWorld } from '../src/schema/validate';
import { compileWorld } from '../src/world/compile';
import { WORLDS } from '../src/worlds';
import { loadMines, loadPartyMines } from './helpers';

describe('worlds on offer', () => {
  it('every adventure on the title screen validates and compiles', () => {
    for (const entry of WORLDS) {
      const result = validateWorld(entry.data);
      expect(result.ok, entry.key).toBe(true);
      if (result.ok) expect(compileWorld(result.world).def.settings.startingPartyIds.length).toBeGreaterThan(0);
    }
    expect(WORLDS.map((w) => w.key)).toEqual(['solo', 'party', 'crypt']);
  });
});

describe('message log', () => {
  it('says "you" for the driven character and names a companion', () => {
    const world = loadPartyMines();
    const state = createSession(world, 1);
    const enemyId = state.enemies[0].id;
    const mine = describeEvent({ type: 'attack.hit', actor: 'char_fighter', enemyId, damage: 4, killed: false, kind: 'light', critical: false }, state, world);
    const theirs = describeEvent({ type: 'attack.hit', actor: 'char_rogue', enemyId, damage: 3, killed: false, kind: 'light', critical: false }, state, world);
    expect(mine).toEqual({ text: 'You hit the Goblin for 4.', tone: 'good' });
    expect(theirs).toEqual({ text: 'Sela hits the Goblin for 3.', tone: 'plain' });
    const kill = describeEvent({ type: 'attack.hit', actor: 'char_rogue', enemyId, damage: 9, killed: true, kind: 'heavy', critical: false }, state, world);
    expect(kill?.text).toBe('Sela strikes the Goblin down!');
  });

  it('says so when a body is torn apart, and when bones are smashed', () => {
    const world = loadPartyMines();
    const state = createSession(world, 1);
    const enemy = state.enemies[0];
    enemy.gore = true;
    const torn = describeEvent({ type: 'attack.hit', actor: 'char_fighter', enemyId: enemy.id, damage: 12, killed: true, kind: 'heavy', critical: false }, state, world);
    expect(torn?.text).toBe('You hew the Goblin apart. It comes down in pieces.');
  });

  it('names the wound and the healing of an injury', () => {
    const world = loadPartyMines();
    const state = createSession(world, 1);
    expect(describeEvent({ type: 'member.injured', actor: 'char_rogue', kind: 'leg' }, state, world)?.text).toMatch(/^Sela's leg is laid open/);
    expect(describeEvent({ type: 'member.recovered', actor: 'char_fighter', kind: 'arm' }, state, world)).toEqual({ text: 'Your arm has knit.', tone: 'good' });
  });

  it('follows a change of control', () => {
    const world = loadPartyMines();
    const state = createSession(world, 1);
    const events = step(state, world, [{ type: 'control', actor: 'char_rogue' }]);
    const control = events.find((e) => e.type === 'party.control')!;
    expect(describeEvent(control, state, world)?.text).toBe('Sela takes the lead.');
    const enemyId = state.enemies[0].id;
    const hit = { type: 'attack.hit', enemyId, damage: 4, killed: false, kind: 'light', critical: false } as const;
    expect(describeEvent({ ...hit, actor: 'char_rogue' }, state, world)?.text).toMatch(/^You hit/);
    expect(describeEvent({ ...hit, actor: 'char_fighter' }, state, world)?.text).toMatch(/^Brannoc hits/);
  });

  it('keeps a companion\'s fumbles out of the log', () => {
    const world = loadPartyMines();
    const state = createSession(world, 1);
    expect(describeEvent({ type: 'attack.clang', actor: 'char_rogue' }, state, world)).toBeNull();
    expect(describeEvent({ type: 'stamina.low', actor: 'char_rogue' }, state, world)).toBeNull();
    expect(describeEvent({ type: 'spell.refused', actor: 'char_mage', spellId: 'spell_storm_bolt', reason: 'no_mana' }, state, world)).toBeNull();
    expect(describeEvent({ type: 'spell.cast', actor: 'char_mage', spellId: 'spell_storm_bolt' }, state, world)).toBeNull();
    expect(describeEvent({ type: 'attack.clang', actor: 'char_fighter' }, state, world)?.text).toMatch(/rings off the stone/);
  });

  it('reports healing by who gave it and who received it', () => {
    const world = loadPartyMines();
    const state = createSession(world, 1);
    const heal = { type: 'spell.healed', spellId: 'spell_mend', healed: 14 } as const;
    expect(describeEvent({ ...heal, actor: 'char_cleric', target: 'char_fighter' }, state, world)?.text).toBe('Maren mends you. +14 health.');
    expect(describeEvent({ ...heal, actor: 'char_cleric', target: 'char_rogue' }, state, world)?.text).toBe('Maren mends Sela. +14 health.');
    step(state, world, [{ type: 'control', actor: 'char_cleric' }]);
    expect(describeEvent({ ...heal, actor: 'char_cleric', target: 'char_cleric' }, state, world)?.text).toBe('You mend yourself. +14 health.');
    expect(describeEvent({ type: 'spell.refused', actor: 'char_cleric', spellId: 'spell_mend', reason: 'no_target' }, state, world)?.text).toBe('No one is hurt.');
  });

  it('reads the same as before for a lone adventurer', () => {
    const world = loadMines();
    const state = createSession(world, 1);
    const enemyId = state.enemies[0].id;
    expect(describeEvent({ type: 'xp.gained', amount: 40, enemyId }, state, world)?.text).toBe('You gain 40 experience.');
    expect(describeEvent({ type: 'party.died' }, state, world)?.text).toBe('The dark closes in. No one will come looking.');
    expect(describeEvent({ type: 'spell.cast', actor: 'char_fighter', spellId: 'spell_storm_bolt', itemId: 'item_storm_scroll' }, state, world)?.text).toBe('Brannoc reads the scroll. Storm bolt gathers!');
  });
});
