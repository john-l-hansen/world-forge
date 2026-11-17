/**
 * Interface art, generated with the same pixel kit as the game art and
 * handed to the DOM as data URLs.
 */
import { GOLD, INK, IRON, STONE } from '../art/palette';
import { Pix, tileNoise } from '../art/pixel';
import { drawPortrait, type PortraitKind } from '../art/portraits';

export function pixToDataUrl(pix: Pix): string {
  const canvas = document.createElement('canvas');
  canvas.width = pix.w;
  canvas.height = pix.h;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(pix.w, pix.h);
  image.data.set(pix.data);
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

/** Dark worked stone for the interface frame. Tiles. */
function panelStone(): Pix {
  const p = new Pix(32, 32);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const n = tileNoise(x, y, 4, 32, 21) * 1.6 + tileNoise(x, y, 16, 32, 22) * 1.4;
      p.set(x, y, STONE[Math.max(0, Math.min(3, Math.round(n - 0.4)))]);
    }
  }
  return p;
}

export type IconKind = 'forward' | 'back' | 'strafeLeft' | 'strafeRight' | 'turnLeft' | 'turnRight';

function arrowIcon(kind: IconKind): Pix {
  const s = 13;
  const shape = new Pix(s, s);
  const c = GOLD[2];
  if (kind === 'turnLeft' || kind === 'turnRight') {
    shape.rect(7, 5, 3, 7, c);
    shape.rect(4, 3, 6, 3, c);
    shape.poly([[5, 0], [0, 4.5], [5, 9]], c);
  } else {
    shape.poly([[6, 0], [12, 6], [0, 6]], c);
    shape.rect(4, 6, 5, 6, c);
  }
  // Rotate or mirror the base shape into place.
  const out = new Pix(s + 1, s + 1);
  const place = (x: number, y: number): [number, number] => {
    switch (kind) {
      case 'back':
        return [x, s - 1 - y];
      case 'strafeLeft':
        return [y, x];
      case 'strafeRight':
        return [s - 1 - y, x];
      case 'turnRight':
        return [s - 1 - x, y];
      default:
        return [x, y];
    }
  };
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        if (shape.get(x, y) === -1) continue;
        const [px, py] = place(x, y);
        if (pass === 0) out.set(px + 1, py + 1, GOLD[0]);
        else out.set(px, py, py < 4 || px < 3 ? GOLD[3] : GOLD[2]);
      }
    }
  }
  return out;
}

function swordIcon(): Pix {
  const p = new Pix(12, 12);
  p.line(3, 8, 10, 1, IRON[5], 1);
  p.line(4, 9, 11, 2, IRON[3], 1);
  p.line(2, 6, 5, 9, GOLD[2], 1);
  p.line(0, 11, 2, 9, GOLD[0], 1);
  p.outline(INK);
  return p;
}

function keyIcon(): Pix {
  const p = new Pix(12, 12);
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2;
    p.set(3.5 + Math.cos(ang) * 2.5, 3.5 + Math.sin(ang) * 2.5, a > 6 && a < 13 ? GOLD[3] : GOLD[2]);
  }
  p.line(5, 5, 10, 10, GOLD[2], 1);
  p.set(9, 7, GOLD[2]);
  p.set(10, 8, GOLD[1]);
  p.set(8, 10, GOLD[1]);
  p.outline(INK);
  return p;
}

function flaskIcon(): Pix {
  const p = new Pix(12, 12);
  p.rect(5, 1, 2, 1, 0x8a6a3a); // cork
  p.rect(5, 2, 2, 3, 0x9fb7c4); // neck
  p.ellipse(5.5, 8, 3.6, 3.2, 0x9fb7c4);
  p.ellipse(5.5, 8.6, 2.8, 2.4, 0xb02a22); // the draught
  p.set(4, 7, 0xe0604a);
  p.set(3, 6, 0xe8f2f6);
  p.outline(INK);
  return p;
}

function coinsIcon(): Pix {
  const p = new Pix(12, 12);
  for (const [cx, cy] of [[4, 8], [8, 8], [6, 5]] as const) {
    p.ellipse(cx, cy, 2.6, 2.2, GOLD[2]);
    p.set(cx - 1, cy - 1, GOLD[3]);
    p.set(cx + 1, cy + 1, GOLD[0]);
  }
  p.outline(INK);
  return p;
}

function shieldIcon(): Pix {
  const p = new Pix(12, 12);
  p.ellipse(5.5, 5.5, 5, 5, 0x60421e);
  p.ellipse(5.5, 5.5, 4, 4, 0x7b5629);
  for (let a = 0; a < 20; a++) {
    const ang = (a / 20) * Math.PI * 2;
    p.set(5.5 + Math.cos(ang) * 5, 5.5 + Math.sin(ang) * 5, a > 8 && a < 16 ? IRON[5] : IRON[3]);
  }
  p.rect(5, 2, 1, 8, 0x473016);
  p.ellipse(5.5, 5.5, 1.6, 1.6, IRON[4]);
  p.set(5, 5, IRON[5]);
  p.outline(INK);
  return p;
}

