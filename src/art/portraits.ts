/**
 * Original character portraits for the party interface. One painter, four
 * sitters: each portrait is the same construction with its own colouring,
 * hair, features and dress, so the set reads as a matched group.
 */
import { GOLD, HAIR, INK, IRON, SKIN } from './palette';
import { Pix, hash2, type Ramp } from './pixel';

export const PORTRAIT_W = 40;
export const PORTRAIT_H = 48;
export type PortraitKind = 'fighter' | 'rogue' | 'mage' | 'cleric';

interface Sitter {
  backdrop: [number, number, number];
  skin: Ramp; // five shades, dark to light
  hair: Ramp; // three shades, dark to light
  hairStyle: 'short' | 'tied' | 'long' | 'coif';
  eyes: number;
  jaw: number;
  stubble: boolean;
  scar: boolean;
  dress: 'plate' | 'leather' | 'robe' | 'vestment';
}

const SITTERS: Record<PortraitKind, Sitter> = {
  // Brannoc: weathered, scarred, mail and plate at the shoulders.
  fighter: { backdrop: [0x2a2d3c, 0x1e2130, 0x141622], skin: SKIN, hair: HAIR, hairStyle: 'short', eyes: 0x3a5a78, jaw: 8, stubble: true, scar: true, dress: 'plate' },
  // Sela: sharp-eyed, dark hair tied back under a red band, dark leathers.
  rogue: { backdrop: [0x2f3a2c, 0x202a20, 0x141a15], skin: [0x4f3524, 0x714f35, 0x966f4c, 0xba9066, 0xd9b488], hair: [0x0e0c10, 0x1c1820, 0x2e2834], hairStyle: 'tied', eyes: 0x5a7a3a, jaw: 6.6, stubble: false, scar: false, dress: 'leather' },
  // Ilvane: pale and old, long silver hair, a high-collared blue robe.
  mage: { backdrop: [0x3a2d4a, 0x271f36, 0x181424], skin: [0x5c4638, 0x80644f, 0xa6876d, 0xc8aa8e, 0xe4cdb4], hair: [0x6e7480, 0xa4aab6, 0xd6dae2], hairStyle: 'long', eyes: 0x7a5ab0, jaw: 6.4, stubble: false, scar: false, dress: 'robe' },
  // Maren: dark-skinned, a white coif, vestments edged in gold.
  cleric: { backdrop: [0x4a3d22, 0x322a18, 0x1e1a10], skin: [0x2c1a12, 0x45291b, 0x623c27, 0x805238, 0x9e6a4a], hair: [0x8a8474, 0xbdb7a4, 0xe6e1d0], hairStyle: 'coif', eyes: 0x2a1c12, jaw: 7.4, stubble: false, scar: false, dress: 'vestment' },
};

