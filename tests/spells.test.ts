/**
 * Spells and the scrolls that cast them.
 */
import { describe, expect, it } from 'vitest';
import { createSession, serializeSession, spellTarget, step } from '../src/engine/sim';
import type { Command, GameEvent } from '../src/engine/types';
import { validateWorld } from '../src/schema/validate';
import { HERO, act, loadMines, minesData, run, turn, walkTo } from './helpers';

const types = (events: GameEvent[]) => events.map((e) => e.type);
const read = (): Command => ({ type: 'use', actor: HERO, itemId: 'item_storm_scroll' });

/** Party at (5, 15) facing north up the entrance, holding one scroll. */
function setup(seed = 3) {
  const world = loadMines();
  const state = createSession(world, seed);
  act(state, world, { type: 'move', actor: HERO, dir: 'back' }, 20);
  state.inventory.item_storm_scroll = 1;
  const goblin = state.enemies[0];
  const place = (x: number, y: number) => Object.assign(goblin, { x, y, prevX: x, prevY: y, ai: 'recover', aiEnd: 100000, alerted: true });
  return { world, state, goblin, place, spell: world.def.spells[0] };
}

describe('spell scrolls', () => {
  it('the scroll lies in the mine hall and is picked up', () => {
    const world = loadMines();
    const state = createSession(world);
    state.enemies[0].ai = 'dead';
    state.doorsOpen.door_tunnel_hall = true;
    expect(walkTo(state, world, 2, 5)).toContainEqual({ type: 'item.gained', itemId: 'item_storm_scroll', from: 'pickup' });
    expect(state.inventory.item_storm_scroll).toBe(1);
  });

  it('strikes the first enemy straight ahead after a short cast', () => {
    const { world, state, goblin, place } = setup();
    place(5, 12);
    const start = step(state, world, [read()]);
    start.push(...step(state, world, []));
    expect(types(start)).toEqual(['spell.cast']);
    expect(state.inventory.item_storm_scroll).toBeUndefined();
    expect(state.party.members[0].action.kind).toBe('cast');
    expect(types(run(state, world, 10))).toEqual([]);
    const hit = run(state, world, 12).find((e) => e.type === 'spell.hit');
    if (hit?.type !== 'spell.hit') throw new Error('no hit');
    expect(hit.enemyId).toBe(goblin.id);
    expect(hit.damage).toBeGreaterThanOrEqual(14);
    expect(hit.damage).toBeLessThanOrEqual(20);
    expect(goblin.hp).toBe(24 - hit.damage);
  });

  it('reaches as far as its range and no further', () => {
    const { world, state, place, spell } = setup();
    // The party is at (5, 15) looking north: the tunnel runs straight ahead.
    place(5, 10);
    expect(spellTarget(state, world, spell)).not.toBeNull();
    place(5, 9);
    expect(spellTarget(state, world, spell)).toBeNull();
  });

  it('does not pass through walls or closed doors', () => {
    const { world, state, place, spell } = setup();
    walkTo(state, world, 5, 7);
    place(5, 5);
    expect(spellTarget(state, world, spell)).toBeNull();
    state.doorsOpen.door_tunnel_hall = true;
    expect(spellTarget(state, world, spell)?.x).toBe(5);
    act(state, world, turn('right'), 12);
    expect(spellTarget(state, world, spell)).toBeNull();
  });

  it('is kept when there is nothing to strike', () => {
    const { world, state } = setup();
    expect(act(state, world, read(), 3)).toContainEqual({ type: 'item.refused', itemId: 'item_storm_scroll', reason: 'no_target' });
    expect(state.inventory.item_storm_scroll).toBe(1);
  });

  it('fades if the target leaves the line during the cast', () => {
    const { world, state, place } = setup();
    place(5, 12);
    step(state, world, [read()]);
    run(state, world, 5);
    place(3, 12);
    expect(types(run(state, world, 20))).toContain('spell.fizzled');
  });

  it("breaks a goblin's wind-up but not the chief's", () => {
    const g = setup();
    g.place(5, 14);
    Object.assign(g.goblin, { ai: 'telegraph', aiStart: g.state.tick, aiEnd: g.state.tick + 34, targetX: 5, targetY: 15 });
    g.goblin.hp = 100;
    const a = [...step(g.state, g.world, [read()]), ...run(g.state, g.world, 24)];
    expect(types(a)).toContain('enemy.interrupted');

    const c = setup();
    const chief = c.state.enemies[1];
    Object.assign(chief, { x: 5, y: 14, prevX: 5, prevY: 14, alerted: true, ai: 'telegraph', attackId: 'cleave', aiStart: c.state.tick, aiEnd: c.state.tick + 44, targetX: 5, targetY: 15 });
    c.state.enemies[0].ai = 'dead';
    const b = [...step(c.state, c.world, [read()]), ...run(c.state, c.world, 24)];
    expect(types(b)).toContain('spell.hit');
    expect(types(b)).not.toContain('enemy.interrupted');
  });

  it('a kill by spell earns experience and counts for the quest', () => {
    const { world, state } = setup();
    state.enemies[0].ai = 'dead';
    const chief = state.enemies[1];
    Object.assign(chief, { x: 5, y: 12, prevX: 5, prevY: 12, alerted: true, ai: 'recover', aiEnd: 100000, hp: 5 });
    state.quests.quest_clear_mines.done.find_key = true;
    const events = [...step(state, world, [read()]), ...run(state, world, 24)];
    expect(types(events)).toEqual(expect.arrayContaining(['spell.hit', 'enemy.died', 'xp.gained', 'level.up', 'encounter.cleared', 'quest.completed']));
  });

  it('the party cannot act while casting', () => {
    const { world, state, place } = setup();
    place(5, 12);
    step(state, world, [read()]);
    run(state, world, 3);
    step(state, world, [{ type: 'move', actor: HERO, dir: 'forward' }]);
    run(state, world, 8);
    expect([state.party.x, state.party.y]).toEqual([5, 15]);
  });

  it('is deterministic', () => {
    const play = () => {
      const { world, state, place } = setup(9);
      place(5, 13);
      step(state, world, [read()]);
      run(state, world, 60);
      return serializeSession(state);
    };
    expect(play()).toBe(play());
  });
});

describe('spells in validation', () => {
  const codes = (data: unknown) => {
    const r = validateWorld(data);
    return r.ok ? [] : r.issues.map((i) => i.code);
  };

  it('rejects a scroll that casts a missing spell', () => {
    const data = minesData();
    data.items.find((i: any) => i.id === 'item_storm_scroll').effect.spellId = 'spell_meteor';
    expect(codes(data)).toContain('missing_reference');
  });

  it('rejects spell shapes and elements the engine does not know', () => {
    const shape = minesData();
    shape.spells[0].shape = 'black_hole';
    expect(codes(shape)).toContain('shape');
    const element = minesData();
    element.spells[0].element = 'javascript';
    expect(codes(element)).toContain('shape');
  });

  it('accepts a world with no spells at all', () => {
    const data = minesData();
    data.spells = [];
    data.items = data.items.filter((i: any) => i.id !== 'item_storm_scroll');
    data.objects = data.objects.filter((o: any) => o.id !== 'object_hall_scroll');
    const hall = data.rooms.find((r: any) => r.id === 'room_mine_hall');
    hall.objectIds = hall.objectIds.filter((o: string) => o !== 'object_hall_scroll');
    expect(codes(data)).toEqual([]);
  });
});
