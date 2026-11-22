/**
 * Lasting injuries: hard blows can leave one, each has a rule effect, and
 * they heal only with time (healing magic halves what is left).
 */
import { describe, expect, it } from 'vitest';
import { createSession, hasInjury, manaCostFor, partyMoveTicks, step } from '../src/engine/sim';
import { INJURY_TICKS, MOVE_TICKS, type GameEvent, type InjuryKind, type SessionState } from '../src/engine/types';
import { HERO, act, explore, loadCrypt, loadMines, loadPartyMines } from './helpers';

const N = 0;
const injure = (state: SessionState, kind: InjuryKind, memberIndex = 0) => state.party.members[memberIndex].injuries.push({ kind, until: state.tick + INJURY_TICKS });

/** Put the first goblin, unaware and tough, in front of the party. */
function dummy(state: SessionState) {
  const enemy = state.enemies[0];
  enemy.x = state.party.x;
  enemy.y = state.party.y - 1;
  enemy.hp = enemy.maxHp = 999;
  state.party.facing = N;
  return enemy;
}

describe('injury effects', () => {
  it('a broken arm takes a quarter off every blow', () => {
    const world = loadMines();
    const total = (arm: boolean) => {
      const state = createSession(world, 4);
      state.party.members[0].attributes.dexterity = 3; // no criticals to muddy it
      const enemy = dummy(state);
      if (arm) injure(state, 'arm');
      let dealt = 0;
      for (let i = 0; i < 20; i++) {
        const hits = act(state, world, { type: 'attack', actor: HERO, kind: 'light' }, 60).filter((e): e is Extract<GameEvent, { type: 'attack.hit' }> => e.type === 'attack.hit');
        dealt += hits.reduce((n, e) => n + e.damage, 0);
        enemy.hp = 999;
      }
      return dealt;
    };
    const whole = total(false);
    const broken = total(true);
    expect(broken).toBeLessThan(whole * 0.85);
    expect(broken).toBeGreaterThan(whole * 0.6);
  });

  it('a torn leg slows the whole party', () => {
    const world = loadPartyMines();
    const state = createSession(world, 1);
    expect(partyMoveTicks(state)).toBe(MOVE_TICKS);
    injure(state, 'leg', 2); // a companion's leg, not the leader's
    expect(partyMoveTicks(state)).toBeGreaterThan(MOVE_TICKS);
    step(state, world, [{ type: 'move', actor: HERO, dir: 'back' }]);
    expect(state.party.moveTicks).toBe(partyMoveTicks(state));
  });

  it('broken ribs halve how fast stamina comes back', () => {
    const world = loadMines();
    const regained = (ribs: boolean) => {
      const state = createSession(world, 1);
      const hero = state.party.members[0];
      if (ribs) injure(state, 'ribs');
      hero.stamina = 0;
      for (let i = 0; i < 120; i++) step(state, world, []);
      return hero.stamina;
    };
    expect(regained(true)).toBeLessThanOrEqual(Math.ceil(regained(false) / 2) + 1);
    expect(regained(true)).toBeGreaterThan(0);
  });

  it('a cracked skull makes spells dearer and blows never critical', () => {
    const world = loadCrypt();
    const state = createSession(world, 1);
    const caster = state.party.members.find((m) => m.spells.length)!;
    const spell = world.def.spells.find((sp) => sp.id === caster.spells[0])!;
    expect(manaCostFor(caster, spell)).toBe(spell.manaCost);
    caster.injuries.push({ kind: 'head', until: 99999 });
    expect(manaCostFor(caster, spell)).toBe(Math.ceil(spell.manaCost * 1.5));

    const mines = loadMines();
    const s = createSession(mines, 2);
    s.party.members[0].attributes.dexterity = 18;
    injure(s, 'head');
    const enemy = dummy(s);
    for (let i = 0; i < 30; i++) {
      const hit = act(s, mines, { type: 'attack', actor: HERO, kind: 'light' }, 60).find((e) => e.type === 'attack.hit');
      if (hit?.type === 'attack.hit') expect(hit.critical).toBe(false);
      enemy.hp = 999;
    }
  });
});

describe('healing', () => {
  it('an injury heals on its own when its time is up, and says so', () => {
    const world = loadMines();
    const state = createSession(world, 1);
    state.party.members[0].injuries.push({ kind: 'arm', until: 30 });
    const events: GameEvent[] = [];
    for (let i = 0; i < 40; i++) events.push(...step(state, world, []));
    expect(hasInjury(state.party.members[0], 'arm')).toBe(false);
    expect(events).toContainEqual({ type: 'member.recovered', actor: HERO, kind: 'arm' });
  });

  it('a healing spell halves the time the worst injury has left', () => {
    const world = loadPartyMines();
    const state = createSession(world, 1);
    const cleric = state.party.members.find((m) => m.classId === 'cleric')!;
    const hero = state.party.members[0];
    hero.hp = 5;
    hero.injuries.push({ kind: 'ribs', until: 6000 });
    for (let i = 0; i < 400 && hero.injuries[0].until === 6000; i++) step(state, world, []);
    expect(cleric).toBeDefined();
    expect(hero.injuries[0].until).toBeLessThan(6000);
    expect(hero.injuries[0].until).toBeGreaterThan(2800);
  });
});

describe('injuries in play', () => {
  it('blows that are small against a body\'s health never injure', () => {
    const world = loadMines();
    let injured = 0;
    for (const seed of [1, 2, 3, 4]) {
      const state = createSession(world, seed);
      // The chief, awake and in reach, and a party that neither dodges nor guards.
      const chief = state.enemies.find((e) => e.defId === 'enemy_goblin_chief')!;
      chief.x = state.party.x;
      chief.y = state.party.y - 1;
      state.party.members[0].hp = state.party.members[0].maxHp = 400;
      const events: GameEvent[] = [];
      for (let i = 0; i < 3000 && state.status === 'playing'; i++) events.push(...step(state, world, []));
      injured += events.filter((e) => e.type === 'member.injured').length;
      // Only blows big enough to matter ever injure: a fifth of 400 health is far beyond a chief's reach.
      expect(events.some((e) => e.type === 'enemy.attack.hit')).toBe(true);
    }
    expect(injured).toBe(0);
  });

  it('a hero worn thin is injured by the same blows', () => {
    const world = loadMines();
    let injured = 0;
    for (const seed of [1, 2, 3, 4]) {
      const state = createSession(world, seed);
      const chief = state.enemies.find((e) => e.defId === 'enemy_goblin_chief')!;
      chief.x = state.party.x;
      chief.y = state.party.y - 1;
      const events: GameEvent[] = [];
      for (let i = 0; i < 3000 && state.status === 'playing'; i++) events.push(...step(state, world, []));
      injured += events.filter((e) => e.type === 'member.injured').length;
    }
    expect(injured).toBeGreaterThan(0);
  });

  it('the bot still wins the Mines and the Crypt', () => {
    for (const load of [loadMines, loadCrypt, loadPartyMines]) {
      const world = load();
      expect(explore(createSession(world, 1), world)).toBe('won');
    }
  });
});