export function drawPortrait(kind: PortraitKind): Pix {
  const s = SITTERS[kind];
  const p = new Pix(PORTRAIT_W, PORTRAIT_H);
  const [dark, , mid, light, bright] = [s.skin[0], s.skin[1], s.skin[2], s.skin[3], s.skin[4]];
  const shade = s.skin[1];

  // Backdrop: a soft dithered glow behind the head.
  for (let y = 0; y < PORTRAIT_H; y++) {
    for (let x = 0; x < PORTRAIT_W; x++) {
      const d = Math.hypot(x - 20, y - 20) / 30 + ((x + y) & 1) * 0.12;
      p.set(x, y, d < 0.55 ? s.backdrop[0] : d < 0.85 ? s.backdrop[1] : s.backdrop[2]);
    }
  }

  // Shoulders and dress.
  if (s.dress === 'plate') {
    p.shaded(6, 47, 12, 9, [IRON[1], IRON[2], IRON[3], IRON[4]]);
    p.shaded(34, 47, 12, 9, [IRON[0], IRON[1], IRON[2], IRON[3]]);
    p.rect(12, 40, 16, 8, IRON[1]);
    for (let y = 40; y < 48; y++) for (let x = 12; x < 28; x++) if ((x + y * 2) % 3 === 0) p.set(x, y, IRON[3]);
    p.line(3, 41, 14, 39, IRON[5], 1);
    p.set(8, 44, IRON[5]);
  } else if (s.dress === 'leather') {
    p.shaded(20, 50, 20, 11, [0x161210, 0x241c18, 0x342822, 0x46372e]);
    p.poly([[12, 40], [20, 46], [28, 40], [30, 44], [20, 48], [10, 44]], 0x5e1c1c); // a red scarf
    p.line(12, 40, 20, 46, 0x8a2c2c, 1);
    for (const [bx, by] of [[9, 45], [31, 45]]) p.set(bx, by, IRON[4]);
  } else if (s.dress === 'robe') {
    p.shaded(20, 51, 21, 12, [0x161a3a, 0x232a5a, 0x333e80, 0x4756a4]);
    p.poly([[11, 36], [15, 34], [16, 44], [10, 46]], 0x232a5a); // high collar
    p.poly([[29, 36], [25, 34], [24, 44], [30, 46]], 0x1a2048);
    p.line(11, 36, 10, 46, 0x6a7cd0, 1);
    p.shaded(20, 44, 2.4, 2.4, [0x4a2a7a, 0x8a5ad0, 0xd0b0ff]);
  } else {
    p.shaded(20, 51, 21, 12, [0x8f8a78, 0xb8b29c, 0xd8d2bc, 0xf0ecdc]);
    p.rect(18, 39, 4, 9, GOLD[2]);
    p.rect(15, 42, 10, 2, GOLD[2]);
    p.rect(18, 39, 1, 9, GOLD[3]);
    p.line(4, 44, 14, 40, GOLD[1], 1);
    p.line(36, 44, 26, 40, GOLD[0], 1);
  }

  // Neck.
  p.rect(15, 33, 10, 8, shade);
  p.rect(15, 33, 4, 8, mid);
  p.rect(15, 38, 10, 2, dark);

  // Hair behind the head.
  if (s.hairStyle === 'long') {
    p.ellipse(20, 17, 13, 14, s.hair[0]);
    p.rect(7, 16, 6, 26, s.hair[0]);
    p.rect(27, 16, 6, 26, s.hair[0]);
    for (const hx of [8, 10, 29, 31]) p.line(hx, 18, hx, 40, s.hair[1], 1);
  } else if (s.hairStyle === 'coif') {
    p.ellipse(20, 17, 13.5, 14, s.hair[1]);
    p.rect(7, 17, 6, 22, s.hair[1]);
    p.rect(27, 17, 6, 22, s.hair[0]);
    p.line(8, 14, 8, 38, s.hair[2], 1);
  } else {
    p.ellipse(20, 16, 12.5, 13, s.hair[0]);
    p.rect(8, 16, 4, s.hairStyle === 'tied' ? 9 : 14, s.hair[0]);
    p.rect(28, 16, 4, s.hairStyle === 'tied' ? 9 : 12, s.hair[0]);
  }

  // Face: skull plus jaw.
  p.shaded(20, 21, 9.5, 12, [shade, mid, light, bright], -0.7, -0.5);
  p.shaded(20, 29, s.jaw, 7.5, [shade, mid, light], -0.7, -0.3);

  // Hairline.
  if (s.hairStyle === 'short') {
    p.poly([[10, 16], [11, 9], [20, 5], [29, 9], [30, 16], [27, 12], [23, 13], [19, 11], [15, 14], [12, 13]], s.hair[1]);
    for (const hx of [13, 17, 22, 26]) p.set(hx, 9, s.hair[2]);
    p.line(14, 8, 19, 6, s.hair[2], 1);
  } else if (s.hairStyle === 'tied') {
    p.poly([[10, 15], [12, 8], [20, 5], [28, 8], [30, 15], [26, 11], [20, 10], [14, 11]], s.hair[1]);
    p.rect(10, 12, 20, 2, 0x8a2c2c); // headband
    p.rect(10, 12, 20, 1, 0xb84040);
    p.line(30, 13, 34, 18, 0x8a2c2c, 1);
  } else if (s.hairStyle === 'long') {
    p.poly([[10, 17], [11, 9], [20, 5], [29, 9], [30, 17], [26, 11], [20, 9], [14, 11]], s.hair[1]);
    p.line(13, 8, 20, 6, s.hair[2], 1);
    p.line(20, 6, 20, 10, s.hair[0], 1); // parting
  } else {
    p.poly([[9, 18], [10, 9], [20, 4], [30, 9], [31, 18], [28, 13], [20, 11], [12, 13]], s.hair[2]);
    p.line(12, 13, 28, 13, s.hair[0], 1);
  }

  // Brows and eyes.
  const brow = s.hairStyle === 'long' ? s.hair[0] : s.hairStyle === 'coif' ? dark : s.hair[0];
  p.line(12, 19, 17, 18, brow, s.dress === 'plate' ? 2 : 1);
  p.line(22, 18, 28, 19, brow, s.dress === 'plate' ? 2 : 1);
  p.rect(13, 21, 4, 2, dark);
  p.rect(23, 21, 4, 2, dark);
  p.set(14, 21, 0xd8d2c0);
  p.set(15, 21, s.eyes);
  p.set(24, 21, s.eyes);
  p.set(25, 21, 0xd8d2c0);

  // Nose, cheek and mouth.
  p.line(19, 20, 19, 26, bright, 1);
  p.line(21, 21, 21, 27, shade, 1);
  p.rect(18, 27, 4, 1, shade);
  p.set(18, 27, dark);
  p.set(21, 27, dark);
  p.line(26, 24, 27, 29, shade, 1);
  p.rect(16, 31, 8, 1, kind === 'rogue' ? 0x6a2a2a : 0x4a1f1a);
  p.rect(17, 32, 6, 1, mid);

  if (s.scar) {
    p.line(12, 23, 16, 28, 0xe6c3a0, 1);
    p.set(13, 23, shade);
  }
  if (s.stubble) {
    for (let y = 28; y < 38; y++) {
      for (let x = 11; x < 30; x++) {
        const c = p.get(x, y);
        const onFace = c === shade || c === mid || c === light;
        if (onFace && (y > 32 || x < 14 || x > 26) && hash2(x, y, 3) > 0.45) p.set(x, y, c === light ? shade : dark);
      }
    }
    p.line(15, 30, 24, 30, s.hair[1], 1);
  }
  if (kind === 'mage') {
    // Age: lines under the eyes and beside the mouth.
    p.line(13, 24, 16, 24, shade, 1);
    p.line(23, 24, 26, 24, shade, 1);
    p.line(15, 29, 16, 32, shade, 1);
    p.line(25, 29, 24, 32, shade, 1);
  }

  // Ears, where the hair leaves them showing.
  if (s.hairStyle === 'short' || s.hairStyle === 'tied') {
    p.rect(9, 20, 2, 5, mid);
    p.rect(30, 20, 2, 5, shade);
  }

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

export const drawFighterPortrait = () => drawPortrait('fighter');
