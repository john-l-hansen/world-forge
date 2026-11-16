/**
 * Builds the dungeon mesh from a compiled world: one quad per floor, ceiling
 * and wall face, all sharing a single texture atlas. One cell is one unit.
 */
import * as THREE from 'three';
import { Pix, hash2 } from '../art/pixel';
import { TEX, dirtFloor, plankDoor, rockCeiling, stoneWall, timberFrame, timberWall } from '../art/textures';
import { DIR_X, DIR_Y, TILE_DOORWAY, TILE_WALL, type CompiledWorld } from '../world/compile';

export const TILE = { stoneA: 0, stoneB: 1, timber: 2, floor: 3, ceiling: 4, door: 5, frame: 6, floorB: 7 } as const;
const TILE_COUNT = 8;
export const DOOR_HEIGHT = 0.86;

export function buildAtlas(): Pix {
  const atlas = new Pix(TEX * TILE_COUNT, TEX);
  const tiles = [stoneWall(1), stoneWall(2), timberWall(3), dirtFloor(4), rockCeiling(5), plankDoor(6), timberFrame(7), dirtFloor(8)];
  tiles.forEach((t, i) => atlas.blit(t, i * TEX, 0));
  return atlas;
}

type V3 = [number, number, number];

class QuadBuilder {
  positions: number[] = [];
  uvs: number[] = [];
  lights: number[] = [];
  shades: number[] = [];
  indices: number[] = [];

  /**
   * Corners run bottom-left, bottom-right, top-right, top-left as seen from
   * the lit side. `v0`/`v1` pick a vertical slice of the tile.
   */
  quad(corners: [V3, V3, V3, V3], tile: number, light: [number, number, number, number], shade: number, v0 = 0, v1 = 1, rot = 0) {
    const base = this.positions.length / 3;
    const eps = 0.01 / TEX;
    const u0 = tile / TILE_COUNT + eps;
    const u1 = (tile + 1) / TILE_COUNT - eps;
    const uv: [number, number][] = [
      [u0, v0],
      [u1, v0],
      [u1, v1],
      [u0, v1],
    ];
    for (let i = 0; i < 4; i++) {
      this.positions.push(...corners[i]);
      this.uvs.push(...uv[(i + rot) % 4]);
      this.lights.push(light[i]);
      this.shades.push(shade);
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('aLight', new THREE.Float32BufferAttribute(this.lights, 1));
    g.setAttribute('aShade', new THREE.Float32BufferAttribute(this.shades, 1));
    g.setIndex(this.indices);
    return g;
  }
}

/** Torchlight at a cell corner: the average of the open cells that meet there. */
function cornerLight(world: CompiledWorld, ix: number, iz: number): number {
  let sum = 0;
  let n = 0;
  for (let dz = -1; dz <= 0; dz++) {
    for (let dx = -1; dx <= 0; dx++) {
      const x = ix + dx;
      const z = iz + dz;
      if (x < 0 || z < 0 || x >= world.width || z >= world.height) continue;
      if (world.tiles[z * world.width + x] === TILE_WALL) continue;
      sum += world.light[z * world.width + x];
      n++;
    }
  }
  return n ? sum / n : 0;
}

// Classic trick: walls facing north/south are drawn brighter than east/west.
const WALL_SHADE = [1.0, 0.8, 1.0, 0.8];

export function buildDungeonGeometry(world: CompiledWorld): THREE.BufferGeometry {
  const b = new QuadBuilder();
  const isWall = (x: number, z: number) =>
    x < 0 || z < 0 || x >= world.width || z >= world.height || world.tiles[z * world.width + x] === TILE_WALL;

  for (let z = 0; z < world.height; z++) {
    for (let x = 0; x < world.width; x++) {
      const tile = world.tiles[z * world.width + x];
      if (tile === TILE_WALL) continue;
      const doorway = tile === TILE_DOORWAY;
      const top = doorway ? DOOR_HEIGHT : 1;
      // Corner lights: nw, ne, se, sw.
      const lnw = cornerLight(world, x, z);
      const lne = cornerLight(world, x + 1, z);
      const lse = cornerLight(world, x + 1, z + 1);
      const lsw = cornerLight(world, x, z + 1);
      const x0 = x - 0.5;
      const x1 = x + 0.5;
      const z0 = z - 0.5;
      const z1 = z + 0.5;

      const rot = Math.floor(hash2(x, z, 77) * 4);
      const floorTile = doorway ? TILE.frame : hash2(x, z, 12) > 0.5 ? TILE.floor : TILE.floorB;
      b.quad([[x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0]], floorTile, [lsw, lse, lne, lnw], 0.95, 0, 1, doorway ? 0 : rot);
      b.quad([[x0, top, z0], [x1, top, z0], [x1, top, z1], [x0, top, z1]], doorway ? TILE.frame : TILE.ceiling, [lnw, lne, lse, lsw], 0.7);

      for (let dir = 0; dir < 4; dir++) {
        const nx = x + DIR_X[dir];
        const nz = z + DIR_Y[dir];
        const left = (dir + 3) % 4;
        const right = (dir + 1) % 4;
        const cx = x + DIR_X[dir] * 0.5;
        const cz = z + DIR_Y[dir] * 0.5;
        const lx = cx + DIR_X[left] * 0.5;
        const lz = cz + DIR_Y[left] * 0.5;
        const rx = cx + DIR_X[right] * 0.5;
        const rz = cz + DIR_Y[right] * 0.5;
        const ll = cornerLight(world, Math.round(lx + 0.5), Math.round(lz + 0.5));
        const lr = cornerLight(world, Math.round(rx + 0.5), Math.round(rz + 0.5));

        if (isWall(nx, nz)) {
          let wallTile: number;
          if (doorway) wallTile = TILE.frame;
          else {
            const h = hash2(x * 4 + dir, z, 5);
            wallTile = h < 0.34 ? TILE.timber : h < 0.67 ? TILE.stoneA : TILE.stoneB;
          }
          b.quad([[lx, 0, lz], [rx, 0, rz], [rx, top, rz], [lx, top, lz]], wallTile, [ll, lr, lr, ll], WALL_SHADE[dir], 0, top);
        } else if (doorway) {
          // Lintel above the opening, facing the neighbouring room. It is
          // seen from the far side, so swap left and right to face outward.
          b.quad([[rx, DOOR_HEIGHT, rz], [lx, DOOR_HEIGHT, lz], [lx, 1, lz], [rx, 1, rz]], TILE.frame, [lr, ll, ll, lr], WALL_SHADE[dir], DOOR_HEIGHT, 1);
        }
      }
    }
  }
  return b.build();
}

/** A door leaf: a single quad across the middle of its cell. */
export function buildDoorGeometry(axis: 'ns' | 'ew', light: number): THREE.BufferGeometry {
  const b = new QuadBuilder();
  const corners: [V3, V3, V3, V3] =
    axis === 'ns'
      ? [[-0.5, 0, 0], [0.5, 0, 0], [0.5, DOOR_HEIGHT, 0], [-0.5, DOOR_HEIGHT, 0]]
      : [[0, 0, 0.5], [0, 0, -0.5], [0, DOOR_HEIGHT, -0.5], [0, DOOR_HEIGHT, 0.5]];
  b.quad(corners, TILE.door, [light, light, light, light], axis === 'ns' ? 1 : 0.85);
  return b.build();
}
