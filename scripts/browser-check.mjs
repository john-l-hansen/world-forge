/**
 * Browser playthrough of The Forgotten Mines, driven through the real
 * keyboard handlers in headless Chrome. Run `npm run build && npm run preview`
 * first, then `npm run test:browser`. Screenshots land in .shots/.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const URL = process.env.URL ?? 'http://localhost:4173/?seed=7';
mkdirSync('.shots', { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const problems = [];
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
page.on('pageerror', (e) => problems.push(`page error: ${e}`));
page.on('response', (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));

let failed = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed++;
};
const state = () =>
  page.evaluate(() => {
    const g = window.__worldForge;
    const s = g.state;
    return {
      tick: s.tick,
      status: s.status,
      x: s.party.x,
      y: s.party.y,
      facing: s.party.facing,
      hp: s.party.members[0].hp,
      action: s.party.members[0].action.kind,
      room: s.currentRoomId,
      doors: s.doorsOpen,
      goblin: { ...s.enemies[0] },
      visited: s.visitedRoomIds.length,
    };
  });
const hud = () => page.evaluate(() => ({ text: document.querySelector('.screen').innerText, overlay: document.querySelector('.overlay')?.innerText ?? null }));
const key = async (code, settle = 300) => {
  await page.keyboard.down(code);
  await page.waitForTimeout(40);
  await page.keyboard.up(code);
  await page.waitForTimeout(settle);
};
const shot = (name) => page.screenshot({ path: `.shots/check-${name}.png` });
/** Fraction of viewport pixels that are not near-black, read from the WebGL canvas. */
const litFraction = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        // Read inside an animation frame, straight after the game has drawn.
        requestAnimationFrame(() => {
          const src = document.querySelector('.viewport canvas');
          const copy = document.createElement('canvas');
          copy.width = src.width;
          copy.height = src.height;
          const ctx = copy.getContext('2d');
          ctx.drawImage(src, 0, 0);
          const d = ctx.getImageData(0, 0, copy.width, copy.height).data;
          let lit = 0;
          for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 40) lit++;
          resolve(lit / (d.length / 4));
        });
      }),
  );

await page.goto(URL);
await page.waitForFunction(() => window.__worldForge);
await page.waitForTimeout(500);

// --- Title -------------------------------------------------------------------
let h = await hud();
check(/THE FORGOTTEN MINES/i.test(h.overlay ?? ''), 'title screen shows the adventure name');
check((await state()).tick === 0, 'simulation is paused on the title screen');
const size = await page.evaluate(() => {
  const c = document.querySelector('.viewport canvas');
  return { w: c.width, h: c.height, cssW: c.getBoundingClientRect().width, rendering: getComputedStyle(c).imageRendering };
});
check(size.w === 320 && size.h === 200, `viewport renders at 320x200 internally (got ${size.w}x${size.h})`);
check(size.cssW === 640 && size.rendering === 'pixelated', `viewport is scaled by a whole number, unfiltered (css width ${size.cssW}, ${size.rendering})`);
await shot('1-title');

// --- Movement ----------------------------------------------------------------
await key('Space', 400);
check((await hud()).overlay === null, 'a key press leaves the title screen');
check((await litFraction()) > 0.5, 'the dungeon is visibly drawn');
await key('KeyW');
let s = await state();
check(s.x === 5 && s.y === 13, 'W steps forward one cell');
await key('KeyE');
check((await state()).facing === 1, 'E turns right');
await key('KeyQ');
await key('KeyQ');
check((await state()).facing === 3, 'Q turns left');
await key('KeyW');
await key('KeyW');
await key('KeyW');
s = await state();
check(s.x === 3 && s.y === 13, `walls block movement (stopped at ${s.x},${s.y})`);
await shot('2-wall-torch');
await key('KeyE');
await key('KeyD');
await key('KeyD');
s = await state();
check(s.x === 5 && s.y === 13 && s.facing === 0, 'D strafes right');

// Held key: keeps walking until the closed door.
await page.keyboard.down('KeyW');
await page.waitForTimeout(2600);
await page.keyboard.up('KeyW');
await page.waitForTimeout(300);
s = await state();
check(s.x === 5 && s.y === 7, `holding W walks up the tunnel to the door (at ${s.x},${s.y})`);
check(s.room === 'room_timbered_tunnel', 'the room changes to the Timbered Tunnel');
check(/TIMBERED TUNNEL/i.test((await hud()).text), 'the interface shows the room name');
check(/door is shut/i.test((await hud()).text), 'bumping the closed door explains how to open it');
await shot('3-closed-door');

