/**
 * Phase 3: attributes, derived stats, experience and levels.
 */
import { describe, expect, it } from 'vitest';
import { CLASSES } from '../src/engine/classes';
import { createSession, step } from '../src/engine/sim';
import { criticalChance, damageBonus, experienceForLevel, levelForExperience, maxHealth, maxMana, maxStamina, modifier } from '../src/engine/stats';
import type { GameEvent } from '../src/engine/types';
import { validateWorld } from '../src/schema/validate';
import { compileWorld } from '../src/world/compile';
import { act, attack, fight, loadMines, minesData, run } from './helpers';

describe('stat formulas', () => {
  it('turns attributes into modifiers the usual way', () => {
    expect([3, 8, 9, 10, 11, 12, 14, 18, 20].map(modifier)).toEqual([-4, -1, -1, 0, 0, 1, 2, 4, 5]);
  });

  it('gives each class its own shape at level 1', () => {
    const at = (id: keyof typeof CLASSES) => {
      const a = CLASSES[id].defaults;
      return [maxHealth(id, 1, a), maxStamina(id, 1, a), maxMana(id, 1, a)];
    };
    expect(at('fighter')).toEqual([40, 40, 0]);
    expect(at('rogue')).toEqual([31, 46, 0]);
    expect(at('mage')).toEqual([24, 32, 30]);
    expect(at('cleric')).toEqual([33, 32, 25]);
  });

  it('grows health, stamina and mana with level', () => {
    const f = CLASSES.fighter.defaults;
    expect(maxHealth('fighter', 2, f) - maxHealth('fighter', 1, f)).toBe(8);
    expect(maxStamina('fighter', 2, f) - maxStamina('fighter', 1, f)).toBe(2);
    const m = CLASSES.mage.defaults;
    expect(maxMana('mage', 3, m) - maxMana('mage', 1, m)).toBe(10);
    expect(maxMana('fighter', 9, f)).toBe(0);
  });

  it('strength adds to damage and dexterity to critical chance, within limits', () => {
    expect(damageBonus({ ...CLASSES.fighter.defaults, strength: 14 })).toBe(2);
    expect(damageBonus({ ...CLASSES.fighter.defaults, strength: 8 })).toBe(-1);
    expect(criticalChance({ ...CLASSES.fighter.defaults, dexterity: 12 })).toBe(5);
    expect(criticalChance({ ...CLASSES.fighter.defaults, dexterity: 3 })).toBe(0);
    expect(criticalChance({ ...CLASSES.fighter.defaults, dexterity: 20 })).toBe(17);
  });

  it('asks for more experience at each level', () => {
    expect([1, 2, 3, 4, 5].map(experienceForLevel)).toEqual([0, 40, 120, 240, 400]);
    expect([0, 39, 40, 119, 120, 239, 240, 100000].map(levelForExperience)).toEqual([1, 1, 2, 2, 3, 3, 4, 20]);
  });
});

describe('characters in a session', () => {
  it('start with stats derived from class, level and attributes', () => {
    const world = loadMines();
    const hero = createSession(world).party.members[0];
    expect(hero).toMatchObject({ classId: 'fighter', level: 1, xp: 0, hp: 40, maxHp: 40, stamina: 40, maxStamina: 40 });
    expect(hero.attributes.strength).toBe(14);
  });

  it('use the class defaults when a world gives no attributes', () => {
    const data = minesData();
    delete data.characters[0].attributes;
    data.characters[0].classId = 'rogue';
    const result = validateWorld(data);
    if (!result.ok) throw new Error(result.issues[0].message);
    const hero = createSession(compileWorld(result.world)).party.members[0];
    expect(hero.attributes).toEqual(CLASSES.rogue.defaults);
    expect([hero.maxHp, hero.maxStamina]).toEqual([31, 46]);
  });

  it('can start above level 1', () => {
    const data = minesData();
    data.characters[0].level = 3;
    const result = validateWorld(data);
    if (!result.ok) throw new Error(result.issues[0].message);
    const hero = createSession(compileWorld(result.world)).party.members[0];
    expect(hero).toMatchObject({ level: 3, xp: 120, maxHp: 56, maxStamina: 44 });
  });

  it('do not copy their attributes back into the world definition', () => {
    const world = loadMines();
    const state = createSession(world);
    state.party.members[0].attributes.strength = 20;
    expect(world.def.characters[0].attributes?.strength).toBe(14);
  });

  it('reject attributes outside 3 to 20', () => {
    const data = minesData();
    data.characters[0].attributes.strength = 25;
    const result = validateWorld(data);
    expect(result.ok ? [] : result.issues.map((i) => i.code)).toEqual(['shape']);
  });
});

