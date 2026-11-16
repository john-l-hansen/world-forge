/**
 * Original sprites: the goblin in each of its poses, wall torches, props and
 * the held sword. Each is posed from simple shapes, then outlined in ink so
 * the silhouette stays readable at 320×200.
 */
import { BLOOD, BONE, EYE_RED, EYE_YELLOW, FLAME, GOBLIN, GOLD, HIDE, INK, IRON, SKIN, STONE, WOOD } from './palette';
import { Pix, hash2, type Ramp } from './pixel';

export type GoblinPose = 'idle0' | 'idle1' | 'walk0' | 'walk1' | 'telegraph' | 'attack' | 'hurt' | 'dead';
export const GOBLIN_POSES: readonly GoblinPose[] = ['idle0', 'idle1', 'walk0', 'walk1', 'telegraph', 'attack', 'hurt', 'dead'];
export const GOBLIN_W = 64;
export const GOBLIN_H = 72;

export type GoblinVariant = 'goblin' | 'goblin_chief';

/** The colours and trappings that tell one kind of goblin from another. */
interface GoblinLook {
  g: Ramp; // skin, dark to light
  jerkin: Ramp;
  chief: boolean;
}
const LOOKS: Record<GoblinVariant, GoblinLook> = {
  goblin: { g: GOBLIN, jerkin: [HIDE[0], HIDE[1], HIDE[2], HIDE[3]], chief: false },
  // The chief: duskier hide, iron plate, a horned helm and red war paint.
  goblin_chief: { g: [0x1b1f12, 0x30381c, 0x495427, 0x667335, 0x8a9648], jerkin: [IRON[0], IRON[1], IRON[2], IRON[3]], chief: true },
};
let look: GoblinLook = LOOKS.goblin;
const skinRamp = (): Ramp => [look.g[1], look.g[2], look.g[3], look.g[4]];
const limbRamp = (): Ramp => [look.g[1], look.g[2], look.g[3]];

function cleaver(p: Pix, hx: number, hy: number, tx: number, ty: number) {
  // Handle from the hand towards the tip, then a crude wide blade.
  const dx = tx - hx;
  const dy = ty - hy;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const mx = hx + ux * len * 0.4;
  const my = hy + uy * len * 0.4;
  p.line(hx - ux * 3, hy - uy * 3, mx, my, WOOD[3], 2.4);
  const blade: [number, number][] = [
    [mx - nx * 1, my - ny * 1],
    [tx - nx * 1, ty - ny * 1],
    [tx + nx * 7 - ux * 2, ty + ny * 7 - uy * 2],
    [mx + nx * 6 + ux * 2, my + ny * 6 + uy * 2],
  ];
  p.poly(blade, IRON[3]);
  // Bright cutting edge and a dark spine.
  p.line(blade[3][0], blade[3][1], blade[2][0], blade[2][1], IRON[5], 1);
  p.line(blade[0][0], blade[0][1], blade[1][0], blade[1][1], IRON[1], 1);
  p.set(mx + nx * 3 + ux * 4, my + ny * 3 + uy * 4, IRON[1]); // notch
}

