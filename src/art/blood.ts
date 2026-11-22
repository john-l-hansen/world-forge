/**
 * Blood on the floor, drawn as small pixel-art decals seen from above. Each
 * kind has three sizes (drops, spatter, pool) and four shapes. Original art,
 * drawn in code from fixed palettes.
 */
import { GORE } from './palette';
import { Pix, hash2, type Ramp } from './pixel';

export const STAIN_PX = 32;
export const STAIN_SHAPES = 4;
/** What the floor shows. `dry` is how every kind looks with gore turned down: old, dark and small. */
export type StainLook = 'red' | 'dark' | 'bone' | 'dry';
export const STAIN_LOOKS: readonly StainLook[] = ['red', 'dark', 'bone', 'dry'];

const RAMPS: Record<StainLook, Ramp> = {
  red: [GORE[0], GORE[1], GORE[2], GORE[3], GORE[4]],
  dark: [0x0c0a08, 0x16110c, 0x221a12, 0x2f2418, 0x3c2e1e],
  bone: [0x2a261e, 0x4a4436, 0x7a705a, 0xb2a684, 0xd8cfb4],
  dry: [0x120806, 0x1c0d09, 0x26120c, 0x2e1710, 0x351b12],
};

function blob(p: Pix, cx: number, cy: number, r: number, ramp: Ramp, seed: number) {
  // A rough disc, its rim broken up so no two look alike.
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      const rough = 1 + (hash2(x, y, seed) - 0.5) * 0.5;
      if (d > rough) continue;
      // Thicker and redder towards the middle, darker where it soaks into the floor.
      p.set(x, y, ramp[d < 0.55 ? 2 + (hash2(y, x, seed) > 0.75 ? 1 : 0) : d < 0.85 ? 2 : 1]);
    }
  }
}

/** One decal: `size` 1 is a few drops, 2 a spatter with a streak, 3 a pool. */
export function drawStain(look: StainLook, size: 1 | 2 | 3, shape: number): Pix {
  const p = new Pix(STAIN_PX, STAIN_PX);
  const ramp = RAMPS[look];
  const seed = shape * 31 + size * 7 + STAIN_LOOKS.indexOf(look) * 101;
  const c = STAIN_PX / 2;
  const rnd = (i: number) => hash2(i, shape, seed);

  if (look === 'bone') {
    // Chips and splinters, with grey dust between them.
    const n = size * 9;
    for (let i = 0; i < n * 3; i++) p.set(c + (rnd(i) - 0.5) * size * 10, c + (rnd(i + 99) - 0.5) * size * 9, ramp[1]);
    for (let i = 0; i < n; i++) {
      const x = c + (rnd(i + 7) - 0.5) * size * 9;
      const y = c + (rnd(i + 51) - 0.5) * size * 8;
      const long = rnd(i + 3) > 0.6;
      p.set(x, y, ramp[4]);
      if (long) p.set(x + 1, y + (rnd(i) > 0.5 ? 1 : 0), ramp[3]);
      p.set(x, y + 1, ramp[2]);
    }
    return p;
  }

  if (size === 3) {
    blob(p, c, c, 8.5, ramp, seed);
    for (let i = 0; i < 4; i++) blob(p, c + (rnd(i) - 0.5) * 14, c + (rnd(i + 9) - 0.5) * 12, 3 + rnd(i + 4) * 3, ramp, seed + i);
  } else if (size === 2) {
    blob(p, c, c, 4.5, ramp, seed);
    // A streak flung in one direction, thinning to drops.
    const a = rnd(5) * Math.PI * 2;
    for (let t = 0; t < 11; t++) {
      const r = Math.max(0.6, 2.4 - t * 0.2);
      blob(p, c + Math.cos(a) * (4 + t * 0.9), c + Math.sin(a) * (4 + t * 0.9), r, ramp, seed + t);
    }
  } else {
    blob(p, c, c, 2.2, ramp, seed);
  }
  // Loose drops around it.
  const drops = size * 5;
  for (let i = 0; i < drops; i++) {
    const a = rnd(i + 30) * Math.PI * 2;
    const r = 4 + rnd(i + 60) * (size * 4 + 2);
    p.set(c + Math.cos(a) * r, c + Math.sin(a) * r, ramp[rnd(i) > 0.5 ? 2 : 1]);
  }
  if (look === 'red') p.set(c - 2, c - 2, ramp[4]);
  return p;
}

/**
 * Every decal on one sheet: a row per look, twelve columns of
 * (size - 1) * STAIN_SHAPES + shape.
 */
export function drawStainSheet(): Pix {
  const cols = 3 * STAIN_SHAPES;
  const sheet = new Pix(cols * STAIN_PX, STAIN_LOOKS.length * STAIN_PX);
  STAIN_LOOKS.forEach((look, row) => {
    for (let size = 1 as 1 | 2 | 3; size <= 3; size = (size + 1) as 1 | 2 | 3) {
      for (let shape = 0; shape < STAIN_SHAPES; shape++) sheet.blit(drawStain(look, size, shape), ((size - 1) * STAIN_SHAPES + shape) * STAIN_PX, row * STAIN_PX);
    }
  });
  return sheet;
}

/**
 * A portrait after a hard fight: a gash across the face, blood running from
 * it, spatter. Drawn over a copy, only where the portrait already has paint.
 */
export function bloodied(source: Pix, seed = 1): Pix {
  const p = new Pix(source.w, source.h);
  p.data.set(source.data);
  const paint = (x: number, y: number, c: number) => {
    if (p.get(Math.round(x), Math.round(y)) !== -1) p.set(x, y, c);
  };
  const ox = Math.round((hash2(seed, 1, 5) - 0.5) * 4);
  // The gash, with a dark lip on one side.
  for (let t = 0; t <= 1; t += 0.04) {
    const x = 12 + ox + t * 11;
    const y = 15 + t * 11;
    paint(x, y, GORE[3]);
    paint(x + 1, y, GORE[1]);
  }
  // Blood running down from it, and from the brow.
  for (const [x0, y0, len] of [[17 + ox, 21, 7], [22 + ox, 26, 9], [14 + ox, 17, 4], [26, 11, 6]] as const) {
    for (let i = 0; i < len; i++) paint(x0, y0 + i, i < len - 2 ? GORE[2] : GORE[1]);
  }
  for (let i = 0; i < 14; i++) paint(8 + hash2(i, seed, 9) * 24, 8 + hash2(seed, i, 9) * 30, GORE[hash2(i, i, seed) > 0.5 ? 2 : 1]);
  return p;
}
