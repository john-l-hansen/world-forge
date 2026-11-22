/**
 * A top-down preview of a generated world, drawn to a canvas: rooms by
 * environment, doors by kind, and where the start, the boss, the enemies,
 * the chests and the loot are. Reads world data only.
 */
import type { WorldDefinition } from '../schema/world';

const FLOOR = { mine: '#5a4532', crypt: '#4a5260' } as const;
const DOOR = { archway: '#a08a5a', door: '#8a5a2a', secret: '#5a4532', breakable: '#d07a2a' } as const;

export function drawWorldMap(canvas: HTMLCanvasElement, world: WorldDefinition, maxW: number, maxH: number) {
  const right = Math.max(...world.rooms.map((r) => r.layout.x + r.layout.width)) + 1;
  const bottom = Math.max(...world.rooms.map((r) => r.layout.y + r.layout.height)) + 1;
  const cell = Math.max(1, Math.floor(Math.min(maxW / right, maxH / bottom)));
  canvas.width = right * cell;
  canvas.height = bottom * cell;
  // One canvas pixel to one screen pixel, whatever the page's other canvas rules say.
  canvas.style.width = `${canvas.width}px`;
  canvas.style.height = `${canvas.height}px`;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#0b0a0c';
  g.fillRect(0, 0, canvas.width, canvas.height);
  const envOf = new Map(world.regions.flatMap((reg) => reg.roomIds.map((id) => [id, reg.environment] as const)));
  for (const room of world.rooms) {
    const { x, y, width, height } = room.layout;
    g.fillStyle = room.type === 'boss' ? '#6a2a24' : room.type === 'entrance' ? '#3e5a2c' : FLOOR[envOf.get(room.id) ?? 'mine'];
    g.fillRect(x * cell, y * cell, width * cell, height * cell);
  }
  for (const door of world.doors) {
    g.fillStyle = door.lock ? '#d8553a' : DOOR[door.kind];
    g.fillRect(door.cell.x * cell, door.cell.y * cell, cell, cell);
  }
  const dot = (x: number, y: number, colour: string, size = 0.5) => {
    const s = Math.max(1, Math.round(cell * size));
    g.fillStyle = colour;
    g.fillRect(x * cell + Math.floor((cell - s) / 2), y * cell + Math.floor((cell - s) / 2), s, s);
  };
  for (const obj of world.objects) {
    if (obj.type === 'chest') dot(obj.cell.x, obj.cell.y, '#f0d878', 0.7);
    else if (obj.type === 'pickup') dot(obj.cell.x, obj.cell.y, '#d8cfb4', 0.4);
  }
  for (const enc of world.encounters) for (const p of enc.placements) dot(p.cell.x, p.cell.y, enc.boss ? '#ff5a3a' : '#c83a2a', enc.boss ? 0.9 : 0.55);
  dot(world.settings.startCell.x, world.settings.startCell.y, '#8fbf5a', 0.8);
}