function goblinHead(p: Pix, cx: number, cy: number, mood: 'calm' | 'rage' | 'pain', scale = 1) {
  const rx = 12 * scale;
  const ry = 10 * scale;
  // Ears first so the head overlaps their roots.
  for (const s of [-1, 1]) {
    p.poly(
      [
        [cx + s * (rx - 3), cy - 4],
        [cx + s * (rx + 11), cy - 9],
        [cx + s * (rx + 6), cy - 2],
        [cx + s * (rx - 2), cy + 4],
      ],
      s < 0 ? look.g[3] : look.g[2],
    );
    p.line(cx + s * (rx + 1), cy - 3, cx + s * (rx + 7), cy - 6, look.g[1], 1);
  }
  p.shaded(cx, cy, rx, ry, skinRamp());
  // Heavy brow.
  p.line(cx - 9 * scale, cy - 5, cx - 2, cy - 2, look.g[0], 2);
  p.line(cx + 9 * scale, cy - 5, cx + 2, cy - 2, look.g[0], 2);
  // Eyes.
  if (mood === 'pain') {
    p.line(cx - 7, cy - 1, cx - 3, cy, INK, 1);
    p.line(cx + 7, cy - 1, cx + 3, cy, INK, 1);
  } else {
    const eye = mood === 'rage' ? EYE_RED : EYE_YELLOW;
    for (const s of [-1, 1]) {
      p.rect(Math.round(cx + s * 5 - 2), Math.round(cy - 1), 4, 3, eye);
      p.set(cx + s * 5 - (s > 0 ? 1 : 0), cy, INK);
      p.set(cx + s * 5 - 2 + (s > 0 ? 3 : 0), cy + 1, look.g[0]);
    }
  }
  // Nose.
  p.shaded(cx, cy + 3, 2.2, 2.6, [look.g[2], look.g[3], look.g[4]]);
  p.set(cx - 1, cy + 5, look.g[0]);
  p.set(cx + 1, cy + 5, look.g[0]);
  if (look.chief) {
    // War paint under the eyes.
    p.line(cx - 10, cy + 2, cx - 4, cy + 3, BLOOD[2], 1);
    p.line(cx + 10, cy + 2, cx + 4, cy + 3, BLOOD[2], 1);
    // Iron helm with a rim, a nose guard and two horns.
    p.poly([[cx - rx, cy - 3], [cx - rx + 2, cy - 9], [cx, cy - 13], [cx + rx - 2, cy - 9], [cx + rx, cy - 3]], IRON[3]);
    p.line(cx - rx + 3, cy - 9, cx, cy - 12, IRON[5], 1);
    p.line(cx - rx, cy - 3, cx + rx, cy - 3, IRON[1], 2);
    p.line(cx, cy - 3, cx, cy + 1, IRON[2], 2);
    for (const s of [-1, 1]) {
      p.limb(cx + s * (rx - 3), cy - 8, cx + s * (rx + 3), cy - 13, [0x8f876c, BONE, 0xf2ecd8], 4);
      p.limb(cx + s * (rx + 3), cy - 13, cx + s * (rx + 2), cy - 18, [0x8f876c, BONE], 2.5);
    }
  }
  // Mouth and teeth.
  const open = mood === 'calm' ? 2 : 5;
  p.rect(Math.round(cx - 7), Math.round(cy + 6), 15, open, INK);
  for (const tx of [-6, -3, 3, 6]) p.set(cx + tx, cy + 6, BONE);
  if (open > 2) {
    for (const tx of [-5, 5]) {
      p.set(cx + tx, cy + 6 + open - 1, BONE);
      p.set(cx + tx, cy + 6 + open - 2, BONE);
    }
    p.rect(Math.round(cx - 2), Math.round(cy + 8), 5, 2, BLOOD[1]);
  }
}

