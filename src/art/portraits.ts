/**
 * Original character portraits for the party interface.
 */
import { HAIR, INK, IRON, SKIN } from './palette';
import { Pix, hash2 } from './pixel';

export const PORTRAIT_W = 40;
export const PORTRAIT_H = 48;

/** Brannoc, the fighter: weathered, scarred, mail and plate at the shoulders. */
export function drawFighterPortrait(): Pix {
  const p = new Pix(PORTRAIT_W, PORTRAIT_H);
  // Backdrop: a dim blue-grey with a soft dithered glow behind the head.
  for (let y = 0; y < PORTRAIT_H; y++) {
    for (let x = 0; x < PORTRAIT_W; x++) {
      const d = Math.hypot(x - 20, y - 20) / 30;
      const dither = ((x + y) & 1) * 0.12;
      p.set(x, y, d + dither < 0.55 ? 0x2a2d3c : d + dither < 0.85 ? 0x1e2130 : 0x141622);
    }
  }
  // Shoulders: plate pauldrons over a mail collar.
  p.shaded(6, 47, 12, 9, [IRON[1], IRON[2], IRON[3], IRON[4]]);
  p.shaded(34, 47, 12, 9, [IRON[0], IRON[1], IRON[2], IRON[3]]);
  p.rect(12, 40, 16, 8, IRON[1]);
  for (let y = 40; y < 48; y++) for (let x = 12; x < 28; x++) if ((x + y * 2) % 3 === 0) p.set(x, y, IRON[3]);
  p.line(3, 41, 14, 39, IRON[5], 1);
  p.set(8, 44, IRON[5]);
  p.set(33, 45, IRON[4]);
  // Neck.
  p.rect(15, 33, 10, 8, SKIN[1]);
  p.rect(15, 33, 4, 8, SKIN[2]);
  p.rect(15, 38, 10, 2, SKIN[0]);
  // Hair behind the head.
  p.ellipse(20, 16, 12.5, 13, HAIR[0]);
  p.rect(8, 16, 4, 14, HAIR[0]);
  p.rect(28, 16, 4, 12, HAIR[0]);
  // Face: skull plus a squarer jaw.
  p.shaded(20, 21, 9.5, 12, [SKIN[1], SKIN[2], SKIN[3], SKIN[4]], -0.7, -0.5);
  p.shaded(20, 29, 8, 7.5, [SKIN[1], SKIN[2], SKIN[3]], -0.7, -0.3);
  // Hairline and a ragged fringe.
  p.poly([[10, 16], [11, 9], [20, 5], [29, 9], [30, 16], [27, 12], [23, 13], [19, 11], [15, 14], [12, 13]], HAIR[1]);
  for (const hx of [13, 17, 22, 26]) p.set(hx, 9, HAIR[2]);
  p.line(14, 8, 19, 6, HAIR[2], 1);
  // Brows, set low.
  p.line(12, 19, 17, 18, HAIR[0], 2);
  p.line(22, 18, 28, 19, HAIR[0], 2);
  // Eyes.
  p.rect(13, 21, 4, 2, SKIN[0]);
  p.rect(23, 21, 4, 2, SKIN[0]);
  p.set(14, 21, 0xd8d2c0);
  p.set(15, 21, 0x3a5a78);
  p.set(24, 21, 0x3a5a78);
  p.set(25, 21, 0xd8d2c0);
  // Nose: lit bridge, shadow on the right, nostrils.
  p.line(19, 20, 19, 26, SKIN[4], 1);
  p.line(21, 21, 21, 27, SKIN[1], 1);
  p.rect(18, 27, 4, 1, SKIN[1]);
  p.set(18, 27, SKIN[0]);
  p.set(21, 27, SKIN[0]);
  // Cheekbone shadow and the scar across the left cheek.
  p.line(26, 24, 27, 29, SKIN[1], 1);
  p.line(12, 23, 16, 28, 0xe6c3a0, 1);
  p.set(13, 23, SKIN[1]);
  // Mouth and a stubbled jaw.
  p.rect(16, 31, 8, 1, 0x4a1f1a);
  p.rect(17, 32, 6, 1, SKIN[2]);
  for (let y = 28; y < 38; y++) {
    for (let x = 11; x < 30; x++) {
      const c = p.get(x, y);
      const onFace = c === SKIN[1] || c === SKIN[2] || c === SKIN[3];
      const jaw = y > 32 || x < 14 || x > 26;
      if (onFace && jaw && hash2(x, y, 3) > 0.45) p.set(x, y, c === SKIN[3] ? SKIN[1] : SKIN[0]);
    }
  }
  p.line(15, 30, 24, 30, HAIR[1], 1); // moustache shadow
  // Ears.
  p.rect(9, 20, 2, 5, SKIN[2]);
  p.rect(30, 20, 2, 5, SKIN[1]);
  // Ink the outer frame.
  for (let x = 0; x < PORTRAIT_W; x++) {
    p.set(x, 0, INK);
    p.set(x, PORTRAIT_H - 1, INK);
  }
  for (let y = 0; y < PORTRAIT_H; y++) {
    p.set(0, y, INK);
    p.set(PORTRAIT_W - 1, y, INK);
  }
  return p;
}
