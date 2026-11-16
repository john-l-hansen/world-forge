import { describe, expect, it } from 'vitest';
import { TILE_DOORWAY, TILE_FLOOR, TILE_WALL, tileAt } from '../src/world/compile';
import { loadMines } from './helpers';

describe('world compiler', () => {
  const world = loadMines();

  it('carves rooms and doorways out of solid rock', () => {
    expect(tileAt(world, 5, 14)).toBe(TILE_FLOOR);
    expect(tileAt(world, 5, 11)).toBe(TILE_DOORWAY);
    expect(tileAt(world, 4, 11)).toBe(TILE_WALL);
    expect(tileAt(world, 0, 0)).toBe(TILE_WALL);
    expect(tileAt(world, -3, 99)).toBe(TILE_WALL);
  });

  it('keeps a wall around the whole map', () => {
    for (let x = 0; x < world.width; x++) {
      expect(tileAt(world, x, 0)).toBe(TILE_WALL);
      expect(tileAt(world, x, world.height - 1)).toBe(TILE_WALL);
    }
    for (let y = 0; y < world.height; y++) {
      expect(tileAt(world, 0, y)).toBe(TILE_WALL);
      expect(tileAt(world, world.width - 1, y)).toBe(TILE_WALL);
    }
  });

  it('works out which way each door faces', () => {
    const axis = Object.fromEntries(world.doors.map((d) => [d.def.id, d.axis]));
    expect(axis).toEqual({
      door_entrance_tunnel: 'ns',
      door_tunnel_hall: 'ns',
      door_hall_storeroom: 'ew',
      door_tunnel_shaft: 'ew',
      door_tunnel_cache: 'ew',
    });
  });

  it('every floor cell can be walked to from the start', () => {
    const seen = new Uint8Array(world.width * world.height);
    const queue = [world.start.y * world.width + world.start.x];
    seen[queue[0]] = 1;
    while (queue.length) {
      const i = queue.shift()!;
      const x = i % world.width;
      const y = Math.floor(i / world.width);
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        const ni = (y + dy) * world.width + (x + dx);
        if (world.tiles[ni] !== TILE_WALL && !seen[ni]) {
          seen[ni] = 1;
          queue.push(ni);
        }
      }
    }
    for (let i = 0; i < world.tiles.length; i++) {
      if (world.tiles[i] !== TILE_WALL) expect(seen[i]).toBe(1);
    }
  });

  it('bakes torchlight that fades with distance and stops at walls', () => {
    const at = (x: number, y: number) => world.light[y * world.width + x];
    expect(at(3, 13)).toBe(1);
    expect(at(4, 13)).toBeLessThan(at(3, 13));
    expect(at(4, 13)).toBeGreaterThan(at(5, 14));
    expect(at(2, 13)).toBe(0);
  });

  it('does not let torchlight shine through the secret door', () => {
    const at = (x: number, y: number) => world.light[y * world.width + x];
    // The cache torch at (8, 8) lights its own room but not the door cell.
    expect(at(7, 9)).toBeGreaterThan(0);
    expect(at(6, 9)).toBe(0);
  });

  it('places the enemies, chest, pickups and blocking props', () => {
    expect(world.spawns).toHaveLength(2);
    expect(world.chests).toHaveLength(1);
    expect(world.pickups.map((p) => p.itemId).sort()).toEqual(['item_shaft_key', 'item_wooden_shield']);
    expect(world.blocked[10 * world.width + 8]).toBe(1);
    expect(world.spawns[0]).toMatchObject({ instanceId: 'encounter_goblin_patrol#0', x: 5, y: 2 });
    expect(world.blocked[1 * world.width + 13]).toBe(1);
    expect(world.blocked[14 * world.width + 5]).toBe(0);
  });
});
