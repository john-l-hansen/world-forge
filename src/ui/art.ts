/**
 * Interface art, generated with the same pixel kit as the game art and
 * handed to the DOM as data URLs.
 */
import { GOLD, INK, IRON, STONE } from '../art/palette';
import { Pix, tileNoise } from '../art/pixel';
import { drawFighterPortrait } from '../art/portraits';

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

export type ItemIcon = 'key' | 'flask' | 'coins' | 'short_sword';

export interface UiArt {
  panel: string;
  portrait: string;
  sword: string;
  icons: Record<IconKind, string>;
  items: Record<ItemIcon, string>;
}

let cache: UiArt | null = null;

export function uiArt(): UiArt {
  if (cache) return cache;
  const kinds: IconKind[] = ['forward', 'back', 'strafeLeft', 'strafeRight', 'turnLeft', 'turnRight'];
  cache = {
    panel: pixToDataUrl(panelStone()),
    portrait: pixToDataUrl(drawFighterPortrait()),
    sword: pixToDataUrl(swordIcon()),
    items: {
      key: pixToDataUrl(keyIcon()),
      flask: pixToDataUrl(flaskIcon()),
      coins: pixToDataUrl(coinsIcon()),
      short_sword: pixToDataUrl(swordIcon()),
    },
    icons: Object.fromEntries(kinds.map((k) => [k, pixToDataUrl(arrowIcon(k))])) as Record<IconKind, string>,
  };
  return cache;
}
