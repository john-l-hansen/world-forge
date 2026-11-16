/**
 * Original 64×64 environment textures for the mine tileset, generated from
 * the palette with repeatable noise. All of them tile.
 */
import { DIRT, GOLD, INK, IRON, RUST, STONE, WOOD } from './palette';
import { Pix, clampIndex, hash2, tileNoise, type Ramp } from './pixel';

export const TEX = 64;

/** Rough-cut stone blocks. `seed` gives each variant its own block pattern. */
export function stoneWall(seed: number): Pix {
  const p = new Pix(TEX, TEX);
  const rowH = 16;
  // Work out the block that owns each pixel.
  const blockId = new Int32Array(TEX * TEX);
  const edgeDist = new Int8Array(TEX * TEX);
  for (let row = 0; row < TEX / rowH; row++) {
    // Split each row into blocks of varying width with a per-row offset.
    const cuts: number[] = [];
    let x = Math.floor(hash2(row, 1, seed) * 16);
    while (x < TEX + 16) {
      cuts.push(x % TEX);
      x += 14 + Math.floor(hash2(row, cuts.length + 7, seed) * 16);
    }
    for (let px = 0; px < TEX; px++) {
      // Distance to nearest cut on either side (wrapping).
      let best = TEX;
      let owner = 0;
      for (let c = 0; c < cuts.length; c++) {
        const d = (px - cuts[c] + TEX) % TEX;
        if (d < best) {
          best = d;
          owner = c;
        }
      }
      let toNext = TEX;
      for (const cut of cuts) {
        const d = (cut - px + TEX) % TEX;
        if (d > 0 && d < toNext) toNext = d;
      }
      for (let py = 0; py < rowH; py++) {
        const y = row * rowH + py;
        blockId[y * TEX + px] = row * 31 + owner;
        // 0 = mortar, 1 = lit edge, 2 = shadowed edge, 3 = face
        let kind = 3;
        if (best === 0 || py === 0) kind = 0;
        else if (best === 1 || py === 1) kind = 1;
        else if (toNext === 1 || py === rowH - 1) kind = 2;
        edgeDist[y * TEX + px] = kind;
      }
    }
  }
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const i = y * TEX + x;
      const kind = edgeDist[i];
      if (kind === 0) {
        p.set(x, y, STONE[hash2(x, y, seed) < 0.2 ? 1 : 0]);
        continue;
      }
      const base = 2.2 + hash2(blockId[i], 3, seed) * 1.6;
      const grain = tileNoise(x, y, 4, TEX, seed + 11) * 1.5 + tileNoise(x, y, 16, TEX, seed + 5) * 1.2 - 1.35;
      let shade = base + grain;
      if (kind === 1) shade += 1;
      if (kind === 2) shade -= 1.2;
      // Rust-brown staining seeps down some blocks.
      const stain = tileNoise(x, y * 0.5, 16, TEX, seed + 40);
      const ramp: Ramp = stain > 0.74 && hash2(blockId[i], 9, seed) > 0.55 ? RUST : STONE;
      p.set(x, y, ramp === RUST ? clampIndex(shade - 2.6, RUST) : clampIndex(shade, STONE));
    }
  }
  // A few cracks.
  for (let c = 0; c < 3; c++) {
    let x = Math.floor(hash2(c, 50, seed) * TEX);
    let y = Math.floor(hash2(c, 51, seed) * TEX);
    const len = 6 + Math.floor(hash2(c, 52, seed) * 10);
    for (let s = 0; s < len; s++) {
      p.set(((x % TEX) + TEX) % TEX, ((y % TEX) + TEX) % TEX, STONE[0]);
      y += 1;
      x += Math.floor(hash2(c, 60 + s, seed) * 3) - 1;
    }
  }
  return p;
}

