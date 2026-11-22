/**
 * Original sprites for the dead of the crypt: the skeleton and the Warden.
 * They share the goblin's canvas and pose list, so the renderer treats every
 * enemy alike.
 */
import { EYE_RED, INK, IRON, RUST } from './palette';
import { Pix, hash2, type Ramp } from './pixel';
import { GOBLIN_H, GOBLIN_W, type GoblinPose } from './sprites';

export type UndeadVariant = 'skeleton' | 'warden';

const BONES: Ramp = [0x3e382c, 0x6e654f, 0x9c9074, 0xc8bc9a, 0xece4c6];
const SHROUD: Ramp = [0x121018, 0x1e1a28, 0x2e283c, 0x443c56];
const HOLLOW = 0x16131a;
const COLD_EYE = 0x7fd0ff;
const limb: Ramp = [BONES[1], BONES[2], BONES[3]];
const hash = (a: number, b: number) => hash2(a, b, 57);

/** A notched old blade from the hand to the tip. The Warden's is a heavy hooked glaive. */
function blade(p: Pix, hx: number, hy: number, tx: number, ty: number, heavy: boolean) {
  const dx = tx - hx;
  const dy = ty - hy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  p.line(hx - ux * 5, hy - uy * 5, hx + ux * 2, hy + uy * 2, RUST[1], 2);
  p.line(hx + ux * 3 - nx * 4, hy + uy * 3 - ny * 4, hx + ux * 3 + nx * 4, hy + uy * 3 + ny * 4, IRON[2], 2);
  p.line(hx + ux * 4, hy + uy * 4, tx, ty, IRON[3], heavy ? 4 : 3);
  p.line(hx + ux * 4 + nx, hy + uy * 4 + ny, tx, ty, IRON[5], 1);
  for (const t of [0.35, 0.6, 0.8]) p.set(hx + ux * len * t - nx, hy + uy * len * t - ny, RUST[2]);
  if (heavy) {
    p.poly(
      [
        [tx - ux * 12 + nx * 2, ty - uy * 12 + ny * 2],
        [tx - ux * 4 + nx * 9, ty - uy * 4 + ny * 9],
        [tx + ux * 3 + nx * 2, ty + uy * 3 + ny * 2],
      ],
      IRON[4],
    );
    p.line(tx - ux * 12 + nx * 2, ty - uy * 12 + ny * 2, tx - ux * 4 + nx * 9, ty - uy * 4 + ny * 9, IRON[5], 1);
  }
}

function skull(p: Pix, cx: number, cy: number, mood: 'calm' | 'rage' | 'pain', warden: boolean) {
  if (warden) {
    // A hood drawn up over the skull, falling to the shoulders.
    p.shaded(cx, cy - 1, 12, 12, SHROUD);
    p.poly([[cx - 11, cy], [cx - 14, cy + 14], [cx + 14, cy + 14], [cx + 11, cy]], SHROUD[1]);
  }
  const gape = mood === 'calm' ? 0 : mood === 'rage' ? 2 : 3;
  p.shaded(cx, cy - 2, 8, 7.5, [BONES[1], BONES[2], BONES[3], BONES[4]]);
  // Cheekbones and jaw.
  p.rect(cx - 6, cy + 2, 12, 3, BONES[2]);
  p.rect(cx - 4, cy + 5 + gape, 8, 3, BONES[2]);
  p.rect(cx - 4, cy + 5, 8, gape, HOLLOW);
  for (let i = -4; i < 4; i++) {
    p.set(cx + i, cy + 4, i % 2 === 0 ? BONES[4] : HOLLOW);
    p.set(cx + i, cy + 5 + gape, i % 2 === 0 ? HOLLOW : BONES[4]);
  }
  // Sockets and nose.
  p.ellipse(cx - 3.5, cy - 1, 2.6, 2.8, HOLLOW);
  p.ellipse(cx + 3.5, cy - 1, 2.6, 2.8, HOLLOW);
  p.set(cx, cy + 1, HOLLOW);
  p.set(cx - 1, cy + 2, HOLLOW);
  p.set(cx + 1, cy + 2, HOLLOW);
  const glow = warden ? EYE_RED : COLD_EYE;
  if (warden || mood !== 'calm') {
    p.set(cx - 3, cy - 1, glow);
    p.set(cx + 4, cy - 1, glow);
  } else {
    p.set(cx - 3, cy, 0x35505e);
    p.set(cx + 4, cy, 0x35505e);
  }
  if (warden) {
    // A corroded circlet, and the hood's edge across the brow.
    p.rect(cx - 8, cy - 8, 16, 2, RUST[2]);
    for (const sx of [-6, -2, 2, 6]) p.poly([[cx + sx - 1.5, cy - 8], [cx + sx + 1.5, cy - 8], [cx + sx, cy - 12]], RUST[3]);
    p.line(cx - 9, cy - 6, cx - 10, cy + 6, SHROUD[3], 2);
    p.line(cx + 9, cy - 6, cx + 10, cy + 6, SHROUD[0], 2);
  }
}

