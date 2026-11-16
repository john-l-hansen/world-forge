import { describe, expect, it } from 'vitest';
import { createSession, deserializeSession, serializeSession, step, hasLineOfSight } from '../src/engine/sim';
import type { Command, GameEvent } from '../src/engine/types';
import { HERO, act, attack, interact, loadMines, move, run, turn } from './helpers';

const types = (events: GameEvent[]) => events.map((e) => e.type);

/** Walk from the start to the cell south of the hall door, facing north. */
function walkToHallDoor(state: ReturnType<typeof createSession>, world: ReturnType<typeof loadMines>) {
  for (let i = 0; i < 7; i++) act(state, world, move('forward'), 20);
  expect([state.party.x, state.party.y]).toEqual([5, 7]);
}

describe('movement', () => {
  it('starts in the entrance facing north', () => {
    const world = loadMines();
    const state = createSession(world);
    expect(state.party).toMatchObject({ x: 5, y: 14, facing: 0 });
    expect(state.currentRoomId).toBe('room_mine_entrance');
  });

  it('steps one cell at a time and turns in quarter turns', () => {
    const world = loadMines();
    const state = createSession(world);
    expect(types(act(state, world, move('forward')))).toContain('party.moved');
    expect([state.party.x, state.party.y]).toEqual([5, 13]);
    act(state, world, turn('right'));
    expect(state.party.facing).toBe(1);
    act(state, world, move('forward'));
    expect([state.party.x, state.party.y]).toEqual([6, 13]);
    act(state, world, move('left'));
    expect([state.party.x, state.party.y]).toEqual([6, 12]);
    act(state, world, move('back'));
    expect([state.party.x, state.party.y]).toEqual([5, 12]);
    act(state, world, turn('left'));
    act(state, world, turn('left'));
    expect(state.party.facing).toBe(3);
  });

  it('walls block movement', () => {
    const world = loadMines();
    const state = createSession(world);
    act(state, world, move('forward'));
    act(state, world, move('forward'));
    act(state, world, turn('left'));
    act(state, world, move('forward'));
    act(state, world, move('forward'));
    expect([state.party.x, state.party.y]).toEqual([3, 12]);
    const events = act(state, world, move('forward'));
    expect(events).toContainEqual({ type: 'party.bumped', reason: 'wall' });
    expect([state.party.x, state.party.y]).toEqual([3, 12]);
  });

  it('blocking props block movement', () => {
    const world = loadMines();
    const state = createSession(world);
    act(state, world, turn('left'));
    act(state, world, move('forward'));
    act(state, world, move('forward'));
    act(state, world, turn('left'));
    const events = act(state, world, move('forward'));
    expect(events).toContainEqual({ type: 'party.bumped', reason: 'object' });
    expect([state.party.x, state.party.y]).toEqual([3, 14]);
  });

  it('a command pressed mid-step is held and then runs', () => {
    const world = loadMines();
    const state = createSession(world);
    step(state, world, [move('forward')]);
    run(state, world, 4);
    step(state, world, [move('forward')]);
    run(state, world, 40);
    expect([state.party.x, state.party.y]).toEqual([5, 12]);
  });

  it('announces rooms as the party enters them', () => {
    const world = loadMines();
    const state = createSession(world);
    const events: GameEvent[] = [];
    for (let i = 0; i < 4; i++) events.push(...act(state, world, move('forward'), 20));
    expect(events).toContainEqual({ type: 'room.entered', roomId: 'room_timbered_tunnel', firstVisit: true });
    expect(state.currentRoomId).toBe('room_timbered_tunnel');
  });

  it('marks nearby cells as explored', () => {
    const world = loadMines();
    const state = createSession(world);
    const at = (x: number, y: number) => state.explored[y * world.width + x];
    expect(at(5, 14)).toBe(1);
    expect(at(6, 15)).toBe(1);
    expect(at(5, 9)).toBe(0);
  });

  it('ignores commands for characters who are not in the party', () => {
    const world = loadMines();
    const state = createSession(world);
    act(state, world, { type: 'move', actor: 'char_stranger', dir: 'forward' });
    expect([state.party.x, state.party.y]).toEqual([5, 14]);
  });
});

