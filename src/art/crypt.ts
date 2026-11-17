/**
 * Original 64×64 textures for the crypt tileset: cold dressed stone, burial
 * niches, flagstones and bronze doors. Same size and rules as the mine set.
 */
import { GOLD, INK, IRON } from './palette';
import { Pix, clampIndex, hash2, tileNoise, type Ramp } from './pixel';
import { TEX } from './textures';

/** Cold grey-blue stone, dark to light. */
export const CRYPT: Ramp = [0x121418, 0x1e2228, 0x2d323a, 0x40464f, 0x565d67, 0x6f7781, 0x8b929b];
const MOSS: Ramp = [0x1c2a1c, 0x2c3f28, 0x3f5634];
const BRONZE: Ramp = [0x2a1e10, 0x4a3518, 0x6e5224, 0x94733a, 0xbe9a58];
const OLD_BONE: Ramp = [0x4a4436, 0x7a705a, 0xa89c7e, 0xd0c5a4];

/** Dressed blocks in even courses. The mine's stone is rough; this was cut by masons. */
export function ashlarWall(seed: number): Pix {
  const p = new Pix(TEX, TEX);
  const rowH = 16;
  const blockW = 32;
  for (let y = 0; y < TEX; y++) {
    const row = Math.floor(y / rowH);
    const offset = row % 2 === 0 ? 0 : blockW / 2;
    for (let x = 0; x < TEX; x++) {
      const bx = Math.floor(((x + offset) % TEX) / blockW);
      const inX = (x + offset) % blockW;
      const inY = y % rowH;
      const tone = 3 + (hash2(bx, row, seed) - 0.5) * 1.6;
      let shade = tone + (tileNoise(x, y, 4, TEX, seed + 3) - 0.5) * 1.5;
      // Each block: lit along the top, shadowed along the bottom, with a mortar joint.
      if (inY === 1) shade += 1;
      if (inY === rowH - 1) shade -= 1.2;
      if (inX === 1) shade += 0.6;
      if (inX === blockW - 1) shade -= 0.8;
      if (inY === 0 || inX === 0) shade = 0.4;
      p.set(x, y, clampIndex(shade, CRYPT));
    }
  }
  // Hairline cracks.
  for (let i = 0; i < 3; i++) {
    let cx = Math.floor(hash2(i, 1, seed + 20) * TEX);
    let cy = Math.floor(hash2(i, 2, seed + 20) * 40);
    for (let n = 0; n < 12; n++) {
      p.set(cx, cy, CRYPT[1]);
      cy += 1;
      cx += hash2(n, i, seed + 21) > 0.6 ? 1 : hash2(n, i, seed + 22) > 0.7 ? -1 : 0;
      cx = (cx + TEX) % TEX;
    }
  }
  // Damp creeping up from the floor.
  for (let x = 0; x < TEX; x++) {
    const reach = Math.floor(tileNoise(x, 0, 8, TEX, seed + 30) * 12);
    for (let y = TEX - reach; y < TEX; y++) {
      if (hash2(x, y, seed + 31) > 0.45) p.set(x, y, MOSS[hash2(x, y, seed + 32) > 0.6 ? 1 : 0]);
    }
  }
  return p;
}

