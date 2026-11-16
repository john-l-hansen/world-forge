/**
 * Phase 3: equipment slots, armour and defence.
 */
import { describe, expect, it } from 'vitest';
import { createSession, defenceOf, deserializeSession, serializeSession, step } from '../src/engine/sim';
import type { Command, GameEvent } from '../src/engine/types';
import { validateWorld } from '../src/schema/validate';
import { HERO, act, attack, face, interact, loadMines, minesData, run, walkTo } from './helpers';

const types = (events: GameEvent[]) => events.map((e) => e.type);
const equip = (itemId: string): Command => ({ type: 'equip', actor: HERO, itemId });
const unequip = (slot: 'mainHand' | 'offHand' | 'body'): Command => ({ type: 'unequip', actor: HERO, slot });
const codes = (data: unknown) => {
  const r = validateWorld(data);
  return r.ok ? [] : r.issues.map((i) => i.code);
};

describe('equipment', () => {
  it('a character starts with what the world gives them', () => {
    const world = loadMines();
    const hero = createSession(world).party.members[0];
    expect(hero.equipment).toEqual({ mainHand: 'item_short_sword' });
    expect(defenceOf(world, hero)).toBe(0);
  });

  it('armour found for an empty slot is put straight on', () => {
    const world = loadMines();
    const state = createSession(world);
    state.enemies[0].ai = 'dead';
    state.doorsOpen.door_tunnel_hall = true;
    state.doorsOpen.door_hall_storeroom = true;
    const events = walkTo(state, world, 11, 1);
    expect(events).toContainEqual({ type: 'item.equipped', actor: HERO, itemId: 'item_wooden_shield', slot: 'offHand', auto: true });
    const hero = state.party.members[0];
    expect(hero.equipment.offHand).toBe('item_wooden_shield');
    expect(state.inventory.item_wooden_shield).toBeUndefined();
    expect(defenceOf(world, hero)).toBe(1);
  });

  it('can be taken off and put back on', () => {
    const world = loadMines();
    const state = createSession(world);
    const hero = state.party.members[0];
    state.inventory.item_studded_jerkin = 1;
    expect(act(state, world, equip('item_studded_jerkin'), 2)).toContainEqual({ type: 'item.equipped', actor: HERO, itemId: 'item_studded_jerkin', slot: 'body', auto: false });
    expect(defenceOf(world, hero)).toBe(2);
    expect(state.inventory).toEqual({});
    expect(act(state, world, unequip('body'), 2)).toContainEqual({ type: 'item.unequipped', actor: HERO, itemId: 'item_studded_jerkin', slot: 'body' });
    expect(defenceOf(world, hero)).toBe(0);
    expect(state.inventory).toEqual({ item_studded_jerkin: 1 });
    expect(types(act(state, world, unequip('body'), 2))).toEqual([]);
  });

  it('refuses things that cannot be worn, or that the party does not carry', () => {
    const world = loadMines();
    const state = createSession(world);
    state.inventory.item_gold_pouch = 1;
    expect(types(act(state, world, equip('item_gold_pouch'), 2))).toEqual(['item.refused']);
    expect(types(act(state, world, equip('item_wooden_shield'), 2))).toEqual(['item.refused']);
    expect(state.party.members[0].equipment).toEqual({ mainHand: 'item_short_sword' });
  });

  it('armour takes its defence off every blow, but never below 1', () => {
    const hit = (defenceItems: string[]) => {
      const world = loadMines();
      const state = createSession(world, 5);
      const hero = state.party.members[0];
      for (const id of defenceItems) {
        state.inventory[id] = 1;
        act(state, world, equip(id), 2);
      }
      const goblin = state.enemies[0];
      Object.assign(goblin, { x: 5, y: 13, prevX: 5, prevY: 13, facing: 2, alerted: true });
      const events: GameEvent[] = [];
      for (let i = 0; i < 200 && hero.hp === 40; i++) events.push(...step(state, world, []));
      const blow = events.find((e) => e.type === 'enemy.attack.hit');
      if (blow?.type !== 'enemy.attack.hit') throw new Error('no blow');
      return blow.damage;
    };
    const bare = hit([]);
    const armoured = hit(['item_studded_jerkin', 'item_wooden_shield']);
    expect(bare).toBeGreaterThanOrEqual(4);
    expect(armoured).toBe(bare - 3);

    // A blow weaker than the armour still does 1.
    const world = loadMines();
    const state = createSession(world, 5);
    const hero = state.party.members[0];
    state.inventory.item_studded_jerkin = 1;
    act(state, world, equip('item_studded_jerkin'), 2);
    world.def.enemies[0].attacks[0].damage = { min: 1, max: 1 };
    Object.assign(state.enemies[0], { x: 5, y: 13, prevX: 5, prevY: 13, facing: 2, alerted: true });
    for (let i = 0; i < 200 && hero.hp === 40; i++) step(state, world, []);
    expect(hero.hp).toBe(39);
  });

  it('with the sword put away, the character fights with bare hands', () => {
    const world = loadMines();
    const state = createSession(world, 3);
    act(state, world, unequip('mainHand'), 2);
    expect(state.inventory).toEqual({ item_short_sword: 1 });
    const goblin = state.enemies[0];
    Object.assign(goblin, { x: 5, y: 13, prevX: 5, prevY: 13, alerted: true, ai: 'recover', aiEnd: 100000, hp: 1000 });
    for (let i = 0; i < 12; i++) {
      const hit = [...step(state, world, [attack()]), ...run(state, world, 30)].find((e) => e.type === 'attack.hit');
      if (hit?.type !== 'attack.hit') throw new Error('no hit');
      if (!hit.critical) {
        // Fists do 1 to 2, plus 2 for strength.
        expect(hit.damage).toBeGreaterThanOrEqual(3);
        expect(hit.damage).toBeLessThanOrEqual(4);
      }
    }
    act(state, world, equip('item_short_sword'), 2);
    expect(state.party.members[0].equipment.mainHand).toBe('item_short_sword');
  });

  it('survives a save and reload', () => {
    const world = loadMines();
    const state = createSession(world);
    walkTo(state, world, 5, 9);
    face(state, world, 1);
    act(state, world, interact());
    walkTo(state, world, 8, 9);
    face(state, world, 2);
    act(state, world, interact());
    const restored = deserializeSession(serializeSession(state));
    expect(restored.party.members[0].equipment).toEqual({ mainHand: 'item_short_sword', body: 'item_studded_jerkin' });
    expect(defenceOf(world, restored.party.members[0])).toBe(2);
  });
});

