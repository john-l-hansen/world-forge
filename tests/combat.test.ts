/**
 * Phase 2 combat: stamina, heavy attacks, blocking, parrying, dodging and
 * enemy attack patterns. Each test stages a duel in the entrance room so the
 * timing is exact.
 */
import { describe, expect, it } from 'vitest';
import { attackCells, createSession, isGuarding, serializeSession, step } from '../src/engine/sim';
import {
  BLOCK_STAMINA_COST,
  DODGE_STAMINA_COST,
  DODGE_TICKS,
  PARRY_STAGGER_TICKS,
  STAMINA_REGEN_DELAY,
  type EnemyState,
  type GameEvent,
  type SessionState,
} from '../src/engine/types';
import type { CompiledWorld } from '../src/world/compile';
import { HERO, act, attack, block, dodge, heavy, loadMines, move, run, turn } from './helpers';

const types = (events: GameEvent[]) => events.map((e) => e.type);

/**
 * The party stands at (5, 14) facing north with an alerted enemy directly in
 * front at (5, 13). Index 0 is the goblin, 1 the chief.
 */
function duel(enemyIndex = 0, seed = 7) {
  const world = loadMines();
  const state = createSession(world, seed);
  const enemy = state.enemies[enemyIndex];
  Object.assign(enemy, { x: 5, y: 13, prevX: 5, prevY: 13, facing: 2, alerted: true });
  state.encountersStarted.push(enemy.id.split('#')[0]);
  const hero = state.party.members[0];
  return { world, state, enemy, hero };
}

/** Run until the enemy has just begun a wind-up. */
function untilTelegraph(state: SessionState, world: CompiledWorld, enemy: EnemyState) {
  for (let i = 0; i < 600 && enemy.ai !== 'telegraph'; i++) step(state, world, []);
  expect(enemy.ai).toBe('telegraph');
}

/** Run until `before` ticks remain before the wound-up blow lands. */
function untilImpactIn(state: SessionState, world: CompiledWorld, enemy: EnemyState, before: number) {
  const events: GameEvent[] = [];
  // Fix the target tick first: the enemy's timers move on once the blow lands.
  const until = enemy.aiEnd - before;
  for (let guard = 0; guard < 2000 && state.tick < until && state.status === 'playing'; guard++) events.push(...step(state, world, []));
  return events;
}

/** Force the enemy into the wind-up of a particular attack. */
function windUp(state: SessionState, world: CompiledWorld, enemy: EnemyState, attackId: string, ticks = 40) {
  Object.assign(enemy, {
    ai: 'telegraph',
    attackId,
    aiStart: state.tick,
    aiEnd: state.tick + ticks,
    targetX: state.party.x,
    targetY: state.party.y,
  });
  void world;
}

describe('stamina', () => {
  it('a light attack costs a little and a heavy attack a lot', () => {
    const { world, state, hero } = duel();
    state.enemies[0].ai = 'dead';
    step(state, world, [attack()]);
    step(state, world, []);
    expect(hero.stamina).toBe(36);
    run(state, world, 30);
    step(state, world, [heavy()]);
    step(state, world, []);
    expect(hero.stamina).toBe(22);
  });

  it('returns after a short rest, up to the maximum', () => {
    const { world, state, hero } = duel();
    state.enemies[0].ai = 'dead';
    act(state, world, attack(), 26);
    expect(hero.stamina).toBe(36);
    // Nothing comes back until the rest period is over.
    while (state.tick < 1 + STAMINA_REGEN_DELAY - 1) step(state, world, []);
    expect(hero.stamina).toBe(36);
    run(state, world, 12);
    expect(hero.stamina).toBeGreaterThan(36);
    expect(hero.stamina).toBeLessThan(40);
    run(state, world, 600);
    expect(hero.stamina).toBe(40);
  });

  it('does not return while the guard is held up', () => {
    const { world, state, hero } = duel();
    state.enemies[0].ai = 'dead';
    hero.stamina = 10;
    step(state, world, [block(true)]);
    run(state, world, 300);
    expect(hero.stamina).toBe(10);
    step(state, world, [block(false)]);
    run(state, world, 300);
    expect(hero.stamina).toBe(40);
  });

  it('a tired character cannot swing', () => {
    const { world, state, hero } = duel();
    state.enemies[0].ai = 'dead';
    hero.stamina = 3;
    hero.staminaRegenFrom = 99999;
    expect(types(act(state, world, attack(), 3))).toEqual(['stamina.low']);
    expect(hero.action.kind).toBe('idle');
    hero.stamina = 13;
    expect(types(act(state, world, heavy(), 3))).toEqual(['stamina.low']);
    expect(types(act(state, world, attack(), 3))).toEqual(['attack.swing']);
  });
});

