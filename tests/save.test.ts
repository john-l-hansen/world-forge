/**
 * Save files: a save holds a whole world and the state it reached, survives
 * a round trip exactly, plays on identically, and is refused when damaged.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_BRIEF } from '../src/creator/brief';
import { generateWorld } from '../src/creator/generate';
import { looksLikeSave, makeSave, readSave, readSaveText, serializeSave } from '../src/engine/save';
import { createSession, step } from '../src/engine/sim';
import type { SessionState } from '../src/engine/types';
import { compileWorld } from '../src/world/compile';
import { explore, loadCrypt, loadMines, run, walkTo } from './helpers';

const roundTrip = (text: string) => {
  const read = readSaveText(text);
  if (!read.ok) throw new Error(read.issues.map((i) => i.message).join('\n'));
  return read;
};

describe('save files', () => {
  it('round-trip a session in progress exactly', () => {
    const world = loadMines();
    const state = createSession(world, 7);
    walkTo(state, world, world.start.x, world.start.y - 2);
    run(state, world, 90);
    const text = serializeSave(makeSave(world, state, { seed: 7, created: false, savedAt: 1234 }));
    const read = roundTrip(text);
    expect(read.session).toEqual(state);
    expect(read.save.seed).toBe(7);
    expect(read.save.savedAt).toBe(1234);
    expect(read.world.def).toEqual(world.def);
  });

  it('play on from a load exactly as the original does', () => {
    const world = loadMines();
    const original = createSession(world, 3);
    walkTo(original, world, world.start.x, world.start.y - 3);
    const read = roundTrip(serializeSave(makeSave(world, original, { seed: 3, created: false, savedAt: 0 })));
    const loaded = read.session;
    // The same commands from here give the same world, tick for tick.
    for (let i = 0; i < 600; i++) {
      const command = i % 50 === 0 ? [{ type: 'move' as const, actor: 'char_fighter', dir: 'forward' as const }] : [];
      expect(step(loaded, read.world, command)).toEqual(step(original, world, command));
    }
    expect(loaded).toEqual(original);
  });

  it('keep the save apart from the live game', () => {
    const world = loadMines();
    const state = createSession(world, 1);
    const save = makeSave(world, state, { seed: 1, created: false, savedAt: 0 });
    run(state, world, 120);
    expect(save.session.tick).toBe(0);
  });

  it('carry a created world, which loads without its generator', async () => {
    const made = await generateWorld({ ...DEFAULT_BRIEF, concept: 'a flooded crypt' }, 21);
    if (!made.ok) throw new Error('generation failed');
    const world = compileWorld(made.world);
    const state = createSession(world, 21);
    expect(explore(state, world, 40)).not.toBe('dead');
    const read = roundTrip(serializeSave(makeSave(world, state, { seed: 21, created: true, savedAt: 5 })));
    expect(read.save.created).toBe(true);
    expect(read.session).toEqual(state);
  });

  it('are recognised and told apart from world files', () => {
    const world = loadCrypt();
    expect(looksLikeSave(makeSave(world, createSession(world), { seed: 1, created: false, savedAt: 0 }))).toBe(true);
    expect(looksLikeSave(world.def)).toBe(false);
  });
});

describe('damaged saves are refused', () => {
  const world = loadMines();
  const good = () => JSON.parse(serializeSave(makeSave(world, createSession(world), { seed: 1, created: false, savedAt: 0 })));
  const refused = (data: unknown) => {
    const read = readSave(data);
    expect(read.ok).toBe(false);
    return read.ok ? [] : read.issues.map((i) => i.message).join(' ');
  };

  it('text that is not JSON', () => expect(readSaveText('{nope').ok).toBe(false));
  it('a world file passed as a save', () => refused(world.def));
  it('an unknown save version', () => refused({ ...good(), saveVersion: 99 }));
  it('a world that fails validation', () => {
    const data = good();
    data.world.rooms = [];
    refused(data);
  });
  it('a session from another world', () => {
    const data = good();
    data.session.worldId = 'elsewhere';
    expect(refused(data)).toMatch(/belongs to world/);
  });
  it('a party outside the world', () => {
    const data = good();
    data.session.party.x = 9999;
    expect(refused(data)).toMatch(/outside the world/);
  });
  it('a stranger in the party', () => {
    const data = good();
    data.session.party.members[0].id = 'char_nobody';
    expect(refused(data)).toMatch(/not a character/);
  });
  it('an item the world does not have', () => {
    const data = good();
    data.session.inventory = { item_crown_of_lies: 1 };
    expect(refused(data)).toMatch(/unknown item/);
  });
  it('an unsupported session version', () => {
    const data = good();
    (data.session as { stateVersion: number }).stateVersion = 1;
    refused(data);
  });
  it('a tampered explored map', () => {
    const data = good();
    (data.session as SessionState).explored = [1];
    expect(refused(data)).toMatch(/explored map/);
  });
});