export function drawGoblin(pose: GoblinPose, variant: GoblinVariant = 'goblin'): Pix {
  look = LOOKS[variant];
  const p = new Pix(GOBLIN_W, GOBLIN_H);
  const cx = 32;

  if (pose === 'dead') {
    p.ellipse(34, 68, 22, 3.4, BLOOD[0]);
    p.ellipse(30, 68, 12, 2, BLOOD[1]);
    // Legs splayed to the right, body slumped, head on the left.
    p.limb(40, 63, 54, 66, limbRamp(), 5);
    p.limb(40, 60, 56, 61, limbRamp(), 5);
    p.shaded(34, 61, 13, 6.5, look.jerkin);
    p.limb(28, 58, 22, 50, limbRamp(), 4);
    p.shaded(15, 60, 9, 7, skinRamp());
    p.poly([[10, 55], [4, 46], [14, 53]], look.g[3]);
    p.line(11, 59, 14, 61, INK, 1);
    p.line(14, 59, 11, 61, INK, 1);
    p.rect(13, 64, 6, 1, INK);
    cleaver(p, 42, 69, 60, 66);
    p.outline(INK);
    return p;
  }

  const bob = pose === 'idle1' ? 1 : 0;
  const crouch = pose === 'attack' ? 4 : pose === 'telegraph' ? -1 : 0;
  const lean = pose === 'hurt' ? -2 : 0;
  const y = (v: number) => v + bob + crouch;

  // Legs and feet.
  const liftL = pose === 'walk0' ? 3 : 0;
  const liftR = pose === 'walk1' ? 3 : 0;
  const spread = pose === 'attack' ? 3 : 0;
  p.limb(cx - 6 - spread, y(50), cx - 8 - spread, 64 - liftL, limbRamp(), 6);
  p.limb(cx + 6 + spread, y(50), cx + 8 + spread, 64 - liftR, limbRamp(), 6);
  p.ellipse(cx - 9 - spread, 67 - liftL, 5.5, 2.6, look.g[1]);
  p.ellipse(cx + 9 + spread, 67 - liftR, 5.5, 2.6, look.g[1]);
  p.set(cx - 13 - spread, 68 - liftL, BONE);
  p.set(cx + 13 + spread, 68 - liftR, BONE);

  // Off-hand arm (viewer's left), behind the torso.
  if (pose === 'telegraph') p.limb(cx - 10, y(36), cx - 18, y(30), limbRamp(), 5);
  else if (pose === 'attack') p.limb(cx - 10, y(37), cx - 19, y(46), limbRamp(), 5);
  else p.limb(cx - 10 + lean, y(37), cx - 16 + lean, y(49), limbRamp(), 5);
  const handL: [number, number] =
    pose === 'telegraph' ? [cx - 19, y(28)] : pose === 'attack' ? [cx - 20, y(48)] : [cx - 17 + lean, y(51)];
  p.shaded(handL[0], handL[1], 3, 3, limbRamp());

  // Torso: a ragged hide jerkin with a belt.
  p.shaded(cx + lean, y(42), 11.5, 12, look.jerkin);
  for (let i = -10; i <= 10; i += 3) p.poly([[cx + i + lean, y(52)], [cx + i + 3 + lean, y(52)], [cx + i + 1.5 + lean, y(56)]], HIDE[1]);
  p.rect(cx - 11 + lean, y(47), 23, 2, HIDE[0]);
  p.rect(cx - 1 + lean, y(47), 3, 2, GOLD[2]);
  // Bone necklace.
  for (let i = -5; i <= 5; i += 2.5) p.set(cx + i + lean, y(34) + Math.round(3 - Math.abs(i) * 0.5), BONE);

  if (look.chief) {
    for (const s of [-1, 1]) {
      p.shaded(cx + s * 12 + lean, y(34), 5.5, 4.5, [IRON[1], IRON[2], IRON[3], IRON[5]]);
      p.poly([[cx + s * 11 + lean, y(31)], [cx + s * 15 + lean, y(31)], [cx + s * 15 + lean, y(25)]], IRON[4]);
    }
    for (const [rx, ry] of [[-6, 40], [0, 43], [6, 40], [-4, 46], [4, 46]]) p.set(cx + rx + lean, y(ry), GOLD[2]);
  }

  // Head.
  const headY = pose === 'attack' ? y(22) : y(21);
  goblinHead(p, cx + lean * 1.5, headY, pose === 'telegraph' || pose === 'attack' ? 'rage' : pose === 'hurt' ? 'pain' : 'calm', pose === 'attack' ? 1.08 : 1);

  // Weapon arm (viewer's right), in front of everything.
  if (pose === 'telegraph') {
    // Cleaver hauled back over the head: the tell.
    p.limb(cx + 10, y(36), cx + 19, y(28), limbRamp(), 5);
    p.limb(cx + 19, y(28), cx + 17, y(16), limbRamp(), 5);
    cleaver(p, cx + 17, y(14), cx + 27, 1);
    p.shaded(cx + 17, y(15), 3.2, 3.2, limbRamp());
  } else if (pose === 'attack') {
    // Chopped down and across the body.
    p.limb(cx + 11, y(37), cx + 8, y(47), limbRamp(), 5);
    p.limb(cx + 8, y(47), cx - 2, y(52), limbRamp(), 5);
    cleaver(p, cx - 3, y(53), cx - 22, 66);
    p.shaded(cx - 3, y(53), 3.4, 3.4, limbRamp());
  } else {
    p.limb(cx + 10 + lean, y(37), cx + 17 + lean, y(46), limbRamp(), 5);
    p.limb(cx + 17 + lean, y(46), cx + 19 + lean, y(53), limbRamp(), 5);
    cleaver(p, cx + 19 + lean, y(54), cx + 28 + lean, y(31));
    p.shaded(cx + 19 + lean, y(54), 3.2, 3.2, limbRamp());
  }

  p.outline(INK);
  return p;
}