describe('heavy attack', () => {
  it('is slower and hits harder than a light attack', () => {
    const { world, state, enemy } = duel();
    Object.assign(enemy, { ai: 'recover', aiStart: 0, aiEnd: 500 });
    const light = act(state, world, attack(), 8);
    expect(types(light)).toContain('attack.hit');
    const lightHit = light.find((e) => e.type === 'attack.hit');
    run(state, world, 40);
    const early = act(state, world, heavy(), 10);
    expect(types(early)).toEqual(['attack.swing']);
    const late = run(state, world, 12);
    const heavyHit = late.find((e) => e.type === 'attack.hit');
    if (lightHit?.type !== 'attack.hit' || heavyHit?.type !== 'attack.hit') throw new Error('missing hits');
    expect(lightHit.damage).toBeLessThanOrEqual(7);
    expect(heavyHit.damage).toBeGreaterThanOrEqual(9);
    expect(heavyHit.damage).toBeLessThanOrEqual(13);
    expect(heavyHit.kind).toBe('heavy');
  });

  it("breaks a goblin's wind-up if it lands in time", () => {
    const { world, state, enemy, hero } = duel();
    untilTelegraph(state, world, enemy);
    const events = act(state, world, heavy(), 22);
    expect(types(events)).toContain('enemy.interrupted');
    expect(types(events)).not.toContain('enemy.attack.hit');
    expect(enemy.ai).toBe('stagger');
    expect(hero.hp).toBe(40);
  });

  it("does not break the chief's wind-up", () => {
    const { world, state, enemy } = duel(1);
    windUp(state, world, enemy, 'cleave', 44);
    const events = act(state, world, heavy(), 22);
    expect(types(events)).toContain('attack.hit');
    expect(types(events)).not.toContain('enemy.interrupted');
    expect(enemy.ai).toBe('telegraph');
  });

  it('a light attack never breaks a wind-up', () => {
    const { world, state, enemy } = duel();
    untilTelegraph(state, world, enemy);
    const events = act(state, world, attack(), 10);
    expect(types(events)).toContain('attack.hit');
    expect(enemy.ai).toBe('telegraph');
  });
});