function jerkinIcon(): Pix {
  const p = new Pix(12, 12);
  p.poly([[2, 2], [4, 1], [7, 1], [9, 2], [11, 4], [9, 6], [9, 11], [2, 11], [2, 6], [0, 4]], 0x5d3d20);
  p.rect(3, 2, 3, 9, 0x7a542d);
  p.rect(5, 1, 2, 2, INK);
  for (const [x, y] of [[4, 4], [7, 4], [4, 7], [7, 7], [4, 10], [7, 10]] as const) p.set(x, y, IRON[5]);
  p.outline(INK);
  return p;
}

function helmIcon(): Pix {
  const p = new Pix(12, 12);
  p.ellipse(5.5, 6, 4.5, 4.5, IRON[3]);
  p.rect(1, 7, 10, 4, IRON[3]);
  p.rect(2, 3, 2, 3, IRON[5]);
  p.rect(1, 7, 10, 1, IRON[1]);
  p.rect(5, 7, 2, 4, INK);
  p.outline(INK);
  return p;
}

function staffIcon(): Pix {
  const p = new Pix(12, 12);
  p.line(2, 10, 9, 3, 0x7b5629, 1);
  p.line(3, 10, 10, 3, 0x473016, 1);
  p.ellipse(9.5, 2.5, 1.6, 1.6, 0x6f8fd0);
  p.set(9, 2, 0xe8f2f6);
  p.outline(INK);
  return p;
}

function daggerIcon(): Pix {
  const p = new Pix(12, 12);
  p.line(5, 6, 9, 2, IRON[5], 1);
  p.line(6, 7, 10, 3, IRON[3], 1);
  p.line(3, 5, 6, 8, GOLD[2], 1);
  p.line(1, 10, 3, 8, GOLD[0], 1);
  p.outline(INK);
  return p;
}

function maceIcon(): Pix {
  const p = new Pix(12, 12);
  p.line(1, 10, 7, 4, 0x7b5629, 1);
  p.line(2, 10, 8, 4, 0x473016, 1);
  p.ellipse(8.5, 3.5, 2.6, 2.6, IRON[3]);
  p.set(8, 3, IRON[5]);
  p.set(8, 0, IRON[4]);
  p.set(11, 3, IRON[2]);
  p.set(6, 1, IRON[4]);
  p.set(11, 6, IRON[2]);
  p.outline(INK);
  return p;
}

function scrollIcon(): Pix {
  const p = new Pix(12, 12);
  p.rect(2, 2, 8, 8, 0xd8cfb4);
  p.rect(1, 1, 10, 2, 0xb8ab88);
  p.rect(1, 9, 10, 2, 0xb8ab88);
  p.rect(1, 1, 10, 1, 0xf2ecd8);
  for (const y of [4, 6]) p.rect(3, y, 6, 1, 0x6f8fd0);
  p.rect(3, 8, 3, 1, 0x6f8fd0);
  p.outline(INK);
  return p;
}

export type ItemIcon = 'key' | 'flask' | 'coins' | 'short_sword' | 'dagger' | 'staff' | 'mace' | 'shield' | 'jerkin' | 'helm' | 'scroll';

export interface UiArt {
  panel: string;
  /** The solo card's portrait (the fighter), kept for the single-character layout. */
  portrait: string;
  portraits: Record<PortraitKind, string>;
  sword: string;
  icons: Record<IconKind, string>;
  items: Record<ItemIcon, string>;
}

let cache: UiArt | null = null;

export function uiArt(): UiArt {
  if (cache) return cache;
  const kinds: IconKind[] = ['forward', 'back', 'strafeLeft', 'strafeRight', 'turnLeft', 'turnRight'];
  const portraits = Object.fromEntries((['fighter', 'rogue', 'mage', 'cleric'] as const).map((k) => [k, pixToDataUrl(drawPortrait(k))])) as Record<PortraitKind, string>;
  cache = {
    panel: pixToDataUrl(panelStone()),
    portrait: portraits.fighter,
    portraits,
    sword: pixToDataUrl(swordIcon()),
    items: {
      key: pixToDataUrl(keyIcon()),
      flask: pixToDataUrl(flaskIcon()),
      coins: pixToDataUrl(coinsIcon()),
      short_sword: pixToDataUrl(swordIcon()),
      dagger: pixToDataUrl(daggerIcon()),
      staff: pixToDataUrl(staffIcon()),
      mace: pixToDataUrl(maceIcon()),
      shield: pixToDataUrl(shieldIcon()),
      jerkin: pixToDataUrl(jerkinIcon()),
      helm: pixToDataUrl(helmIcon()),
      scroll: pixToDataUrl(scrollIcon()),
    },
    icons: Object.fromEntries(kinds.map((k) => [k, pixToDataUrl(arrowIcon(k))])) as Record<IconKind, string>,
  };
  return cache;
}