// --- Side rooms through the archway -----------------------------------------
await key('KeyS');
await key('KeyS');
await key('KeyQ');
await key('KeyW');
await key('KeyW');
s = await state();
check(s.room === 'room_old_shaft', `the archway leads into the Old Shaft (in ${s.room})`);
await shot('4-old-shaft');
await key('KeyE');
await key('KeyE');
await key('KeyW');
await key('KeyW');
await key('KeyQ');
await key('KeyW');
await key('KeyW');
s = await state();
check(s.x === 5 && s.y === 7 && s.facing === 0, 'back at the hall door');

// --- Door and combat ---------------------------------------------------------
await key('KeyF', 900);
s = await state();
check(s.doors.door_tunnel_hall === true, 'F opens the door');
check(s.goblin.alerted === true, 'the goblin notices the party through the open door');
await shot('5-door-open');

// Wait for the wind-up and capture the tell.
await page.waitForFunction(() => window.__worldForge.state.enemies[0].ai === 'telegraph', null, { timeout: 15000 });
await page.waitForTimeout(350);
await shot('6-telegraph');
check(/rears back/i.test((await hud()).text), 'the wind-up is announced in the log');

// Dodge it by stepping back.
const hpBefore = (await state()).hp;
await key('KeyS', 500);
s = await state();
check(s.hp === hpBefore, 'stepping back during the wind-up avoids the blow');

// Fight: step back from wind-ups, swing while the goblin recovers.
let swung = false;
for (let i = 0; i < 400; i++) {
  s = await state();
  if (s.status !== 'playing' || s.goblin.ai === 'dead') break;
  const inFront = s.goblin.x === s.x && s.goblin.y === s.y - 1 && s.facing === 0;
  if (s.goblin.ai === 'telegraph') {
    const behindOpen = s.y < 10;
    if (behindOpen) await key('KeyS', 120);
    else await page.waitForTimeout(60);
  } else if (inFront && s.action === 'idle') {
    await page.keyboard.down('Space');
    await page.waitForTimeout(110);
    if (!swung) {
      await shot('7-swing');
      swung = true;
    }
    await page.keyboard.up('Space');
    await page.waitForTimeout(60);
  } else {
    await page.waitForTimeout(60);
  }
}
s = await state();
check(s.goblin.ai === 'dead', `the goblin can be killed (goblin hp ${s.goblin.hp}, party hp ${s.hp})`);
check(s.hp > 0 && s.hp <= 40, `party health is tracked (${s.hp}/40)`);
h = await hud();
check(/strike the goblin down/i.test(h.text), 'the kill is announced');
check(new RegExp(`${s.hp}/40`).test(h.text), 'the health readout matches the simulation');
await page.waitForTimeout(700);
await shot('8-goblin-dead');

// --- Remaining rooms ---------------------------------------------------------
// Walk into the hall, then east through the storeroom door.
for (let i = 0; i < 12 && (await state()).y > 3; i++) await key('KeyW');
await key('KeyE');
for (let i = 0; i < 6 && (await state()).x < 8; i++) await key('KeyW');
await key('KeyF', 900);
await key('KeyW');
await key('KeyW');
s = await state();
check(s.room === 'room_storeroom', `the storeroom can be entered (in ${s.room})`);
check(s.visited === 5, `all five rooms have been visited (${s.visited})`);
await shot('9-storeroom');

// --- Death and restart -------------------------------------------------------
await page.evaluate(() => window.__worldForge.restart());
await page.waitForTimeout(200);
await page.keyboard.down('KeyW');
await page.waitForTimeout(2800);
await page.keyboard.up('KeyW');
await key('KeyF', 400);
await page.waitForFunction(() => window.__worldForge.state.status === 'dead', null, { timeout: 60000 });
await page.waitForTimeout(1200);
h = await hud();
check(/has fallen/i.test(h.overlay ?? ''), 'standing still against the goblin ends in defeat');
await shot('10-defeat');
await key('KeyR', 400);
s = await state();
check(s.status === 'playing' && s.hp === 40 && s.x === 5 && s.y === 14, 'R restarts the adventure');

check(problems.length === 0, `no console errors or failed requests${problems.length ? `: ${problems.join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll browser checks passed');
process.exit(failed ? 1 : 0);