describe('experience and levels', () => {
  it('killing the goblin earns experience and a level', () => {
    const world = loadMines();
    const state = createSession(world, 7);
    const goblin = state.enemies[0];
    Object.assign(goblin, { x: 5, y: 13, prevX: 5, prevY: 13, alerted: true, hp: 1, ai: 'recover', aiEnd: 500 });
    const hero = state.party.members[0];
    hero.hp = 25;
    const events = act(state, world, attack(), 10);
    expect(events).toContainEqual({ type: 'xp.gained', amount: 40, enemyId: goblin.id });
    expect(events).toContainEqual({ type: 'level.up', actor: hero.id, level: 2, healthGained: 8, staminaGained: 2 });
    expect(hero).toMatchObject({ level: 2, xp: 40, maxHp: 48, hp: 33, maxStamina: 42 });
    expect(hero.attributes.strength).toBe(15);
  });

  it('a big kill can bring more than one level at once', () => {
    const world = loadMines();
    const state = createSession(world, 7);
    const chief = state.enemies[1];
    Object.assign(chief, { x: 5, y: 13, prevX: 5, prevY: 13, alerted: true, hp: 1, ai: 'recover', aiEnd: 500 });
    const events = act(state, world, attack(), 10);
    const levels = events.filter((e): e is Extract<GameEvent, { type: 'level.up' }> => e.type === 'level.up').map((e) => e.level);
    expect(levels).toEqual([2, 3]);
    const hero = state.party.members[0];
    expect(hero).toMatchObject({ level: 3, xp: 150, maxHp: 56 });
    expect(hero.attributes.strength).toBe(16);
  });

  it('the dead earn nothing', () => {
    const world = loadMines();
    const state = createSession(world, 7);
    const goblin = state.enemies[0];
    Object.assign(goblin, { x: 5, y: 13, prevX: 5, prevY: 13, alerted: true, hp: 1, ai: 'recover', aiEnd: 500 });
    // A second, fallen party member.
    state.party.members.push({ ...structuredClone(state.party.members[0]), id: 'char_fallen', hp: 0 });
    act(state, world, attack(), 10);
    expect(state.party.members.map((m) => m.xp)).toEqual([40, 0]);
  });

  it('the whole adventure takes the fighter to level 3', () => {
    const world = loadMines();
    const state = createSession(world, 7);
    state.doorsOpen.door_tunnel_hall = true;
    state.doorsOpen.door_tunnel_shaft = true;
    fight(state, world, state.enemies[0]);
    fight(state, world, state.enemies[1]);
    expect(state.party.members[0]).toMatchObject({ level: 3, xp: 190 });
  });
});

describe('critical hits', () => {
  it('happen about as often as the chance says and hit half again as hard', () => {
    const world = loadMines();
    const state = createSession(world, 11);
    const hero = state.party.members[0];
    hero.attributes.dexterity = 20; // 17 per cent
    const goblin = state.enemies[0];
    Object.assign(goblin, { x: 5, y: 13, prevX: 5, prevY: 13, alerted: true, ai: 'recover', aiEnd: 10_000_000 });
    let hits = 0;
    let crits = 0;
    for (let i = 0; i < 400; i++) {
      goblin.hp = 1000;
      hero.stamina = 40;
      const hit = [...step(state, world, [attack()]), ...run(state, world, 30)].find((e) => e.type === 'attack.hit');
      if (hit?.type !== 'attack.hit') continue;
      hits++;
      if (hit.critical) {
        crits++;
        // Blade 2-5 plus 2 for strength, half again, rounded.
        expect([6, 8, 9, 11]).toContain(hit.damage);
      } else {
        expect(hit.damage).toBeGreaterThanOrEqual(4);
        expect(hit.damage).toBeLessThanOrEqual(7);
      }
    }
    expect(hits).toBe(400);
    expect(crits / hits).toBeGreaterThan(0.1);
    expect(crits / hits).toBeLessThan(0.25);
  });
});
