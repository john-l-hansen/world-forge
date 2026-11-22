/**
 * The procedural layout builder: turns a plan's rooms and their parent links
 * into rectangles on a grid, with a door in the one-cell wall between each
 * room and its parent. Deterministic for a seed; returns null when a plan
 * will not fit with that seed, and the caller tries another.
 */
import { makeRng } from '../engine/rng';
import type { AdventurePlan, PlanVia } from './plan';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedDoor {
  a: string;
  b: string;
  x: number;
  y: number;
  via: PlanVia;
}

export interface Layout {
  rects: Map<string, Rect>;
  doors: PlacedDoor[];
  width: number;
  height: number;
}

/** At least one wall cell between two rooms, the rule the validator checks. */
const apart = (a: Rect, b: Rect) => a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y;

export function layOut(plan: AdventurePlan, seed: number): Layout | null {
  const rng = makeRng(seed * 31337 + 7);
  const shuffle = <T>(list: T[]): T[] => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const rects = new Map<string, Rect>();
  const doors: PlacedDoor[] = [];
  const fits = (r: Rect) => [...rects.values()].every((o) => apart(r, o));

  for (const room of plan.rooms) {
    if (!room.parent) {
      rects.set(room.key, { x: 0, y: 0, w: room.width, h: room.height });
      continue;
    }
    if (!rects.has(room.parent)) return null;
    const { width: w, height: h } = room;
    let placed = false;
    // Its planned parent first; if it will not fit there, any room already placed that is not a boss
    // room or a secret room. Progression holds: the boss stays behind its locked door wherever it opens.
    const sealed = new Set(plan.rooms.filter((r) => r.type === 'boss' || r.type === 'secret').map((r) => r.key));
    const parents = [room.parent, ...shuffle([...rects.keys()].filter((k) => k !== room.parent && !sealed.has(k)))];
    for (const parentKey of parents) {
      const p = rects.get(parentKey)!;
      for (const dir of shuffle(['n', 'e', 's', 'w'] as const)) {
        // Every offset that leaves the two rooms sharing at least one cell of wall.
        const vertical = dir === 'n' || dir === 's';
        const offsets = vertical ? range(p.x - w + 1, p.x + p.w - 1) : range(p.y - h + 1, p.y + p.h - 1);
        for (const o of shuffle(offsets)) {
          const r: Rect =
            dir === 'n'
              ? { x: o, y: p.y - 1 - h, w, h }
              : dir === 's'
                ? { x: o, y: p.y + p.h + 1, w, h }
                : dir === 'w'
                  ? { x: p.x - 1 - w, y: o, w, h }
                  : { x: p.x + p.w + 1, y: o, w, h };
          if (!fits(r)) continue;
          const span = vertical ? range(Math.max(p.x, r.x), Math.min(p.x + p.w, r.x + r.w) - 1) : range(Math.max(p.y, r.y), Math.min(p.y + p.h, r.y + r.h) - 1);
          // Keep doors off the corners where possible: they read better in the middle of a wall.
          const middle = span.length > 2 ? span.slice(1, -1) : span;
          const along = middle[Math.floor(rng() * middle.length)];
          const door =
            dir === 'n' ? { x: along, y: p.y - 1 } : dir === 's' ? { x: along, y: p.y + p.h } : dir === 'w' ? { x: p.x - 1, y: along } : { x: p.x + p.w, y: along };
          rects.set(room.key, r);
          doors.push({ a: parentKey, b: room.key, ...door, via: room.via });
          placed = true;
          break;
        }
        if (placed) break;
      }
      if (placed) break;
    }
    if (!placed) return null;
  }

  // Loops: a second opening between two neighbours, never into the boss or a secret room.
  const closed = new Set(plan.rooms.filter((r) => r.type === 'boss' || r.type === 'secret').map((r) => r.key));
  const joined = (a: string, b: string) => doors.some((d) => (d.a === a && d.b === b) || (d.a === b && d.b === a));
  const doorAt = (x: number, y: number) => doors.some((d) => Math.abs(d.x - x) + Math.abs(d.y - y) <= 1);
  let loops = plan.loops;
  const keys = shuffle([...rects.keys()].filter((k) => !closed.has(k)));
  for (let i = 0; i < keys.length && loops > 0; i++) {
    for (let j = i + 1; j < keys.length && loops > 0; j++) {
      const a = rects.get(keys[i])!;
      const b = rects.get(keys[j])!;
      if (joined(keys[i], keys[j])) continue;
      let cell: { x: number; y: number } | null = null;
      if (a.x + a.w + 1 === b.x || b.x + b.w + 1 === a.x) {
        const x = a.x + a.w + 1 === b.x ? a.x + a.w : b.x + b.w;
        const ys = range(Math.max(a.y, b.y), Math.min(a.y + a.h, b.y + b.h) - 1);
        if (ys.length) cell = { x, y: ys[Math.floor(ys.length / 2)] };
      } else if (a.y + a.h + 1 === b.y || b.y + b.h + 1 === a.y) {
        const y = a.y + a.h + 1 === b.y ? a.y + a.h : b.y + b.h;
        const xs = range(Math.max(a.x, b.x), Math.min(a.x + a.w, b.x + b.w) - 1);
        if (xs.length) cell = { x: xs[Math.floor(xs.length / 2)], y };
      }
      if (!cell || doorAt(cell.x, cell.y)) continue;
      doors.push({ a: keys[i], b: keys[j], ...cell, via: 'archway' });
      loops--;
    }
  }

  // Shift everything so the grid starts at 1, leaving an outer wall at 0.
  const all = [...rects.values()];
  const minX = Math.min(...all.map((r) => r.x)) - 1;
  const minY = Math.min(...all.map((r) => r.y)) - 1;
  for (const r of all) {
    r.x -= minX;
    r.y -= minY;
  }
  for (const d of doors) {
    d.x -= minX;
    d.y -= minY;
  }
  const width = Math.max(...all.map((r) => r.x + r.w)) + 1;
  const height = Math.max(...all.map((r) => r.y + r.h)) + 1;
  return { rects, doors, width, height };
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}