/** Wall torch: iron bracket with a flame. Three flicker frames. */
export const TORCH_W = 16;
export const TORCH_H = 32;
export function drawTorch(frame: number): Pix {
  const p = new Pix(TORCH_W, TORCH_H);
  // Bracket and shaft.
  p.rect(7, 16, 2, 13, WOOD[3]);
  p.rect(7, 16, 1, 13, WOOD[4]);
  p.rect(5, 14, 6, 3, IRON[3]);
  p.rect(5, 14, 6, 1, IRON[5]);
  p.rect(6, 22, 4, 1, IRON[2]);
  p.line(8, 28, 12, 30, IRON[2], 1);
  // Flame, built from stacked blobs that shift with the frame.
  const sway = [0, 1, -1][frame % 3];
  const tall = [0, 2, 1][frame % 3];
  p.ellipse(8, 11, 4, 4, FLAME[1]);
  p.ellipse(8 + sway * 0.5, 9 - tall * 0.5, 3.2, 4.5, FLAME[2]);
  p.poly([[5, 9], [8 + sway, 1 - tall], [11, 9]], FLAME[2]);
  p.ellipse(8, 11, 2.2, 3, FLAME[3]);
  p.poly([[6.5, 10], [8 + sway * 0.5, 5 - tall * 0.5], [9.5, 10]], FLAME[3]);
  p.ellipse(8, 12, 1.2, 1.6, FLAME[4]);
  if (frame % 3 === 1) p.set(10, 2, FLAME[2]);
  if (frame % 3 === 2) p.set(5, 3, FLAME[1]);
  p.outline(INK);
  // The flame has no ink outline above the bracket; soften it back to ember.
  for (let y = 0; y < 14; y++) for (let x = 0; x < TORCH_W; x++) if (p.get(x, y) === INK) p.set(x, y, FLAME[0]);
  return p;
}

export type PropKind = 'barrel' | 'crate' | 'rubble';
export const PROP_SIZE: Record<PropKind, { w: number; h: number }> = {
  barrel: { w: 32, h: 40 },
  crate: { w: 36, h: 34 },
  rubble: { w: 48, h: 24 },
};

