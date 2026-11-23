/**
 * The world layer: world time, the history the event bus keeps, the slow
 * systems, catching up on time away, and the Dungeon Master's time command.
 */
import { describe, expect, it } from 'vitest';
import { createSession, deserializeSession, serializeSession, step } from '../src/engine/sim';
import { MAX_CATCH_UP_MINUTES, START_MINUTE, TICKS_PER_WORLD_MINUTE, type GameEvent, type SessionState } from '../src/engine/types';
import { BLOOD_DRIES_AFTER, BLOOD_GONE_AFTER, BODIES_TAKEN_AFTER, formatClock, formatDuration, readClock } from '../src/engine/worldlayer';
import { HERO, act, explore, loadMines, run } from './helpers';

const N = 0;
const pass = (state: SessionState, world: ReturnType<typeof loadMines>, minutes: number) => step(state, world, [{ type: 'time.pass', actor: 'world', minutes }]);

/** The first goblin, unaware, in front of the party, one blow from death. */
function goblinAhead(state: SessionState) {
  const enemy = state.enemies[0];
  enemy.x = state.party.x;
  enemy.y = state.party.y - 1;
  enemy.hp = 1;
  state.party.facing = N;
  return enemy;
}

describe('world time', () => {
  it('starts on the first day in the morning and moves a minute for every second of play', () => {
    const world = loadMines();
    const state = createSession(world, 1);
    expect(state.clock.minute).toBe(START_MINUTE);
    expect(formatClock(state.clock.minute)).toBe('Day 1, 08:00, morning');
    run(state, world, TICKS_PER_WORLD_MINUTE * 5);
    expect(state.clock.minute).toBe(START_MINUTE + 5);
  });

  it('reads parts of the day and durations in plain words', () => {
    expect(readClock(0).part).toBe('night');
    expect(readClock(6 * 60).part).toBe('dawn');
    expect(readClock(13 * 60).part).toBe('afternoon');
    expect(readClock(19 * 60).part).toBe('dusk');
    expect(formatClock(1440 + 22 * 60 + 5)).toBe('Day 2, 22:05, night');
    expect(formatDuration(40)).toBe('40 minutes');
    expect(formatDuration(61)).toBe('1 hour, 1 minute');
    expect(formatDuration(3 * 1440 + 120)).toBe('3 days, 2 hours');
  });
});

