import { describe, expect, it } from 'vitest';
import { deserializeWorld, serializeWorld, validateWorld } from '../src/schema/validate';
import { minesData } from './helpers';

const codes = (data: unknown) => {
  const r = validateWorld(data);
  return r.ok ? [] : r.issues.map((i) => i.code);
};

describe('world validation', () => {
  it('accepts The Forgotten Mines', () => {
    const r = validateWorld(minesData());
    expect(r.ok ? [] : r.issues).toEqual([]);
  });

  it('has five connected rooms and one secret room', () => {
    const r = validateWorld(minesData());
    expect(r.ok && r.world.rooms.length).toBe(6);
  });

  it('rejects an unknown schema version without guessing', () => {
    const data = minesData();
    data.schemaVersion = '9.0.0';
    expect(codes(data)).toEqual(['unsupported_version']);
  });

  it('rejects non-objects and bad JSON', () => {
    expect(codes(null)).toEqual(['not_an_object']);
    expect(deserializeWorld('{ nope').ok).toBe(false);
  });

  it('rejects a connection to a missing room', () => {
    const data = minesData();
    data.rooms[0].connections[0].targetRoomId = 'room_nowhere';
    expect(codes(data)).toContain('missing_reference');
  });

  it('rejects a one-way connection', () => {
    const data = minesData();
    data.rooms[3].connections = [];
    expect(codes(data)).toContain('connection');
  });

  it('rejects a room that cannot be reached', () => {
    const data = minesData();
    data.rooms[3].connections = [];
    data.rooms[2].connections = data.rooms[2].connections.filter((c: any) => c.targetRoomId !== 'room_storeroom');
    expect(codes(data)).toContain('unreachable');
  });

  it('rejects a door that does not sit between its rooms', () => {
    const data = minesData();
    data.doors[2].cell = { x: 9, y: 5 };
    expect(codes(data)).toContain('connection');
  });

  it('rejects overlapping rooms', () => {
    const data = minesData();
    data.rooms[3].layout.x = 8;
    expect(codes(data)).toContain('geometry');
  });

  it('rejects an enemy placed outside its room', () => {
    const data = minesData();
    data.encounters[0].placements[0].cell = { x: 12, y: 2 };
    expect(codes(data)).toContain('placement');
  });

  it('rejects an encounter that uses a missing enemy', () => {
    const data = minesData();
    data.encounters[0].placements[0].enemyId = 'enemy_dragon';
    expect(codes(data)).toContain('missing_reference');
  });

  it('rejects duplicate IDs', () => {
    const data = minesData();
    data.doors[1].id = data.doors[0].id;
    expect(codes(data)).toContain('duplicate_id');
  });

  it('rejects a character holding a missing item', () => {
    const data = minesData();
    data.characters[0].equipment.mainHand = 'item_none';
    expect(codes(data)).toContain('missing_reference');
  });

  it('rejects a start cell outside the start room', () => {
    const data = minesData();
    data.settings.startCell = { x: 1, y: 1 };
    expect(codes(data)).toContain('placement');
  });

  it('rejects a torch with no wall behind it', () => {
    const data = minesData();
    data.objects[0].wall = 'east';
    expect(codes(data)).toContain('placement');
  });

  it('rejects behaviour the engine does not support', () => {
    const data = minesData();
    data.enemies[0].behaviour = 'run_this_code()';
    expect(codes(data)).toContain('shape');
  });

  it('round-trips through JSON', () => {
    const first = validateWorld(minesData());
    if (!first.ok) throw new Error('invalid');
    const second = deserializeWorld(serializeWorld(first.world));
    expect(second.ok && second.world).toEqual(first.world);
  });
});
