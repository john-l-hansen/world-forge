/**
 * A breakable wall, drawn over any set's wall texture: jagged cracks running
 * out from a weak point, a spill of grit at its foot, and with each stage more
 * cracks and missing chunks. It is meant to be seen.
 */
import { INK } from './palette';
import { Pix, hash2 } from './pixel';
import { TEX } from './textures';

const GRIT = [0x8a7a62, 0xa8977a, 0x6a5c48];

function crack(p: Pix, x0: number, y0: number, angle: number, length: number, seed: number, width: number) {
  let x = x0;
  let y = y0;
  let a = angle;
  for (let i = 0; i < length; i++) {
    a += (hash2(i, seed, 71) - 0.5) * 0.9;
    x += Math.cos(a);
    y += Math.sin(a);
    const w = Math.max(1, Math.round(width * (1 - i / length)));
    for (let k = 0; k < w; k++) p.set(Math.round(x) + k, Math.round(y), INK);
    // A faint lit lip along one side of the crack, now and then.
    if (hash2(i, seed, 70) > 0.55) p.set(Math.round(x) + w, Math.round(y) - 1, 0x7a6a54);
    // A shadowed side under it.
    p.set(Math.round(x), Math.round(y) + 1, 0x1c1712);
    // Branches.
    if (i > 4 && hash2(i, seed, 72) > 0.9 && length - i > 6) crack(p, x, y, a + (hash2(i, seed, 73) > 0.5 ? 0.9 : -0.9), Math.floor((length - i) * 0.5), seed * 7 + i, Math.max(1, width - 1));
  }
}

/** Stage 0 is how it first looks; stages 1 and 2 follow the first and second blows. */
export function crackedWall(base: Pix, stage: 0 | 1 | 2): Pix {
  const p = new Pix(TEX, TEX);
  p.blit(base, 0, 0);
  const cx = 32;
  const cy = 30;
  // The weak point: a shallow dent, darker stone.
  for (let y = cy - 7; y <= cy + 7; y++) {
    for (let x = cx - 8; x <= cx + 8; x++) {
      const d = Math.hypot(x - cx, (y - cy) * 1.2) / 8;
      if (d < 1 && hash2(x, y, 74) > d * 0.6) p.set(x, y, d < 0.45 ? 0x1c1712 : 0x2c241c);
    }
  }
  const arms = 6 + stage * 4;
  for (let i = 0; i < arms; i++) {
    const angle = (i / arms) * Math.PI * 2 + hash2(i, stage, 75) * 0.5;
    crack(p, cx, cy, angle, 12 + stage * 7 + Math.floor(hash2(i, 1, 76) * 8), i + 1, 2 + stage);
  }
  // Missing chunks, more each stage.
  for (let i = 0; i < stage * 3; i++) {
    const hx = cx - 14 + Math.floor(hash2(i, 2, 77) * 28);
    const hy = cy - 12 + Math.floor(hash2(i, 3, 77) * 24);
    const r = 2 + stage + Math.floor(hash2(i, 4, 77) * 2);
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (Math.hypot(x, y) <= r + hash2(x, y, i) - 0.5) p.set(hx + x, hy + y, INK);
    p.set(hx - r, hy - r, 0x7a6a54);
  }
  // Grit spilled at the foot of the wall.
  for (let x = 6; x < TEX - 6; x++) {
    const h = Math.floor((1 - Math.abs(x - cx) / 28) * (3 + stage * 2) * hash2(x, 5, 78));
    for (let y = TEX - h; y < TEX; y++) p.set(x, y, GRIT[Math.floor(hash2(x, y, 79) * 3)]);
  }
  return p;
}