describe('world history', () => {
  it('records a kill with who did it, where, and who saw it', () => {
    const world = loadMines();
    const state = createSession(world, 1);
    const victim = goblinAhead(state);
    // A second creature standing in plain view of the killing.
    const watcher = state.enemies[1];
    watcher.x = state.party.x;
    watcher.y = state.party.y - 2;
    act(state, world, { type: 'attack', actor: HERO, kind: 'light' });
    const slain = state.history.find((e) => e.type === 'enemy.slain');
    expect(slain).toMatchObject({ actor: HERO, target: victim.id, x: victim.x, y: victim.y, minute: state.clock.minute });
    expect(slain?.roomId).toBeTruthy();
    expect(slain?.witnesses).toContain(watcher.id);
    expect(slain?.witnesses).not.toContain(victim.id);
    expect(victim.diedAt).toBe(slain?.minute);
  });

  it('records a whole adventure in order, and keeps no more than its limit', () => {
    const world = loadMines();
    const state = createSession(world, 1);
    expect(explore(state, world)).toBe('won');
    const types = state.history.map((e) => e.type);
    for (const type of ['place.discovered', 'enemy.slain', 'item.taken', 'door.unlocked', 'quest.completed'] as const) expect(types).toContain(type);
    const ids = state.history.map((e) => e.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(state.history.length).toBeLessThanOrEqual(400);
  });

  it('is part of the saved session', () => {
    const world = loadMines();
    const state = createSession(world, 1);
    explore(state, world, 1500);
    expect(deserializeSession(serializeSession(state)).history).toEqual(state.history);
  });
});

describe('time away', () => {
  it('dries the blood, then clears it; drags the bodies away after two days', () => {
    const world = loadMines();
    const state = createSession(world, 1);
    const victim = goblinAhead(state);
    act(state, world, { type: 'attack', actor: HERO, kind: 'heavy' });
    expect(state.stains.length).toBeGreaterThan(0);
    const events = pass(state, world, BLOOD_DRIES_AFTER);
    expect(events.some((e) => e.type === 'world.changed' && e.event.type === 'blood.dried')).toBe(true);
    expect(victim.gone).toBe(false);
    pass(state, world, BODIES_TAKEN_AFTER);
    expect(victim.gone).toBe(true);
    expect(state.history.some((e) => e.type === 'bodies.taken')).toBe(true);
    pass(state, world, BLOOD_GONE_AFTER);
    expect(state.stains).toEqual([]);
  });

  it('sends creatures that lost the party back to their posts, to tend their wounds', () => {
    const world = loadMines();
    const state = createSession(world, 1);
    const goblin = state.enemies[0];
    const home = { x: goblin.x, y: goblin.y };
    // Roused, hurt, and somewhere it does not belong, out of sight of the party.
    goblin.alerted = true;
    goblin.hp = 1;
    // A step off its post, behind the shut hall door, where it cannot see the party.
    goblin.x = goblin.prevX = home.x;
    goblin.y = goblin.prevY = home.y + 1;
    const events = pass(state, world, 12 * 60);
    expect({ x: goblin.x, y: goblin.y }).toEqual(home);
    expect(goblin.alerted).toBe(false);
    expect(goblin.hp).toBe(goblin.maxHp);
    const changes = events.flatMap((e) => (e.type === 'world.changed' ? [e.event.type] : []));
    expect(changes).toContain('creatures.returned');
    expect(changes).toContain('wounds.tended');
  });

  it('heals injuries by world time, and flesh only an hour a point', () => {
    const world = loadMines();
    const state = createSession(world, 1);
    const hero = state.party.members[0];
    hero.hp = 10;
    hero.stamina = 0;
    hero.injuries.push({ kind: 'leg', healsAt: state.clock.minute + 90 });
    const events = pass(state, world, 5 * 60);
    expect(hero.injuries).toEqual([]);
    expect(events).toContainEqual({ type: 'member.recovered', actor: HERO, kind: 'leg' });
    expect(hero.hp).toBe(15);
    expect(hero.stamina).toBe(hero.maxStamina);
  });

  it('never runs longer than the catch-up limit, and says how long it was', () => {
    const world = loadMines();
    const state = createSession(world, 1);
    const events = pass(state, world, 10 * MAX_CATCH_UP_MINUTES);
    expect(state.clock.minute).toBe(START_MINUTE + MAX_CATCH_UP_MINUTES);
    expect(events).toContainEqual({ type: 'time.passed', minutes: MAX_CATCH_UP_MINUTES, by: 'world' });
    expect(state.history.at(-1)).toMatchObject({ type: 'time.passed', actor: 'world', amount: MAX_CATCH_UP_MINUTES });
  });

  it('comes out the same from the same start, step for step', () => {
    const world = loadMines();
    const a = createSession(world, 9);
    const b = createSession(world, 9);
    explore(a, world, 800);
    explore(b, world, 800);
    pass(a, world, 3000);
    pass(b, world, 3000);
    expect(a).toEqual(b);
  });
});

describe('the Dungeon Master', () => {
  it('can move time on when the save allows it', () => {
    const world = loadMines();
    const state = createSession(world, 1);
    const events = step(state, world, [{ type: 'dm.skip', actor: 'dm', minutes: 480 }]);
    expect(state.clock.minute).toBe(START_MINUTE + 480);
    expect(events).toContainEqual({ type: 'time.passed', minutes: 480, by: 'dm' });
    expect(state.history.at(-1)).toMatchObject({ type: 'time.passed', actor: 'dm' });
  });

  it('is refused when the save does not allow one', () => {
    const world = loadMines();
    const state = createSession(world, 1);
    state.rules.dungeonMaster = false;
    const events: GameEvent[] = step(state, world, [{ type: 'dm.skip', actor: 'dm', minutes: 480 }]);
    expect(events).toContainEqual({ type: 'dm.refused', reason: 'not_allowed' });
    expect(state.clock.minute).toBeLessThan(START_MINUTE + 2);
  });
});

describe('older sessions', () => {
  it('a version 9 session gets a clock, and its injuries count in world minutes', () => {
    const world = loadMines();
    const state = createSession(world, 1);
    const old = JSON.parse(serializeSession(state));
    old.stateVersion = 9;
    old.tick = 100;
    delete old.clock;
    delete old.history;
    delete old.nextEventId;
    delete old.rules;
    for (const e of old.enemies) {
      delete e.diedAt;
      delete e.gone;
    }
    old.party.members[0].injuries = [{ kind: 'arm', until: 100 + 1800 }];
    const restored = deserializeSession(JSON.stringify(old));
    expect(restored.stateVersion).toBe(10);
    expect(restored.clock.minute).toBe(START_MINUTE);
    // 1800 ticks left is thirty seconds of play: thirty world minutes.
    expect(restored.party.members[0].injuries[0]).toEqual({ kind: 'arm', healsAt: START_MINUTE + 30 });
  });
});