export function drawProp(kind: PropKind): Pix {
  const { w, h } = PROP_SIZE[kind];
  const p = new Pix(w, h);
  if (kind === 'barrel') {
    for (let y = 3; y < h - 2; y++) {
      const t = (y - 3) / (h - 6);
      const bulge = Math.sin(t * Math.PI) * 3.5;
      const half = 10 + bulge;
      for (let x = Math.round(16 - half); x <= Math.round(16 + half); x++) {
        const u = (x - 16) / half;
        const stave = Math.floor((u + 1) * 3.5);
        let shade = 3.4 - u * 1.8 - Math.abs(u) * 0.8 + (hash2(stave, y >> 2, 5) - 0.5) * 0.8;
        if (Math.abs(((u + 1) * 3.5) % 1) < 0.12) shade -= 1.2;
        p.set(x, y, WOOD[Math.max(0, Math.min(5, Math.round(shade)))]);
      }
    }
    for (const by of [7, 8, 30, 31]) {
      for (let x = 0; x < w; x++) if (p.get(x, by) !== -1) p.set(x, by, x < 13 ? IRON[4] : x < 22 ? IRON[3] : IRON[1]);
    }
    p.ellipse(16, 4, 9.5, 2.2, WOOD[4]);
    p.ellipse(16, 4, 7.5, 1.4, WOOD[2]);
  } else if (kind === 'crate') {
    p.rect(2, 4, 32, 28, WOOD[2]);
    for (let i = 0; i < 4; i++) {
      for (let y = 4; y < 32; y++) {
        for (let x = 2 + i * 8; x < 10 + i * 8; x++) {
          const shade = 2.2 + (hash2(i, y >> 1, 3) - 0.5) * 1.2 + (x === 2 + i * 8 ? 1 : 0) - (x === 9 + i * 8 ? 1.2 : 0) - (x - 2) / 32;
          p.set(x, y, WOOD[Math.max(0, Math.min(5, Math.round(shade)))]);
        }
      }
    }
    // Frame boards and a diagonal brace.
    p.rect(2, 4, 32, 4, WOOD[4]);
    p.rect(2, 28, 32, 4, WOOD[3]);
    p.rect(2, 4, 4, 28, WOOD[4]);
    p.rect(30, 4, 4, 28, WOOD[2]);
    p.line(7, 27, 29, 9, WOOD[3], 3);
    p.line(7, 26, 29, 8, WOOD[5], 1);
    p.rect(2, 8, 32, 1, WOOD[1]);
    for (const [nx, ny] of [[4, 6], [31, 6], [4, 29], [31, 29]]) p.set(nx, ny, IRON[4]);
  } else {
    // A heap of broken stone.
    const rocks: [number, number, number, number, number][] = [
      [10, 18, 9, 5, 2], [24, 16, 11, 7, 3], [38, 19, 8, 4, 2], [17, 11, 6, 4, 3], [31, 9, 5, 3, 2], [6, 21, 4, 2, 1], [44, 21, 3, 2, 1],
    ];
    for (const [rx, ry, rw, rh, base] of rocks) {
      p.shaded(rx, ry, rw, rh, [STONE[base - 1], STONE[base], STONE[base + 1], STONE[base + 2], STONE[base + 3]]);
    }
    p.line(20, 20, 30, 12, WOOD[2], 2); // a snapped pit prop
    p.line(20, 19, 30, 11, WOOD[4], 1);
  }
  p.outline(INK);
  return p;
}

/** The player's sword arm, seen from the eyes. Drawn pointing up and left. */
export const SWORD_W = 96;
export const SWORD_H = 112;
export function drawSword(): Pix {
  const p = new Pix(SWORD_W, SWORD_H);
  // Blade from the guard near the bottom right to the tip at the upper left.
  const gx = 62;
  const gy = 74;
  const tx = 14;
  const ty = 4;
  const dx = tx - gx;
  const dy = ty - gy;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const half = 4.2;
  const shoulder: [number, number] = [gx + ux * (len - 12), gy + uy * (len - 12)];
  p.poly(
    [
      [gx - nx * half, gy - ny * half],
      [shoulder[0] - nx * half * 0.8, shoulder[1] - ny * half * 0.8],
      [tx, ty],
      [shoulder[0], shoulder[1]],
      [gx, gy],
    ],
    IRON[5],
  );
  p.poly(
    [
      [gx + nx * half, gy + ny * half],
      [shoulder[0] + nx * half * 0.8, shoulder[1] + ny * half * 0.8],
      [tx, ty],
      [shoulder[0], shoulder[1]],
      [gx, gy],
    ],
    IRON[3],
  );
  p.line(gx, gy, shoulder[0], shoulder[1], IRON[2], 1); // fuller
  // Nicks along the edge.
  for (const t of [0.3, 0.55, 0.72]) p.set(gx + ux * len * t - nx * half, gy + uy * len * t - ny * half, IRON[1]);
  // Crossguard.
  p.line(gx - nx * 12, gy - ny * 12, gx + nx * 12, gy + ny * 12, GOLD[1], 4);
  p.line(gx - nx * 12 - ux, gy - ny * 12 - uy, gx + nx * 12 - ux, gy + ny * 12 - uy, GOLD[3], 1);
  // Grip, held in a leather-gloved fist, with the forearm running off-screen.
  p.line(gx - ux * 4, gy - uy * 4, gx - ux * 22, gy - uy * 22, WOOD[1], 5);
  p.limb(gx - ux * 16 + 4, gy - uy * 16 + 4, SWORD_W + 8, SWORD_H + 10, [HIDE[0], HIDE[1], HIDE[2]], 20);
  p.shaded(gx - ux * 13 + 2, gy - uy * 13 + 1, 11, 10, [HIDE[0], HIDE[1], HIDE[2], HIDE[3]]);
  // Knuckles and thumb.
  for (let k = 0; k < 4; k++) {
    const kx = gx - ux * (6 + k * 5) - nx * 7;
    const ky = gy - uy * (6 + k * 5) - ny * 7;
    p.shaded(kx, ky, 3.2, 3.2, [HIDE[1], HIDE[2], HIDE[3]]);
  }
  p.shaded(gx - ux * 8 + nx * 7, gy - uy * 8 + ny * 7, 4, 3, [SKIN[1], SKIN[2], SKIN[3]]);
  // Pommel peeking past the fist.
  p.shaded(gx - ux * 25, gy - uy * 25, 3.5, 3.5, [GOLD[0], GOLD[1], GOLD[2], GOLD[3]]);
  p.outline(INK);
  return p;
}