function plank(p: Pix, x0: number, y0: number, w: number, h: number, seed: number, vertical: boolean) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const along = vertical ? y : x;
      const across = vertical ? x - x0 : y - y0;
      const span = vertical ? w : h;
      let shade = 2.6 + tileNoise(across * 3 + seed * 13, along, 8, 1024, seed) * 1.6 - 0.6;
      if (hash2(across, Math.floor(along / 3), seed) > 0.86) shade -= 1; // grain flecks
      if (across === 0) shade += 1;
      if (across === span - 1) shade -= 1.6;
      p.set(x, y, clampIndex(shade, WOOD));
    }
  }
}

/** Stone wall braced by timber posts and a head beam: the mine's signature. */
export function timberWall(seed: number): Pix {
  const p = stoneWall(seed);
  plank(p, 0, 0, TEX, 7, seed + 3, false);
  plank(p, 4, 7, 8, TEX - 7, seed + 1, true);
  plank(p, TEX - 12, 7, 8, TEX - 7, seed + 2, true);
  // Shadow under the beam and iron nails.
  for (let x = 0; x < TEX; x++) p.set(x, 7, WOOD[0]);
  for (const nx of [7, 8, TEX - 9, TEX - 8]) p.set(nx, 3, IRON[4]);
  for (const nx of [7, TEX - 9]) p.set(nx, 4, IRON[1]);
  return p;
}

/** Packed earth with trodden stones. */
export function dirtFloor(seed: number): Pix {
  const p = new Pix(TEX, TEX);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const n = tileNoise(x, y, 8, TEX, seed) * 2 + tileNoise(x, y, 2, TEX, seed + 3) * 1.4 + tileNoise(x, y, 32, TEX, seed + 9) * 1.2;
      p.set(x, y, clampIndex(n - 0.5, DIRT));
    }
  }
  // Flat stones pressed into the dirt.
  for (let s = 0; s < 9; s++) {
    const cx = Math.floor(hash2(s, 1, seed) * TEX);
    const cy = Math.floor(hash2(s, 2, seed) * TEX);
    const rx = 3 + Math.floor(hash2(s, 3, seed) * 5);
    const ry = 2 + Math.floor(hash2(s, 4, seed) * 3);
    for (let y = -ry; y <= ry; y++) {
      for (let x = -rx; x <= rx; x++) {
        const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
        if (d > 1) continue;
        const px = (cx + x + TEX) % TEX;
        const py = (cy + y + TEX) % TEX;
        let shade = 2 + hash2(s, 5, seed) * 1.5 + (-(x / rx) * 0.6 - (y / ry) * 0.9);
        if (d > 0.72) shade = y > 0 || x > 0 ? 0 : shade + 0.5;
        p.set(px, py, clampIndex(shade, STONE));
      }
    }
  }
  // Cart ruts running along the tile.
  for (let y = 0; y < TEX; y++) {
    for (const rx of [20, 44]) {
      const wobble = Math.round(tileNoise(0, y, 16, TEX, seed + 70) * 2);
      if (hash2(rx, y, seed) > 0.25) p.set(rx + wobble, y, DIRT[0]);
      if (hash2(rx + 1, y, seed) > 0.6) p.set(rx + wobble + 1, y, DIRT[3]);
    }
  }
  return p;
}

/** Dark rock roof crossed by a timber beam, so every cell reads as a bay. */
export function rockCeiling(seed: number): Pix {
  const p = new Pix(TEX, TEX);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const n = tileNoise(x, y, 8, TEX, seed) * 2.2 + tileNoise(x, y, 4, TEX, seed + 2) * 1.5 + tileNoise(x, y, 32, TEX, seed + 4);
      p.set(x, y, clampIndex(n - 1.3, STONE));
    }
  }
  plank(p, 0, 28, TEX, 8, seed + 6, false);
  for (let x = 0; x < TEX; x++) {
    p.set(x, 36, STONE[0]);
    p.set(x, 37, STONE[0]);
  }
  plank(p, 28, 0, 8, 28, seed + 7, true);
  plank(p, 28, 36, 8, TEX - 36, seed + 8, true);
  return p;
}