describe('doors', () => {
  it('a closed door blocks the way until it is opened', () => {
    const world = loadMines();
    const state = createSession(world);
    walkToHallDoor(state, world);
    expect(act(state, world, move('forward'))).toContainEqual({ type: 'party.bumped', reason: 'door' });
    expect(act(state, world, interact())).toContainEqual({ type: 'door.opened', doorId: 'door_tunnel_hall' });
    act(state, world, move('forward'), 20);
    expect([state.party.x, state.party.y]).toEqual([5, 6]);
  });

  it('a door can be closed again, and blocks sight when closed', () => {
    const world = loadMines();
    const state = createSession(world);
    walkToHallDoor(state, world);
    expect(hasLineOfSight(state, world, 5, 7, 5, 2)).toBe(false);
    act(state, world, interact(), 2);
    expect(hasLineOfSight(state, world, 5, 7, 5, 2)).toBe(true);
    expect(act(state, world, interact(), 2)).toContainEqual({ type: 'door.closed', doorId: 'door_tunnel_hall' });
    expect(hasLineOfSight(state, world, 5, 7, 5, 2)).toBe(false);
  });

  it('interacting with nothing does nothing', () => {
    const world = loadMines();
    const state = createSession(world);
    expect(types(act(state, world, interact()))).toEqual(['interact.nothing']);
  });
});

describe('combat', () => {
  function meetGoblin() {
    const world = loadMines();
    const state = createSession(world, 7);
    walkToHallDoor(state, world);
    const events = act(state, world, interact(), 1);
    return { world, state, events };
  }

  it('the goblin stays put until it can see the party', () => {
    const world = loadMines();
    const state = createSession(world);
    walkToHallDoor(state, world);
    run(state, world, 300);
    expect(state.enemies[0]).toMatchObject({ x: 5, y: 2, alerted: false });
  });

  it('opening the door alerts the goblin and it closes in', () => {
    const { world, state, events } = meetGoblin();
    events.push(...run(state, world, 400));
    expect(types(events)).toContain('enemy.alerted');
    expect(types(events)).toContain('enemy.moved');
    const goblin = state.enemies[0];
    expect(Math.abs(goblin.x - state.party.x) + Math.abs(goblin.y - state.party.y)).toBe(1);
  });

  it('the goblin telegraphs, then hits a party that stands still', () => {
    const { world, state } = meetGoblin();
    const events = run(state, world, 400);
    const order = types(events);
    expect(order.indexOf('enemy.telegraph')).toBeGreaterThan(-1);
    expect(order.indexOf('enemy.attack.hit')).toBeGreaterThan(order.indexOf('enemy.telegraph'));
    expect(state.party.members[0].hp).toBeLessThan(40);
  });

  it('stepping away during the wind-up avoids the blow', () => {
    const { world, state } = meetGoblin();
    let events: GameEvent[] = [];
    for (let i = 0; i < 600 && !types(events).includes('enemy.telegraph'); i++) events = step(state, world, []);
    expect(types(events)).toContain('enemy.telegraph');
    const hpBefore = state.party.members[0].hp;
    const after = act(state, world, move('back'), 45);
    expect(types(after)).toContain('enemy.attack.miss');
    expect(types(after)).not.toContain('enemy.attack.hit');
    expect(state.party.members[0].hp).toBe(hpBefore);
  });

  it('a sword blow damages the goblin in front and keeps it recovering', () => {
    const { world, state } = meetGoblin();
    let events: GameEvent[] = [];
    for (let i = 0; i < 600 && !types(events).includes('enemy.attack.hit'); i++) events = step(state, world, []);
    // The goblin has just swung: a free hit.
    const hit = act(state, world, attack(), 8).find((e) => e.type === 'attack.hit');
    if (hit?.type !== 'attack.hit') throw new Error('no hit');
    expect(hit.damage).toBeGreaterThanOrEqual(4);
    expect(hit.damage).toBeLessThanOrEqual(7);
    expect(state.enemies[0].hp).toBe(24 - hit.damage);
    expect(state.enemies[0].ai).toBe('recover');
    expect(state.hitStop).toBeGreaterThanOrEqual(0);
  });

  it('a blow staggers a goblin caught mid-step but not one mid-swing', () => {
    const { world, state } = meetGoblin();
    const goblin = state.enemies[0];
    Object.assign(goblin, { x: 5, y: 6, alerted: true, ai: 'move', aiStart: state.tick, aiEnd: state.tick + 500 });
    act(state, world, attack(), 8);
    expect(goblin.ai).toBe('stagger');

    Object.assign(goblin, { ai: 'telegraph', aiStart: state.tick, aiEnd: state.tick + 500, targetX: 5, targetY: 7 });
    run(state, world, 30);
    act(state, world, attack(), 8);
    expect(goblin.ai).toBe('telegraph');
  });

  it('swinging at empty air misses and swinging at rock clangs', () => {
    const world = loadMines();
    const state = createSession(world);
    expect(types(act(state, world, attack()))).toEqual(['attack.swing', 'attack.miss']);
    act(state, world, turn('left'));
    act(state, world, turn('left'));
    act(state, world, move('forward'));
    expect(types(act(state, world, attack()))).toEqual(['attack.swing', 'attack.clang']);
  });

  it('the party cannot act while a swing is in progress', () => {
    const world = loadMines();
    const state = createSession(world);
    step(state, world, [attack()]);
    run(state, world, 12);
    step(state, world, [move('forward')]);
    run(state, world, 5);
    expect([state.party.x, state.party.y]).toEqual([5, 14]);
    run(state, world, 40);
    expect([state.party.x, state.party.y]).toEqual([5, 13]);
  });

  it('enough blows kill the goblin and clear the encounter', () => {
    const { world, state } = meetGoblin();
    const all: GameEvent[] = [];
    for (let i = 0; i < 60 && state.enemies[0].ai !== 'dead' && state.status === 'playing'; i++) {
      // Fight sensibly: back off from wind-ups, otherwise swing when it is in front.
      const goblin = state.enemies[0];
      const inFront = goblin.x === state.party.x && goblin.y === state.party.y - 1;
      const command: Command | null = inFront && goblin.ai !== 'telegraph' ? attack() : null;
      all.push(...(command ? act(state, world, command, 30) : run(state, world, 30)));
    }
    expect(state.enemies[0].ai).toBe('dead');
    expect(types(all)).toContain('enemy.died');
    expect(all).toContainEqual({ type: 'encounter.cleared', encounterId: 'encounter_goblin_patrol' });
    // A dead goblin no longer blocks the way or attacks.
    const hp = state.party.members[0].hp;
    run(state, world, 300);
    expect(state.party.members[0].hp).toBe(hp);
  });

  it('a party that never fights back dies, and the game stops', () => {
    const { world, state } = meetGoblin();
    const events = run(state, world, 4000);
    expect(types(events)).toContain('party.died');
    expect(state.status).toBe('dead');
    expect(state.party.members[0].hp).toBe(0);
    const tick = state.tick;
    act(state, world, move('back'));
    expect(state.tick).toBe(tick);
  });

  it('the goblin cannot open a closed door', () => {
    const { world, state } = meetGoblin();
    act(state, world, interact(), 1); // close it again at once
    expect(state.doorsOpen.door_tunnel_hall).toBe(false);
    run(state, world, 600);
    const goblin = state.enemies[0];
    expect(goblin.y).toBeLessThanOrEqual(5);
    expect(state.party.members[0].hp).toBe(40);
  });
});