describe('block and parry', () => {
  it('a guard held up in good time blocks most of the blow', () => {
    const { world, state, enemy, hero } = duel();
    step(state, world, [block(true)]);
    untilTelegraph(state, world, enemy);
    const events = untilImpactIn(state, world, enemy, -2);
    const blocked = events.find((e) => e.type === 'attack.blocked');
    if (blocked?.type !== 'attack.blocked') throw new Error(`not blocked: ${types(events).join(', ')}`);
    expect(blocked.damage).toBeGreaterThanOrEqual(2);
    expect(blocked.damage).toBeLessThanOrEqual(3);
    expect(hero.hp).toBe(40 - blocked.damage);
    expect(hero.stamina).toBe(40 - BLOCK_STAMINA_COST);
    expect(types(events)).not.toContain('enemy.attack.hit');
  });

  it('a guard raised at the last moment parries and leaves the enemy reeling', () => {
    const { world, state, enemy, hero } = duel();
    untilTelegraph(state, world, enemy);
    untilImpactIn(state, world, enemy, 5);
    const events = [...step(state, world, [block(true)]), ...run(state, world, 12)];
    expect(events).toContainEqual({ type: 'attack.parried', enemyId: enemy.id, actor: HERO });
    expect(hero.hp).toBe(40);
    expect(hero.stamina).toBe(40);
    expect(enemy.ai).toBe('stagger');
    expect(enemy.aiEnd - enemy.aiStart).toBe(PARRY_STAGGER_TICKS);
    // The opening is long enough for a heavy attack.
    step(state, world, [block(false)]);
    const riposte = act(state, world, heavy(), 20);
    expect(types(riposte)).toContain('attack.hit');
    expect(types(riposte)).not.toContain('enemy.attack.hit');
  });

  it('a guard only works against what the party is facing', () => {
    const { world, state, enemy, hero } = duel();
    act(state, world, turn('right'), 12);
    step(state, world, [block(true)]);
    untilTelegraph(state, world, enemy);
    const events = untilImpactIn(state, world, enemy, -2);
    expect(types(events)).toContain('enemy.attack.hit');
    expect(hero.hp).toBeLessThanOrEqual(36);
  });

  it('a blow breaks the guard of a tired character', () => {
    const { world, state, enemy, hero } = duel();
    hero.stamina = BLOCK_STAMINA_COST - 1;
    step(state, world, [block(true)]);
    untilTelegraph(state, world, enemy);
    const events = untilImpactIn(state, world, enemy, -2);
    const broken = events.find((e) => e.type === 'guard.broken');
    if (broken?.type !== 'guard.broken') throw new Error('guard held');
    expect(broken.damage).toBeGreaterThanOrEqual(3);
    expect(broken.damage).toBeLessThanOrEqual(5);
    expect(hero.stamina).toBe(0);
    expect(hero.blocking).toBe(false);
  });

  it('the guard is down during a swing and comes back up after it', () => {
    const { world, state, hero } = duel();
    state.enemies[0].ai = 'dead';
    step(state, world, [block(true)]);
    step(state, world, []);
    expect(isGuarding(hero)).toBe(true);
    step(state, world, [attack()]);
    run(state, world, 5);
    expect(isGuarding(hero)).toBe(false);
    run(state, world, 30);
    expect(isGuarding(hero)).toBe(true);
    expect(hero.blockStart).toBeGreaterThan(20);
  });
});

describe('dodge', () => {
  it('is a quick step back that costs stamina', () => {
    const { world, state, hero } = duel();
    state.enemies[0].ai = 'dead';
    const events = step(state, world, [dodge()]);
    events.push(...step(state, world, []));
    expect(types(events)).toEqual(['party.moved', 'party.dodged']);
    expect([state.party.x, state.party.y]).toEqual([5, 15]);
    expect(state.party.moveTicks).toBe(DODGE_TICKS);
    expect(hero.stamina).toBe(40 - DODGE_STAMINA_COST);
  });

  it('can go sideways or forward, and needs a moment before the next one', () => {
    const { world, state } = duel();
    state.enemies[0].ai = 'dead';
    act(state, world, dodge('left'), 8);
    expect([state.party.x, state.party.y]).toEqual([4, 14]);
    act(state, world, dodge('right'), 8);
    expect([state.party.x, state.party.y]).toEqual([4, 14]);
    run(state, world, 30);
    act(state, world, dodge('right'), 8);
    expect([state.party.x, state.party.y]).toEqual([5, 14]);
  });

  it('into a wall costs nothing', () => {
    const { world, state, hero } = duel();
    state.enemies[0].ai = 'dead';
    act(state, world, move('back'), 20);
    const events = act(state, world, dodge(), 8);
    expect(events).toContainEqual({ type: 'party.bumped', reason: 'wall' });
    expect(hero.stamina).toBe(40);
  });

  it('is refused when too tired', () => {
    const { world, state, hero } = duel();
    state.enemies[0].ai = 'dead';
    hero.stamina = DODGE_STAMINA_COST - 1;
    hero.staminaRegenFrom = 99999;
    expect(types(act(state, world, dodge(), 8))).toEqual(['stamina.low']);
    expect([state.party.x, state.party.y]).toEqual([5, 14]);
  });

  it('slips through a blow that would otherwise land', () => {
    const { world, state, enemy, hero } = duel(1);
    windUp(state, world, enemy, 'sweep', 30);
    untilImpactIn(state, world, enemy, 4);
    // A sideways dodge stays inside the sweep, but the timing carries it through.
    const events = act(state, world, dodge('left'), 10);
    expect(events).toContainEqual({ type: 'enemy.attack.dodged', enemyId: enemy.id });
    expect(hero.hp).toBe(40);
  });
});

