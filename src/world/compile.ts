/**
 * World engine: turns a validated world definition into the grid the
 * simulation and renderer both read. Pure data in, pure data out. No React,
 * no Three.js, no randomness.
 */
import type { DoorDef, Environment, Facing, ObjectDef, RoomDef, WorldDefinition } from '../schema/world';

export const TILE_WALL = 0;
export const TILE_FLOOR = 1;
export const TILE_DOORWAY = 2;

/** Facing as an index: 0 north, 1 east, 2 south, 3 west. North is -y. */
export const DIR_X = [0, 1, 0, -1] as const;
export const DIR_Y = [-1, 0, 1, 0] as const;
export const FACING_INDEX: Record<Facing, number> = { north: 0, east: 1, south: 2, west: 3 };
export const FACING_NAME: readonly Facing[] = ['north', 'east', 'south', 'west'];

export interface CompiledDoor {
  def: DoorDef;
  x: number;
  y: number;
  /** 'ns' when the passage runs north–south, 'ew' when it runs east–west. */
  axis: 'ns' | 'ew';
}

export interface CompiledTorch {
  id: string;
  x: number;
  y: number;
  wall: number;
  radius: number;
}

export interface CompiledProp {
  id: string;
  name: string;
  x: number;
  y: number;
  visualAssetId: Extract<ObjectDef, { type: 'prop' }>['visualAssetId'];
  blocking: boolean;
}

export interface CompiledChest {
  id: string;
  name: string;
  x: number;
  y: number;
  contents: string[];
}

export interface CompiledPickup {
  id: string;
  x: number;
  y: number;
  itemId: string;
}

export interface EnemySpawn {
  /** Stable instance ID: encounter ID plus placement index. */
  instanceId: string;
  enemyId: string;
  encounterId: string;
  x: number;
  y: number;
  facing: number;
}

export interface CompiledWorld {
  def: WorldDefinition;
  width: number;
  height: number;
  tiles: Uint8Array;
  /** Index into def.rooms for each cell, or -1. Doorways are -1. */
  roomAt: Int16Array;
  /** The environments this world uses, in the order its regions name them. */
  environments: Environment[];
  /** Index into `environments` for each open cell. A doorway takes after a room it joins. */
  envAt: Uint8Array;
  doors: CompiledDoor[];
  doorAt: Map<number, CompiledDoor>;
  torches: CompiledTorch[];
  props: CompiledProp[];
  chests: CompiledChest[];
  chestAt: Map<number, CompiledChest>;
  pickups: CompiledPickup[];
  /** Cells that a blocking prop or a chest occupies. */
  blocked: Uint8Array;
  spawns: EnemySpawn[];
  /** Baked torchlight per cell, 0..1. */
  light: Float32Array;
  start: { x: number; y: number; facing: number };
}

export const cellIndex = (w: CompiledWorld | { width: number }, x: number, y: number) => y * w.width + x;

export function inBounds(w: CompiledWorld, x: number, y: number) {
  return x >= 0 && y >= 0 && x < w.width && y < w.height;
}

export function tileAt(w: CompiledWorld, x: number, y: number) {
  return inBounds(w, x, y) ? w.tiles[y * w.width + x] : TILE_WALL;
}

export function roomAtCell(w: CompiledWorld, x: number, y: number): RoomDef | null {
  if (!inBounds(w, x, y)) return null;
  const i = w.roomAt[y * w.width + x];
  return i >= 0 ? w.def.rooms[i] : null;
}