/** A plank door with iron bands and a ring handle. */
export function plankDoor(seed: number): Pix {
  const p = new Pix(TEX, TEX);
  p.fill(INK);
  // Timber frame.
  plank(p, 0, 0, TEX, 6, seed + 1, false);
  plank(p, 0, 6, 6, TEX - 6, seed + 2, true);
  plank(p, TEX - 6, 6, 6, TEX - 6, seed + 3, true);
  // Door leaf: five vertical planks.
  const leafX = 7;
  const leafW = TEX - 14;
  const pw = leafW / 5;
  for (let i = 0; i < 5; i++) plank(p, Math.round(leafX + i * pw), 7, Math.round(pw), TEX - 7, seed + 10 + i, true);
  // Iron bands with rivets.
  for (const by of [16, 46]) {
    for (let x = leafX; x < leafX + leafW; x++) {
      p.set(x, by, IRON[3]);
      p.set(x, by + 1, IRON[2]);
      p.set(x, by + 2, IRON[2]);
      p.set(x, by + 3, IRON[0]);
    }
    for (let x = leafX + 3; x < leafX + leafW; x += 10) {
      p.set(x, by + 1, IRON[5]);
      p.set(x + 1, by + 2, IRON[0]);
    }
  }
  // Ring handle.
  const hx = leafX + leafW - 9;
  const hy = 33;
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2;
    p.set(hx + Math.cos(ang) * 3, hy + 2 + Math.sin(ang) * 3, a < 8 ? IRON[1] : IRON[4]);
  }
  p.set(hx, hy - 2, IRON[5]);
  p.set(hx, hy - 1, IRON[3]);
  return p;
}

/** The side walls of a doorway: heavy timber. */
export function timberFrame(seed: number): Pix {
  const p = new Pix(TEX, TEX);
  for (let i = 0; i < 4; i++) plank(p, i * 16, 0, 16, TEX, seed + i, true);
  plank(p, 0, 0, TEX, 8, seed + 9, false);
  for (let x = 0; x < TEX; x++) p.set(x, 8, WOOD[0]);
  return p;
}

/**
 * Stonework that hides a secret door. Close to the ordinary wall, but the
 * mortar is cracked through in a door-shaped seam for those who look.
 */
export function secretWall(seed: number): Pix {
  const p = stoneWall(seed);
  for (let y = 5; y < TEX; y++) {
    for (const x of [7, 56]) if (hash2(x, y, seed) > 0.5) p.set(x + (hash2(y, x, seed) > 0.8 ? 1 : 0), y, STONE[0]);
  }
  for (let x = 7; x <= 56; x++) if (hash2(x, 5, seed) > 0.55) p.set(x, 5 + (hash2(x, 9, seed) > 0.8 ? 1 : 0), STONE[0]);
  return p;
}

/** The plank door with a heavy lock plate in place of the ring handle. */
export function lockedDoor(seed: number): Pix {
  const p = plankDoor(seed);
  // Cover the ring handle with planking, then add a third band and the lock.
  plank(p, TEX - 23, 26, 11, 16, seed + 14, true);
  for (let x = 7; x < TEX - 7; x++) {
    p.set(x, 30, IRON[3]);
    p.set(x, 31, IRON[2]);
    p.set(x, 32, IRON[2]);
    p.set(x, 33, IRON[0]);
  }
  p.rect(TEX - 24, 25, 13, 15, IRON[1]);
  p.rect(TEX - 23, 26, 11, 13, IRON[3]);
  p.rect(TEX - 23, 26, 11, 1, IRON[5]);
  p.rect(TEX - 23, 26, 1, 13, IRON[4]);
  p.rect(TEX - 19, 30, 3, 3, INK);
  p.rect(TEX - 18, 33, 1, 3, INK);
  for (const [rx, ry] of [[TEX - 22, 27], [TEX - 14, 27], [TEX - 22, 37], [TEX - 14, 37]]) p.set(rx, ry, GOLD[2]);
  return p;
}
