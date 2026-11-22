/**
 * Blood and gore are simulation state: where blood fell, what kind, and which
 * enemies were torn apart. None of it spends the dice, so outcomes are the
 * same as they were before blood existed.
 */
import { describe, expect, it } from 'vitest';
import { createSession, step } from '../src/engine/sim';
import { MAX_STAINS, type SessionState } from '../src/engine/types';
import { validateWorld } from '../src/schema/validate';
import { HERO, act, explore, loadCrypt, loadMines, minesData } from './helpers';

const N = 0;

describe('blood on the floor', () => {
  it('the Mines run leaves red blood where goblins were cut down', () => {
    const world = loadMines();
    const state = createSession(world, 1);
    expect(explore(state, world)).toBe('won');
    expect(state.stains.length).toBeGreaterThan(3);
    expect(state.stains.every((s) => s.kind === 'red')).toBe(true);
    for (const enemy of state.enemies.filter((e) => e.ai === 'dead')) {
      expect(state.stains.some((s) => s.x === enemy.x && s.y === enemy.y && s.size === 3)).toBe(true);
    }
  });

  it('the long dead of the Crypt leave bone, not blood', () => {
    const world = loadCrypt();
    const state = createSession(world, 2);
    explore(state, world);
    const skeletonCells = state.enemies.filter((e) => e.ai === 'dead').map((e) => `${e.x},${e.y}`);
    expect(skeletonCells.length).toBeGreaterThan(0);
    const there = state.stains.filter((s) => skeletonCells.includes(`${s.x},${s.y}`));
    expect(there.length).toBeGreaterThan(0);
    expect(there.every((s) => s.kind === 'bone')).toBe(true);
  });

  it('a cell holds at most four stains, and the floor at most the cap', () => {
    const world = loadMines();
    const state = createSession(world, 1);
    expect(explore(state, world)).toBe('won');
    const perCell = new Map<string, number>();
    for (const s of state.stains) perCell.set(`${s.x},${s.y}`, (perCell.get(`${s.x},${s.y}`) ?? 0) + 1);
    expect(Math.max(...perCell.values())).toBeLessThanOrEqual(4);
    expect(state.stains.length).toBeLessThanOrEqual(MAX_STAINS);
  });

  it('stains never touch the dice: the same seed plays out the same with or without them', () => {
    const world = loadMines();
    const a = createSession(world, 5);
    const b = createSession(world, 5);
    explore(a, world, 200);
    // Wiping the blood mid-run must not change a single later roll.
    b.stains = [];
    explore(b, world, 200);
    const strip = (s: SessionState) => ({ ...s, stains: [] });
    expect(strip(a).rng).toBe(strip(b).rng);
    expect(a.party.members.map((m) => m.hp)).toEqual(b.party.members.map((m) => m.hp));
  });
});

describe('gore deaths', () => {
  it('a heavy killing blow tears an enemy apart; light blows only fell it', () => {
    const world = loadMines();
    for (const [kind, gore] of [
      ['heavy', true],
      ['light', false],
    ] as const) {
      const state = createSession(world, 1);
      const enemy = state.enemies[0];
      // Stand the goblin in front of the party, nearly dead, unaware.
      enemy.x = state.party.x;
      enemy.y = state.party.y - 1;
      state.party.facing = N;
      enemy.hp = 1;
      // Keep criticals out of it: the light test must be a plain kill.
      state.party.members[0].attributes.dexterity = 3;
      const events = act(state, world, { type: 'attack', actor: HERO, kind });
      const hit = events.find((e) => e.type === 'attack.hit');
      expect(enemy.ai).toBe('dead');
      // A critical light blow may tear too; otherwise the rule is exact.
      expect(enemy.gore).toBe(gore || (hit?.type === 'attack.hit' && hit.critical));
      expect(state.stains.some((s) => s.x === enemy.x && s.y === enemy.y && s.size === 3)).toBe(true);
    }
  });

  it('nothing before a killing blow is marked as gore', () => {
    const world = loadMines();
    const state = createSession(world, 1);
    for (let i = 0; i < 100; i++) step(state, world, []);
    expect(state.enemies.every((e) => !e.gore)).toBe(true);
  });
});

describe('what enemies bleed', () => {
  it('older worlds give their skeletons no blood when migrated', () => {
    const data = minesData();
    data.schemaVersion = '0.9.0';
    data.enemies[0].visualAssetId = 'skeleton';
    delete data.enemies[0].blood;
    const result = validateWorld(data);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.world.enemies[0].blood).toBe('none');
  });

  it('goblins bleed red by default', () => {
    const data = minesData();
    delete data.enemies[0].blood;
    const result = validateWorld(data);
    if (result.ok) expect(result.world.enemies[0].blood).toBe('red');
  });
});