/** The same wall with an arched burial niche cut into it, and someone in it. */
export function nicheWall(seed: number): Pix {
  const p = ashlarWall(seed);
  const cx = 32;
  const top = 14;
  const bottom = 50;
  const half = 13;
  for (let y = top; y <= bottom; y++) {
    // A round-headed opening.
    const arch = y < top + half ? Math.sqrt(Math.max(0, half * half - (top + half - y) ** 2)) : half;
    for (let x = Math.round(cx - arch); x <= Math.round(cx + arch); x++) {
      const depth = (y - top) / (bottom - top);
      p.set(x, y, depth > 0.85 ? CRYPT[1] : INK);
    }
    // The dressed edge of the opening catches the light on the right.
    p.set(Math.round(cx - arch) - 1, y, CRYPT[1]);
    p.set(Math.round(cx + arch) + 1, y, CRYPT[5]);
  }
  for (let x = cx - half - 2; x <= cx + half + 2; x++) {
    p.set(x, bottom + 1, CRYPT[5]);
    p.set(x, bottom + 2, CRYPT[3]);
    p.set(x, bottom + 3, CRYPT[1]);
  }
  // A skull and a few long bones on the shelf.
  p.shaded(cx - 3, bottom - 6, 5, 4.5, OLD_BONE);
  p.rect(cx - 5, bottom - 3, 5, 2, OLD_BONE[1]);
  p.set(cx - 5, bottom - 6, INK);
  p.set(cx - 2, bottom - 6, INK);
  p.line(cx + 2, bottom - 1, cx + 11, bottom - 3, OLD_BONE[2], 1);
  p.line(cx + 3, bottom - 3, cx + 10, bottom - 1, OLD_BONE[1], 1);
  p.line(cx - 11, bottom - 1, cx - 7, bottom - 1, OLD_BONE[1], 1);
  return p;
}

/** Square flagstones, worn at the edges. */
export function flagFloor(seed: number): Pix {
  const p = new Pix(TEX, TEX);
  const size = 32;
  for (let y = 0; y < TEX; y++) {
    const row = Math.floor(y / size);
    const offset = row % 2 === 0 ? 0 : size / 2;
    for (let x = 0; x < TEX; x++) {
      const bx = Math.floor(((x + offset) % TEX) / size);
      const inX = (x + offset) % size;
      const inY = y % size;
      const tone = 2.2 + (hash2(bx, row, seed) - 0.5) * 1.4;
      let shade = tone + (tileNoise(x, y, 4, TEX, seed + 5) - 0.5) * 1.6 + (tileNoise(x, y, 16, TEX, seed + 6) - 0.5) * 0.8;
      const edge = Math.min(inX, inY, size - 1 - inX, size - 1 - inY);
      if (edge === 0) shade = 0.3;
      else if (edge === 1) shade -= 0.5;
      p.set(x, y, clampIndex(shade, CRYPT));
    }
  }
  // A crack across one flag and a scatter of grit.
  let cx = Math.floor(hash2(1, 1, seed + 40) * TEX);
  for (let y = 4; y < 30; y++) {
    p.set(cx, y, CRYPT[0]);
    cx = (cx + (hash2(y, 2, seed + 41) > 0.5 ? 1 : 0) - (hash2(y, 3, seed + 41) > 0.7 ? 1 : 0) + TEX) % TEX;
  }
  for (let i = 0; i < 40; i++) p.set(Math.floor(hash2(i, 5, seed + 42) * TEX), Math.floor(hash2(i, 6, seed + 42) * TEX), CRYPT[hash2(i, 7, seed) > 0.5 ? 4 : 1]);
  return p;
}

/** A low vault: dark stone crossed by ribs that meet in the middle. */
export function vaultCeiling(seed: number): Pix {
  const p = new Pix(TEX, TEX);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const centre = Math.hypot(x - 32, y - 32) / 45;
      const shade = 1 + centre * 1.4 + (tileNoise(x, y, 4, TEX, seed) - 0.5) * 1.4;
      p.set(x, y, clampIndex(shade, CRYPT));
    }
  }
  for (let i = 0; i < TEX; i++) {
    for (const [x, y] of [[i, i], [i, TEX - 1 - i]]) {
      p.set(x, y, CRYPT[4]);
      p.set(x + 1, y, CRYPT[3]);
      p.set(x - 1, y, CRYPT[1]);
    }
  }
  p.shaded(32, 32, 4, 4, [CRYPT[2], CRYPT[3], CRYPT[5]]);
  return p;
}