export function drawUndead(pose: GoblinPose, variant: UndeadVariant): Pix {
  const warden = variant === 'warden';
  const p = new Pix(GOBLIN_W, GOBLIN_H);
  const cx = 32;

  if (pose === 'gore') {
    // Smashed apart: bones flung wide, the skull caved in, dust where the rest was.
    for (let i = 0; i < 26; i++) p.set(6 + hash(i, 1) * 54, 62 + hash(1, i) * 9, i % 3 ? BONES[0] : BONES[1]);
    if (warden) p.poly([[10, 66], [26, 60], [44, 63], [58, 68], [30, 70]], SHROUD[1]);
    p.limb(14, 69, 24, 66, limb, 3);
    p.limb(40, 70, 52, 68, limb, 3);
    p.limb(28, 64, 33, 70, limb, 2);
    p.limb(54, 63, 60, 66, limb, 2);
    for (let i = 0; i < 3; i++) p.line(30 + i * 3, 60, 31 + i * 3, 64, BONES[3], 1);
    p.line(44, 61, 47, 64, BONES[2], 1);
    // The skull, split by the blow.
    p.shaded(20, 62, 6.5, 5.5, [BONES[1], BONES[2], BONES[3], BONES[4]]);
    p.line(19, 56, 22, 66, HOLLOW, 1);
    p.ellipse(17.5, 62, 1.6, 1.8, HOLLOW);
    p.rect(17, 66, 3, 1, HOLLOW);
    p.set(11, 64, BONES[3]);
    p.set(27, 58, BONES[3]);
    if (warden) p.rect(48, 66, 9, 2, RUST[2]);
    blade(p, 40, 69, 58, 70, warden);
    p.outline(INK);
    return p;
  }

  if (pose === 'dead') {
    // A heap of bones. No blood: there was none left.
    if (warden) {
      p.ellipse(34, 66, 22, 4.5, SHROUD[1]);
      p.ellipse(30, 65, 14, 3, SHROUD[2]);
    }
    p.limb(22, 66, 40, 63, limb, 3);
    p.limb(30, 68, 50, 66, limb, 3);
    p.limb(38, 61, 54, 64, limb, 3);
    p.limb(26, 61, 34, 67, limb, 2);
    for (let i = 0; i < 4; i++) p.line(40 + i * 3, 58, 42 + i * 3, 64, BONES[3], 1);
    p.shaded(15, 62, 7, 6, [BONES[1], BONES[2], BONES[3], BONES[4]]);
    p.ellipse(12.5, 61, 2, 2.2, HOLLOW);
    p.ellipse(17.5, 61, 2, 2.2, HOLLOW);
    p.rect(12, 66, 7, 1, HOLLOW);
    if (warden) p.rect(9, 55, 12, 2, RUST[2]);
    blade(p, 44, 69, 61, 66, warden);
    p.outline(INK);
    return p;
  }

  const bob = pose === 'idle1' ? 1 : 0;
  const crouch = pose === 'attack' ? 4 : pose === 'telegraph' ? -1 : pose === 'sweep' ? 3 : 0;
  const lean = pose === 'hurt' ? -2 : 0;
  const y = (v: number) => v + bob + crouch;

  // The Warden's shroud hangs behind everything.
  if (warden) {
    p.poly([[cx - 13 + lean, y(30)], [cx + 13 + lean, y(30)], [cx + 17, 66], [cx + 6, 62], [cx - 4, 67], [cx - 12, 61], [cx - 18, 66]], SHROUD[1]);
    p.poly([[cx - 13 + lean, y(30)], [cx - 6 + lean, y(30)], [cx - 12, 61], [cx - 18, 66]], SHROUD[2]);
  }

  // Legs: thigh, shin and a long flat foot.
  const liftL = pose === 'walk0' ? 3 : 0;
  const liftR = pose === 'walk1' ? 3 : 0;
  const spread = pose === 'attack' || pose === 'sweep' ? 3 : 0;
  for (const [side, lift] of [[-1, liftL], [1, liftR]] as const) {
    const hipX = cx + side * 4;
    const kneeX = cx + side * (6 + spread);
    const footX = cx + side * (7 + spread);
    p.limb(hipX, y(53), kneeX, 60 - lift, limb, 3);
    p.limb(kneeX, 60 - lift, footX, 66 - lift, limb, 3);
    p.shaded(kneeX, 60 - lift, 2.2, 2.2, limb);
    p.ellipse(footX + side * 2, 67 - lift, 4.5, 1.8, BONES[2]);
  }

  // Off-hand arm (viewer's left), behind the ribs.
  const shoulderY = y(31);
  if (pose === 'sweep') p.limb(cx - 10, shoulderY, cx - 17, y(44), limb, 3);
  else if (pose === 'telegraph') p.limb(cx - 10, shoulderY, cx - 18, y(27), limb, 3);
  else if (pose === 'attack') p.limb(cx - 10, shoulderY, cx - 19, y(46), limb, 3);
  else p.limb(cx - 10 + lean, shoulderY, cx - 15 + lean, y(49), limb, 3);
  const handL: [number, number] =
    pose === 'sweep' ? [cx - 18, y(46)] : pose === 'telegraph' ? [cx - 19, y(25)] : pose === 'attack' ? [cx - 20, y(48)] : [cx - 16 + lean, y(51)];
  p.shaded(handL[0], handL[1], 2.4, 2.4, limb);

  // Pelvis and spine.
  p.shaded(cx + lean, y(52), 7, 3.2, [BONES[1], BONES[2], BONES[3]]);
  p.line(cx + lean, y(29), cx + lean, y(51), BONES[2], 2);

  if (warden) {
    // A rusted breastplate over the ribs, and plates at the shoulders.
    p.shaded(cx + lean, y(39), 10.5, 10.5, [IRON[0], IRON[1], IRON[2], IRON[4]]);
    for (const [rx, ry] of [[-5, 36], [3, 41], [-2, 45], [6, 35], [-7, 42]]) p.set(cx + rx + lean, y(ry), RUST[2]);
    p.line(cx + lean, y(30), cx + lean, y(48), IRON[0], 1);
    for (const s of [-1, 1]) p.shaded(cx + s * 12 + lean, y(32), 5, 4, [IRON[1], IRON[2], IRON[3], IRON[5]]);
  } else {
    // The hollow of the chest, then the ribs across it.
    p.ellipse(cx + lean, y(38), 9.5, 9, HOLLOW);
    for (let i = 0; i < 5; i++) {
      const ry = y(32 + i * 3.4);
      const half = 9 - i * 0.9;
      p.line(cx - half + lean, ry + 1, cx + lean, ry, BONES[3], 1);
      p.line(cx + lean, ry, cx + half + lean, ry + 1, BONES[2], 1);
    }
    p.line(cx + lean, y(30), cx + lean, y(46), BONES[4], 1);
    // Collar bones and shoulder knobs.
    p.line(cx - 10 + lean, y(30), cx + 10 + lean, y(30), BONES[3], 2);
    for (const s of [-1, 1]) p.shaded(cx + s * 10 + lean, y(31), 2.6, 2.6, limb);
    // A rag still knotted at the hip.
    p.poly([[cx - 6 + lean, y(51)], [cx + 3 + lean, y(51)], [cx - 2 + lean, y(58)], [cx - 7 + lean, y(56)]], 0x3a2626);
  }

  // Head.
  const mood = pose === 'telegraph' || pose === 'attack' || pose === 'sweep' ? 'rage' : pose === 'hurt' ? 'pain' : 'calm';
  skull(p, cx + lean * 1.5, pose === 'attack' ? y(20) : y(19), mood, warden);

  // Weapon arm (viewer's right), in front of everything.
  if (pose === 'telegraph') {
    // Blade raised straight overhead: the tell.
    p.limb(cx + 10, shoulderY, cx + 19, y(26), limb, 3);
    p.limb(cx + 19, y(26), cx + 16, y(15), limb, 3);
    blade(p, cx + 16, y(14), cx + 25, 1, warden);
    p.shaded(cx + 16, y(15), 2.6, 2.6, limb);
  } else if (pose === 'sweep') {
    // Both hands draw the blade back low at the hip for a wide cut.
    p.limb(cx + 10, shoulderY, cx + 2, y(44), limb, 3);
    p.limb(cx + 2, y(44), cx - 14, y(46), limb, 3);
    blade(p, cx - 15, y(46), cx - 31, y(28), warden);
    p.shaded(cx - 15, y(46), 2.6, 2.6, limb);
  } else if (pose === 'attack') {
    // Cut down and across.
    p.limb(cx + 11, shoulderY, cx + 8, y(46), limb, 3);
    p.limb(cx + 8, y(46), cx - 2, y(52), limb, 3);
    blade(p, cx - 3, y(53), cx - 23, 66, warden);
    p.shaded(cx - 3, y(53), 2.6, 2.6, limb);
  } else {
    p.limb(cx + 10 + lean, shoulderY, cx + 16 + lean, y(44), limb, 3);
    p.limb(cx + 16 + lean, y(44), cx + 19 + lean, y(52), limb, 3);
    blade(p, cx + 19 + lean, y(53), cx + 28 + lean, y(27), warden);
    p.shaded(cx + 19 + lean, y(53), 2.6, 2.6, limb);
  }

  p.outline(INK);
  return p;
}