/** A banded chest: frame 0 closed, frame 1 open. */
export const CHEST_W = 44;
export const CHEST_H = 38;
export function drawChest(open: boolean): Pix {
  const p = new Pix(CHEST_W, CHEST_H);
  const boards = (x0: number, y0: number, w: number, h: number, seed: number) => {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const board = Math.floor((y - y0) / 5);
        let shade = 2.6 + (hash2(x >> 2, board, seed) - 0.5) * 1.4 - (x - x0) / w;
        if ((y - y0) % 5 === 0) shade += 1;
        if ((y - y0) % 5 === 4) shade -= 1.2;
        p.set(x, y, WOOD[Math.max(0, Math.min(5, Math.round(shade)))]);
      }
    }
  };
  // Body.
  boards(4, 20, 36, 16, 3);
  if (open) {
    // Lid thrown back: we see its underside above a dark, glinting inside.
    boards(5, 2, 34, 10, 5);
    p.rect(4, 12, 36, 8, INK);
    p.rect(6, 14, 32, 5, 0x1a1208);
    for (const [gx, gy, c] of [[11, 16, GOLD[3]], [15, 17, GOLD[2]], [20, 15, GOLD[3]], [26, 17, GOLD[2]], [31, 16, GOLD[3]], [23, 18, GOLD[1]], [17, 15, GOLD[1]]] as const) p.set(gx, gy, c);
    for (const bx of [8, 32]) p.rect(bx, 2, 3, 10, IRON[2]);
  } else {
    // Rounded lid.
    for (let y = 8; y < 20; y++) {
      const inset = y < 11 ? 11 - y : 0;
      for (let x = 4 + inset; x < 40 - inset; x++) {
        let shade = 3.4 - (y - 8) * 0.12 - (x - 4) / 36 + (hash2(x >> 2, y >> 2, 9) - 0.5);
        if (y === 8 + (inset ? 11 - 8 - inset : 0)) shade += 1;
        p.set(x, y, WOOD[Math.max(0, Math.min(5, Math.round(shade)))]);
      }
    }
    p.rect(4, 19, 36, 1, WOOD[0]);
  }
  // Iron bands, corners and the lock.
  for (const bx of [8, 32]) {
    p.rect(bx, open ? 20 : 8, 3, open ? 16 : 28, IRON[3]);
    p.rect(bx, open ? 20 : 8, 1, open ? 16 : 28, IRON[5]);
  }
  p.rect(4, 34, 36, 2, IRON[1]);
  p.rect(19, 21, 6, 7, GOLD[1]);
  p.rect(19, 21, 6, 1, GOLD[3]);
  p.rect(21, 23, 2, 3, INK);
  p.outline(INK);
  return p;
}