/** A bronze door in a stone surround, gone green at the edges. */
export function bronzeDoor(seed: number, locked = false): Pix {
  const p = new Pix(TEX, TEX);
  p.fill(INK);
  // Stone surround.
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      if (y >= 6 && x >= 6 && x < TEX - 6) continue;
      p.set(x, y, clampIndex(3.4 + (tileNoise(x, y, 4, TEX, seed) - 0.5) * 1.6 - (x >= TEX - 6 ? 1 : 0), CRYPT));
    }
  }
  // Two leaves of beaten bronze, each with two sunk panels.
  for (let y = 7; y < TEX; y++) {
    for (let x = 7; x < TEX - 7; x++) {
      const leaf = x < 32 ? 0 : 1;
      const inX = leaf === 0 ? x - 7 : x - 32;
      const panel = inX > 3 && inX < 21 && ((y > 11 && y < 32) || (y > 36 && y < 60));
      let shade = (panel ? 1.6 : 2.6) + (tileNoise(x, y, 4, TEX, seed + 9) - 0.5) * 1.2 - (leaf === 1 ? 0.3 : 0);
      if (panel && (inX === 4 || y === 12 || y === 37)) shade -= 1;
      if (panel && (inX === 20 || y === 31 || y === 59)) shade += 1.2;
      p.set(x, y, clampIndex(shade, BRONZE));
      // Verdigris where the damp gets in.
      if ((y > 54 || inX < 2) && hash2(x, y, seed + 11) > 0.6) p.set(x, y, hash2(x, y, seed + 12) > 0.5 ? 0x3c6a5a : 0x2a4a40);
    }
  }
  for (let y = 7; y < TEX; y++) {
    p.set(31, y, BRONZE[0]);
    p.set(32, y, INK);
  }
  // Studs along the top and bottom rails.
  for (let x = 10; x < TEX - 8; x += 7) {
    for (const y of [9, 34, 62]) {
      p.set(x, y, BRONZE[4]);
      p.set(x + 1, y + 1, BRONZE[0]);
    }
  }
  if (locked) {
    // A sigil plate across both leaves, with a keyhole.
    p.rect(22, 27, 20, 13, BRONZE[0]);
    p.rect(23, 28, 18, 11, IRON[3]);
    p.rect(23, 28, 18, 1, IRON[5]);
    p.rect(23, 28, 1, 11, IRON[4]);
    p.rect(40, 29, 1, 10, IRON[1]);
    p.rect(31, 31, 3, 3, INK);
    p.rect(32, 34, 1, 3, INK);
    for (const [rx, ry] of [[24, 29], [39, 29], [24, 37], [39, 37]]) p.set(rx, ry, GOLD[2]);
  } else {
    // A ring pull on each leaf.
    for (const hx of [26, 37]) {
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        p.set(hx + Math.cos(ang) * 3, 35 + Math.sin(ang) * 3, a < 8 ? BRONZE[0] : BRONZE[4]);
      }
      p.set(hx, 31, BRONZE[4]);
    }
  }
  return p;
}

/** The sides, sill and lintel of a doorway: tall dressed stones. */
export function stoneFrame(seed: number): Pix {
  const p = new Pix(TEX, TEX);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const block = Math.floor(x / 16);
      const inX = x % 16;
      let shade = 3.6 + (hash2(block, 0, seed) - 0.5) * 1.2 + (tileNoise(x, y, 4, TEX, seed + 2) - 0.5) * 1.4;
      if (inX === 0) shade = 0.6;
      if (inX === 1) shade += 0.8;
      if (inX === 15) shade -= 0.8;
      if (y < 8) shade += 0.6;
      if (y === 8) shade = 0.8;
      p.set(x, y, clampIndex(shade, CRYPT));
    }
  }
  return p;
}

/** Ashlar that hides a secret door: the joints run a little too straight. */
export function cryptSecretWall(seed: number): Pix {
  const p = ashlarWall(seed);
  for (let y = 4; y < TEX; y++) {
    for (const x of [8, 55]) if (hash2(x, y, seed + 50) > 0.45) p.set(x, y, CRYPT[0]);
  }
  for (let x = 8; x <= 55; x++) if (hash2(x, 4, seed + 51) > 0.5) p.set(x, 4, CRYPT[0]);
  return p;
}