describe('determinism', () => {
  const script = (): Command[][] => {
    const frames: Command[][] = [];
    const push = (c: Command, wait: number) => {
      frames.push([c]);
      for (let i = 0; i < wait; i++) frames.push([]);
    };
    for (let i = 0; i < 7; i++) push(move('forward'), 20);
    push(interact(), 150);
    for (let i = 0; i < 12; i++) push(attack(), 45);
    return frames;
  };

  it('the same seed and commands give the same game', () => {
    const world = loadMines();
    const a = createSession(world, 42);
    const b = createSession(world, 42);
    for (const frame of script()) step(a, world, frame);
    for (const frame of script()) step(b, world, frame);
    expect(serializeSession(a)).toBe(serializeSession(b));
  });

  it('a different seed gives different damage rolls', () => {
    const world = loadMines();
    const a = createSession(world, 1);
    const b = createSession(world, 999);
    for (const frame of script()) step(a, world, frame);
    for (const frame of script()) step(b, world, frame);
    expect(serializeSession(a)).not.toBe(serializeSession(b));
  });

  it('a saved session resumes exactly where it left off', () => {
    const world = loadMines();
    const frames = script();
    const straight = createSession(world, 5);
    for (const frame of frames) step(straight, world, frame);

    let resumed = createSession(world, 5);
    frames.forEach((frame, i) => {
      if (i === 200) resumed = deserializeSession(serializeSession(resumed));
      step(resumed, world, frame);
    });
    expect(serializeSession(resumed)).toBe(serializeSession(straight));
  });

  it('keeps runtime state out of the world definition', () => {
    const world = loadMines();
    const before = JSON.stringify(world.def);
    const state = createSession(world, 3);
    for (const frame of script()) step(state, world, frame);
    expect(JSON.stringify(world.def)).toBe(before);
    expect(HERO).toBe(state.party.members[0].id);
  });
});
