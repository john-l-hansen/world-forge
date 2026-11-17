/**
 * Writes every generated texture and sprite to .art/ as PNG contact sheets,
 * so the art can be reviewed outside the game. Run with `npm run art`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { Pix } from '../src/art/pixel';
import { dirtFloor, lockedDoor, plankDoor, rockCeiling, secretWall, stoneWall, timberFrame, timberWall } from '../src/art/textures';
import { GOBLIN_POSES, drawChest, drawGoblin, drawKey, drawHeld, drawProp, drawTorch } from '../src/art/sprites';
import { drawPortrait } from '../src/art/portraits';

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

export function encodePng(p: Pix): Buffer {
  const raw = Buffer.alloc((p.w * 4 + 1) * p.h);
  for (let y = 0; y < p.h; y++) {
    raw[y * (p.w * 4 + 1)] = 0;
    Buffer.from(p.data.buffer, y * p.w * 4, p.w * 4).copy(raw, y * (p.w * 4 + 1) + 1);
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(p.w, 0);
  ihdr.writeUInt32BE(p.h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function sheet(items: Pix[], scale: number, bg: number): Pix {
  const gap = 4;
  const w = items.reduce((s, i) => s + i.w + gap, gap);
  const h = Math.max(...items.map((i) => i.h)) + gap * 2;
  const out = new Pix(w, h);
  out.fill(bg);
  let x = gap;
  for (const item of items) {
    out.blit(item, x, gap);
    x += item.w + gap;
  }
  return out.scaled(scale);
}

mkdirSync('.art', { recursive: true });
writeFileSync('.art/textures.png', encodePng(sheet([stoneWall(1), stoneWall(2), timberWall(3), dirtFloor(4), rockCeiling(5), plankDoor(6), timberFrame(7), secretWall(1), lockedDoor(6)], 3, 0x202020)));
writeFileSync('.art/goblin.png', encodePng(sheet(GOBLIN_POSES.map((pose) => drawGoblin(pose)), 4, 0x3a312a)));
writeFileSync('.art/chief.png', encodePng(sheet(GOBLIN_POSES.map((pose) => drawGoblin(pose, 'goblin_chief')), 4, 0x3a312a)));
writeFileSync('.art/loot.png', encodePng(sheet([drawChest(false), drawChest(true), drawKey(0), drawKey(1)], 6, 0x3a312a)));
writeFileSync('.art/props.png', encodePng(sheet([drawTorch(0), drawTorch(1), drawTorch(2), drawProp('barrel'), drawProp('crate'), drawProp('rubble')], 6, 0x3a312a)));
writeFileSync('.art/held.png', encodePng(sheet([drawHeld('short_sword'), drawHeld('dagger'), drawHeld('staff'), drawHeld('mace')], 3, 0x3a312a)));
writeFileSync('.art/portraits.png', encodePng(sheet([drawPortrait('fighter'), drawPortrait('rogue'), drawPortrait('mage'), drawPortrait('cleric')], 6, 0x3a312a)));
console.log('wrote .art/*.png');

// The crypt: its tileset, its dead and its furniture.
{
  const { TILESETS } = await import('../src/art/tilesets');
  const { drawUndead } = await import('../src/art/undead');
  writeFileSync('.art/crypt-tiles.png', encodePng(sheet(TILESETS.crypt(), 2, 0x3a312a)));
  writeFileSync('.art/skeleton.png', encodePng(sheet(GOBLIN_POSES.map((pose) => drawUndead(pose, 'skeleton')), 3, 0x3a3f48)));
  writeFileSync('.art/warden.png', encodePng(sheet(GOBLIN_POSES.map((pose) => drawUndead(pose, 'warden')), 3, 0x3a3f48)));
  writeFileSync('.art/crypt-props.png', encodePng(sheet([drawProp('sarcophagus'), drawProp('urn'), drawProp('bones')], 5, 0x3a3f48)));
}