/** A heavy iron key lying on the floor, with a glint so it can be spotted. */
export const KEY_W = 24;
export const KEY_H = 14;
export function drawKey(frame: number): Pix {
  const p = new Pix(KEY_W, KEY_H);
  // Bow (ring), shank and bit.
  for (let a = 0; a < 24; a++) {
    const ang = (a / 24) * Math.PI * 2;
    p.set(6 + Math.cos(ang) * 4, 7 + Math.sin(ang) * 4, a > 8 && a < 20 ? GOLD[3] : GOLD[1]);
    p.set(6 + Math.cos(ang) * 3, 7 + Math.sin(ang) * 3, GOLD[2]);
  }
  p.rect(10, 6, 11, 2, GOLD[2]);
  p.rect(10, 6, 11, 1, GOLD[3]);
  p.rect(17, 8, 2, 3, GOLD[2]);
  p.rect(20, 8, 2, 4, GOLD[2]);
  p.outline(INK);
  if (frame % 2 === 1) {
    // Glint.
    p.set(4, 4, 0xffffff);
    p.set(3, 4, GOLD[3]);
    p.set(5, 4, GOLD[3]);
    p.set(4, 3, GOLD[3]);
    p.set(4, 5, GOLD[3]);
  }
  return p;
}

/** A round wooden shield, propped where it was dropped. */
function drawShield(frame: number): Pix {
  const p = new Pix(26, 26);
  for (let y = 0; y < 26; y++) {
    for (let x = 0; x < 26; x++) {
      const dx = (x - 12.5) / 12;
      const dy = (y - 12.5) / 12;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      if (d > 0.8) p.set(x, y, dx + dy < 0 ? IRON[5] : IRON[2]);
      else {
        const board = Math.floor(x / 4);
        const shade = 3 - dx * 1.2 - dy * 1.4 + (hash2(board, y >> 2, 4) - 0.5) - (x % 4 === 3 ? 1.2 : 0);
        p.set(x, y, WOOD[Math.max(0, Math.min(5, Math.round(shade)))]);
      }
    }
  }
  p.shaded(12.5, 12.5, 3.6, 3.6, [IRON[1], IRON[3], IRON[4], IRON[5]]);
  p.outline(INK);
  if (frame % 2 === 1) {
    p.set(11, 11, 0xffffff);
    p.set(10, 11, IRON[5]);
    p.set(11, 10, IRON[5]);
  }
  return p;
}

/** A tied sack: the stand-in for any pickup without art of its own. */
function drawSack(): Pix {
  const p = new Pix(20, 20);
  p.shaded(10, 12, 8, 7, [HIDE[0], HIDE[1], HIDE[2], HIDE[3]]);
  p.poly([[7, 6], [13, 6], [12, 2], [8, 2]], HIDE[2]);
  p.rect(7, 5, 6, 1, GOLD[1]);
  p.outline(INK);
  return p;
}

/** A rolled scroll with a wax seal. */
function drawScroll(frame: number): Pix {
  const p = new Pix(24, 14);
  p.rect(3, 3, 18, 8, 0xd8cfb4);
  p.rect(3, 3, 18, 2, 0xf2ecd8);
  p.rect(3, 9, 18, 2, 0xa89c7c);
  p.ellipse(3, 7, 2.2, 4.2, 0xb8ab88);
  p.ellipse(20, 7, 2.2, 4.2, 0xb8ab88);
  p.ellipse(3, 7, 1, 2.4, 0x7d6d58);
  p.ellipse(12, 7, 2.4, 2.4, BLOOD[2]);
  p.set(11, 6, 0xe0604a);
  p.outline(INK);
  if (frame % 2 === 1) {
    for (const [x, y] of [[7, 1], [16, 12], [19, 2]] as const) p.set(x, y, 0xcdb8ff);
  }
  return p;
}

/** Two frames (plain, and with a glint) of an item as it lies on the floor. */
export function drawPickup(visual: string): [Pix, Pix] {
  if (visual === 'key') return [drawKey(0), drawKey(1)];
  if (visual === 'shield') return [drawShield(0), drawShield(1)];
  if (visual === 'scroll') return [drawScroll(0), drawScroll(1)];
  return [drawSack(), drawSack()];
}