/** Compile a world that has already passed validateWorld. */
export function compileWorld(def: WorldDefinition): CompiledWorld {
  let maxX = 0;
  let maxY = 0;
  for (const room of def.rooms) {
    maxX = Math.max(maxX, room.layout.x + room.layout.width - 1);
    maxY = Math.max(maxY, room.layout.y + room.layout.height - 1);
  }
  for (const door of def.doors) {
    maxX = Math.max(maxX, door.cell.x);
    maxY = Math.max(maxY, door.cell.y);
  }
  // One wall cell of margin on every side (rooms start at 1 or more).
  const width = maxX + 2;
  const height = maxY + 2;

  const tiles = new Uint8Array(width * height);
  const roomAt = new Int16Array(width * height).fill(-1);
  def.rooms.forEach((room, index) => {
    for (let y = room.layout.y; y < room.layout.y + room.layout.height; y++) {
      for (let x = room.layout.x; x < room.layout.x + room.layout.width; x++) {
        tiles[y * width + x] = TILE_FLOOR;
        roomAt[y * width + x] = index;
      }
    }
  });

  // Which environment each cell belongs to: its room's region decides.
  const environments: Environment[] = [];
  for (const region of def.regions) if (!environments.includes(region.environment)) environments.push(region.environment);
  const envOfRoom = def.rooms.map((room) => {
    const region = def.regions.find((r) => r.id === room.regionId);
    return Math.max(0, environments.indexOf(region?.environment ?? environments[0]));
  });
  const envAt = new Uint8Array(width * height);
  roomAt.forEach((room, i) => {
    if (room >= 0) envAt[i] = envOfRoom[room];
  });

  const doors: CompiledDoor[] = [];
  const doorAt = new Map<number, CompiledDoor>();
  for (const door of def.doors) {
    const { x, y } = door.cell;
    tiles[y * width + x] = TILE_DOORWAY;
    // A doorway is dressed like one of the rooms it joins.
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const room = roomAt[(y + dy) * width + (x + dx)];
      if (room !== undefined && room >= 0) {
        envAt[y * width + x] = envOfRoom[room];
        break;
      }
    }
  }
  for (const door of def.doors) {
    const { x, y } = door.cell;
    const open = (cx: number, cy: number) => tiles[cy * width + cx] !== TILE_WALL;
    const axis: 'ns' | 'ew' = open(x, y - 1) && open(x, y + 1) ? 'ns' : 'ew';
    const compiled: CompiledDoor = { def: door, x, y, axis };
    doors.push(compiled);
    doorAt.set(y * width + x, compiled);
  }

  const torches: CompiledTorch[] = [];
  const props: CompiledProp[] = [];
  const chests: CompiledChest[] = [];
  const chestAt = new Map<number, CompiledChest>();
  const pickups: CompiledPickup[] = [];
  const blocked = new Uint8Array(width * height);
  for (const obj of def.objects) {
    if (obj.type === 'torch') {
      torches.push({ id: obj.id, x: obj.cell.x, y: obj.cell.y, wall: FACING_INDEX[obj.wall], radius: obj.radius });
    } else if (obj.type === 'chest') {
      const chest = { id: obj.id, name: obj.name, x: obj.cell.x, y: obj.cell.y, contents: [...obj.contents] };
      chests.push(chest);
      chestAt.set(obj.cell.y * width + obj.cell.x, chest);
      blocked[obj.cell.y * width + obj.cell.x] = 1;
    } else if (obj.type === 'pickup') {
      pickups.push({ id: obj.id, x: obj.cell.x, y: obj.cell.y, itemId: obj.itemId });
    } else {
      props.push({
        id: obj.id,
        name: obj.name,
        x: obj.cell.x,
        y: obj.cell.y,
        visualAssetId: obj.visualAssetId,
        blocking: obj.blocking,
      });
      if (obj.blocking) blocked[obj.cell.y * width + obj.cell.x] = 1;
    }
  }

  const spawns: EnemySpawn[] = [];
  for (const enc of def.encounters) {
    enc.placements.forEach((p, i) => {
      spawns.push({
        instanceId: `${enc.id}#${i}`,
        enemyId: p.enemyId,
        encounterId: enc.id,
        x: p.cell.x,
        y: p.cell.y,
        facing: FACING_INDEX[p.facing],
      });
    });
  }

  // Torchlight spreads by walking distance, so it never leaks through walls.
  const light = new Float32Array(width * height);
  for (const torch of torches) {
    const dist = new Int16Array(width * height).fill(-1);
    const queue: number[] = [torch.y * width + torch.x];
    dist[queue[0]] = 0;
    while (queue.length) {
      const i = queue.shift()!;
      const d = dist[i];
      const level = 1 - d / (torch.radius + 1);
      if (level > light[i]) light[i] = level;
      if (d >= torch.radius) continue;
      const cx = i % width;
      const cy = (i - cx) / width;
      for (let dir = 0; dir < 4; dir++) {
        const nx = cx + DIR_X[dir];
        const ny = cy + DIR_Y[dir];
        const ni = ny * width + nx;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (tiles[ni] === TILE_WALL || dist[ni] >= 0) continue;
        // Light must not give a secret door away by shining through it.
        const hiddenKind = doorAt.get(ni)?.def.kind;
        if (hiddenKind === 'secret' || hiddenKind === 'breakable') continue;
        dist[ni] = d + 1;
        queue.push(ni);
      }
    }
  }

  return {
    def,
    width,
    height,
    tiles,
    roomAt,
    environments,
    envAt,
    doors,
    doorAt,
    torches,
    props,
    chests,
    chestAt,
    pickups,
    blocked,
    spawns,
    light,
    start: {
      x: def.settings.startCell.x,
      y: def.settings.startCell.y,
      facing: FACING_INDEX[def.settings.startFacing],
    },
  };
}