describe('enemy attack patterns', () => {
  it('a sweep reaches the cells to either side of its target', () => {
    const { world, state, enemy } = duel(1);
    windUp(state, world, enemy, 'sweep');
    const def = world.def.enemies[1];
    const sweep = def.attacks.find((a) => a.id === 'sweep')!;
    const cleave = def.attacks.find((a) => a.id === 'cleave')!;
    expect(attackCells(enemy, cleave)).toEqual([{ x: 5, y: 14 }]);
    expect(attackCells(enemy, sweep)).toEqual(expect.arrayContaining([{ x: 5, y: 14 }, { x: 4, y: 14 }, { x: 6, y: 14 }]));
  });

  it('a sidestep does not escape a sweep, but stepping back does', () => {
    const side = duel(1);
    windUp(side.state, side.world, side.enemy, 'sweep', 40);
    const hitEvents = [...act(side.state, side.world, move('left'), 16), ...run(side.state, side.world, 30)];
    expect(types(hitEvents)).toContain('enemy.attack.hit');
    expect(side.hero.hp).toBeLessThanOrEqual(31);

    const back = duel(1);
    windUp(back.state, back.world, back.enemy, 'sweep', 40);
    const missEvents = [...act(back.state, back.world, move('back'), 16), ...run(back.state, back.world, 30)];
    expect(types(missEvents)).toContain('enemy.attack.miss');
    expect(back.hero.hp).toBe(40);
  });

  it('a sidestep does escape an ordinary blow', () => {
    const { world, state, enemy, hero } = duel(1);
    windUp(state, world, enemy, 'cleave', 40);
    const events = [...act(state, world, move('left'), 16), ...run(state, world, 30)];
    expect(types(events)).toContain('enemy.attack.miss');
    expect(hero.hp).toBe(40);
  });

  it('a sweep cannot be blocked or parried', () => {
    const blocked = duel(1);
    step(blocked.state, blocked.world, [block(true)]);
    run(blocked.state, blocked.world, 20);
    windUp(blocked.state, blocked.world, blocked.enemy, 'sweep', 30);
    const a = run(blocked.state, blocked.world, 34);
    expect(types(a)).toContain('enemy.attack.hit');
    expect(blocked.hero.hp).toBeLessThanOrEqual(31);

    const parried = duel(1);
    windUp(parried.state, parried.world, parried.enemy, 'sweep', 30);
    untilImpactIn(parried.state, parried.world, parried.enemy, 4);
    const b = [...step(parried.state, parried.world, [block(true)]), ...run(parried.state, parried.world, 8)];
    expect(types(b)).toContain('enemy.attack.hit');
    expect(types(b)).not.toContain('attack.parried');
  });

  it('the chief uses both of his attacks over a long fight', () => {
    const { world, state, hero } = duel(1);
    const seen = new Set<string>();
    for (let i = 0; i < 6000 && seen.size < 2; i++) {
      hero.hp = 40; // keep the party standing so the chief keeps swinging
      for (const e of step(state, world, [])) if (e.type === 'enemy.telegraph') seen.add(e.attackId);
    }
    expect([...seen].sort()).toEqual(['cleave', 'sweep']);
  });

  it('announces which attack is coming', () => {
    const { world, state, enemy } = duel();
    let told: GameEvent | undefined;
    for (let i = 0; i < 100 && !told; i++) told = step(state, world, []).find((e) => e.type === 'enemy.telegraph');
    expect(told).toEqual({ type: 'enemy.telegraph', enemyId: enemy.id, attackId: 'chop' });
  });
});

describe('determinism with the new rules', () => {
  it('the same seed and commands still give the same fight', () => {
    const play = () => {
      const { world, state, enemy } = duel(1, 21);
      const script = [block(true), block(false), heavy(), dodge(), attack(), dodge('left'), heavy(), block(true), attack()];
      script.forEach((command, i) => {
        step(state, world, [command]);
        run(state, world, 25 + i * 7);
      });
      void enemy;
      return serializeSession(state);
    };
    expect(play()).toBe(play());
  });
});