describe('equipment in validation', () => {
  it('rejects an item in a slot where it does not belong', () => {
    const shieldOnHead = minesData();
    shieldOnHead.characters[0].equipment.head = 'item_wooden_shield';
    expect(codes(shieldOnHead)).toContain('missing_reference');
    const swordAsArmour = minesData();
    swordAsArmour.characters[0].equipment.body = 'item_short_sword';
    expect(codes(swordAsArmour)).toContain('missing_reference');
    const jerkinAsWeapon = minesData();
    jerkinAsWeapon.characters[0].equipment.mainHand = 'item_studded_jerkin';
    expect(codes(jerkinAsWeapon)).toContain('missing_reference');
  });

  it('rejects equipment that does not exist', () => {
    const data = minesData();
    data.characters[0].equipment.feet = 'item_seven_league_boots';
    expect(codes(data)).toContain('missing_reference');
  });

  it('accepts a character who starts fully armoured, or with nothing at all', () => {
    const armoured = minesData();
    armoured.characters[0].equipment = { mainHand: 'item_short_sword', offHand: 'item_wooden_shield', body: 'item_studded_jerkin' };
    expect(codes(armoured)).toEqual([]);
    const bare = minesData();
    bare.characters[0].equipment = {};
    expect(codes(bare)).toEqual([]);
  });

  it('rejects slots the engine does not know', () => {
    const data = minesData();
    data.items.find((i: any) => i.id === 'item_wooden_shield').slot = 'tail';
    expect(codes(data)).toContain('shape');
  });
});
