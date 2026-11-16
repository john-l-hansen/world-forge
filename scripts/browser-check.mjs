/**
 * Browser playthrough of The Forgotten Mines, driven through the real
 * keyboard handlers in headless Chrome: the whole quest from the title
 * screen to the victory screen, then the combat moves, a defeat and a restart.
 *
 * Run `npm run build && npm run preview` first, then `npm run test:browser`.
 * Screenshots land in .shots/.
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

const N = 0, E = 1, S = 2, W = 3;
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

/** A snapshot of the running session, read from the page. */
const state = () =>
  page.evaluate(() => {
    const g = window.__worldForge;
    const s = g.state;
    const w = g.world;
    // Which cells can be walked right now.
    const open = [];
    for (let i = 0; i < w.tiles.length; i++) {
      const door = w.doorAt.get(i);
      open.push(w.tiles[i] !== 0 && !w.blocked[i] && (!door || s.doorsOpen[door.def.id]) ? 1 : 0);
    }
    return {
      tick: s.tick,
      status: s.status,
      x: s.party.x,
      y: s.party.y,
      facing: s.party.facing,
      hp: s.party.members[0].hp,
      maxHp: s.party.members[0].maxHp,
      level: s.party.members[0].level,
      xp: s.party.members[0].xp,
      stamina: s.party.members[0].stamina,
      blocking: s.party.members[0].blocking,
      busy: s.party.members[0].action.kind !== 'idle',
      room: s.currentRoomId,
      doors: s.doorsOpen,
      unlocked: s.doorsUnlocked,
      chests: s.chestsOpened,
      inventory: s.inventory,
      quest: s.quests.quest_clear_mines,
      enemies: s.enemies.map((e) => ({ ...e })),
      visited: s.visitedRoomIds.length,
      width: w.width,
      open,
    };
  });
const hud = () =>
  page.evaluate(() => ({
    text: document.querySelector('.screen').innerText,
    overlay: document.querySelector('.overlay')?.innerText ?? null,
    objective: document.querySelector('.plate.objective')?.innerText ?? '',
    belt: [...document.querySelectorAll('.belt button')].map((b) => b.getAttribute('aria-label')),
    target: document.querySelector('.target')?.innerText ?? null,
  }));
const key = async (code, settle = 280) => {
  await page.keyboard.down(code);
  await page.waitForTimeout(40);
  await page.keyboard.up(code);
  await page.waitForTimeout(settle);
};
const shot = (name) => page.screenshot({ path: `.shots/check-${name}.png` });

const turnTo = async (dir) => {
  for (let i = 0; i < 4; i++) {
    const s = await state();
    if (s.facing === dir) return;
    await key((dir - s.facing + 4) % 4 === 3 ? 'KeyQ' : 'KeyE', 220);
  }
};
const route = (s, tx, ty, blockedCells = []) => {
  const start = s.y * s.width + s.x;
  const goal = ty * s.width + tx;
  const from = new Map([[start, start]]);
  const queue = [start];
  while (queue.length) {
    const i = queue.shift();
    if (i === goal) break;
    for (let d = 0; d < 4; d++) {
      const ni = i + DX[d] + DY[d] * s.width;
      if (from.has(ni) || !s.open[ni] || blockedCells.includes(ni)) continue;
      from.set(ni, i);
      queue.push(ni);
    }
  }
  if (!from.has(goal)) return null;
  const path = [];
  for (let i = goal; i !== start; i = from.get(i)) path.unshift(i);
  return path;
};
/** Walk to a cell with real key presses, re-planning after every step. */
const walkTo = async (tx, ty) => {
  for (let guard = 0; guard < 80; guard++) {
    const s = await state();
    if (s.status !== 'playing') return false;
    if (s.x === tx && s.y === ty) return true;
    const living = s.enemies.filter((e) => e.ai !== 'dead').map((e) => e.y * s.width + e.x);
    const path = route(s, tx, ty, living);
    if (!path) return false;
    const next = path[0];
    const d = [0, 1, 2, 3].find((dir) => s.x + DX[dir] + (s.y + DY[dir]) * s.width === next);
    await turnTo(d);
    await key('KeyW', 260);
  }
  return false;
};
const use = async (dir, settle = 500) => {
  await turnTo(dir);
  await key('KeyF', settle);
};
/** Fight one enemy as a careful player would, through the keyboard. */
const fight = async (index, onFirstTelegraph) => {
  let seenTelegraph = false;
  for (let i = 0; i < 1500; i++) {
    const s = await state();
    const enemy = s.enemies[index];
    if (s.status !== 'playing' || enemy.ai === 'dead') return;
    const dist = Math.abs(enemy.x - s.x) + Math.abs(enemy.y - s.y);
    const aimed = enemy.ai === 'telegraph' && enemy.targetX === s.x && enemy.targetY === s.y;
    if (enemy.ai === 'telegraph' && !seenTelegraph) {
      seenTelegraph = true;
      await page.waitForTimeout(250);
      if (onFirstTelegraph) await onFirstTelegraph();
      continue;
    }
    if (aimed && !s.busy) {
      const away = [0, 1, 2, 3].find((d) => enemy.x + DX[d] === s.x && enemy.y + DY[d] === s.y);
      const options = [away, (away + 1) % 4, (away + 3) % 4];
      const d = options.find((dir) => s.open[s.x + DX[dir] + (s.y + DY[dir]) * s.width]);
      if (d !== undefined) await key(['KeyW', 'KeyD', 'KeyS', 'KeyA'][(d - s.facing + 4) % 4], 90);
      else await page.waitForTimeout(40);
    } else if (s.hp <= 18 && Object.keys(s.inventory).includes('item_healing_draught') && enemy.ai !== 'telegraph') {
      await key('KeyH', 120);
    } else if (dist === 1 && enemy.ai !== 'telegraph' && !s.busy) {
      const need = [0, 1, 2, 3].find((d) => s.x + DX[d] === enemy.x && s.y + DY[d] === enemy.y);
      if (s.facing !== need) await turnTo(need);
      else if (s.stamina >= 4) await key('KeyJ', 60);
      else await page.waitForTimeout(40);
    } else if (dist > 1 && (!enemy.alerted || enemy.ai === 'attack' || enemy.ai === 'recover') && !s.busy) {
      // Close the distance by one step.
      let best = null;
      for (let d = 0; d < 4; d++) {
        const path = route(s, enemy.x + DX[d], enemy.y + DY[d]);
        if (path && path.length && (!best || path.length < best.length)) best = path;
      }
      if (best) {
        const d = [0, 1, 2, 3].find((dir) => s.x + DX[dir] + (s.y + DY[dir]) * s.width === best[0]);
        if (s.facing !== d) await turnTo(d);
        else await key('KeyW', 120);
      } else await page.waitForTimeout(40);
    } else {
      await page.waitForTimeout(35);
    }
  }
};

await page.goto(URL);
await page.waitForFunction(() => window.__worldForge);
await page.waitForTimeout(500);

// --- Title ---------------------------------------------------------------------
let h = await hud();
check(/THE FORGOTTEN MINES/i.test(h.overlay ?? ''), 'title screen shows the adventure name');
check((await state()).tick === 0, 'simulation is paused on the title screen');
const size = await page.evaluate(() => {
  const c = document.querySelector('.viewport canvas');
  return { w: c.width, h: c.height, cssW: c.getBoundingClientRect().width, rendering: getComputedStyle(c).imageRendering };
});
check(size.w === 320 && size.h === 200, `viewport renders at 320x200 internally (got ${size.w}x${size.h})`);
check(size.cssW === 640 && size.rendering === 'pixelated', `viewport is scaled by a whole number, unfiltered (css width ${size.cssW}, ${size.rendering})`);
await shot('01-title');

// --- Movement ------------------------------------------------------------------
await key('Space', 400);
h = await hud();
check(h.overlay === null, 'a key press leaves the title screen');
check(/Quest: Clear the Forgotten Mines/i.test(h.text), 'the quest is announced at the start');
check(/Find the shaft key/i.test(h.objective), `the objective tracker shows the first objective ("${h.objective}")`);
const lit = await page.evaluate(
  () =>
    new Promise((resolve) => {
      requestAnimationFrame(() => {
        const src = document.querySelector('.viewport canvas');
        const copy = document.createElement('canvas');
        copy.width = src.width;
        copy.height = src.height;
        const ctx = copy.getContext('2d');
        ctx.drawImage(src, 0, 0);
        const d = ctx.getImageData(0, 0, copy.width, copy.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 40) n++;
        resolve(n / (d.length / 4));
      });
    }),
);
check(lit > 0.5, 'the dungeon is visibly drawn');
await key('KeyW');
let s = await state();
check(s.x === 5 && s.y === 13, 'W steps forward one cell');
await key('KeyE');
check((await state()).facing === E, 'E turns right');
await key('KeyQ');
await key('KeyQ');
check((await state()).facing === W, 'Q turns left');
await key('KeyW');
await key('KeyW');
await key('KeyW');
s = await state();
check(s.x === 3 && s.y === 13, `walls block movement (stopped at ${s.x},${s.y})`);
await key('KeyE');
await key('KeyD');
await key('KeyD');
s = await state();
check(s.x === 5 && s.y === 13 && s.facing === N, 'D strafes right');
await page.keyboard.down('KeyW');
await page.waitForTimeout(2600);
await page.keyboard.up('KeyW');
await page.waitForTimeout(300);
s = await state();
check(s.x === 5 && s.y === 7, `holding W walks up the tunnel to the door (at ${s.x},${s.y})`);
check(/TIMBERED TUNNEL/i.test((await hud()).text), 'the interface shows the room name');

// --- Locked door ---------------------------------------------------------------
await walkTo(5, 9);
await use(W);
s = await state();
check(s.doors.door_tunnel_shaft === false, 'the shaft door does not open without the key');
check(/locked/i.test((await hud()).text), 'the log says the door is locked');
await shot('02-locked-door');

// --- Secret room and chest -----------------------------------------------------
await turnTo(E);
await shot('03-secret-wall');
await key('KeyW');
s = await state();
check(s.x === 5 && s.y === 9, 'the secret door blocks like a wall');
await use(E, 1000);
s = await state();
check(s.doors.door_tunnel_cache === true, 'searching the wall opens the secret door');
await shot('04-secret-open');
await walkTo(8, 9);
s = await state();
check(s.room === 'room_hidden_cache', `the hidden cache can be entered (in ${s.room})`);
await turnTo(S);
await shot('05-chest');
await key('KeyF', 600);
s = await state();
h = await hud();
check(s.chests.object_cache_chest === true, 'F opens the chest');
check(s.inventory.item_healing_draught === 1 && s.inventory.item_gold_pouch === 1, 'the chest gives the draught and the gold');
check(h.belt.includes('Healing draught') && h.belt.includes('Pouch of gold'), `the belt shows what is carried (${h.belt.join(', ')})`);
check(s.quest.done.find_cache === true, 'the optional objective is marked done');
await shot('06-chest-open');

// --- Journal -------------------------------------------------------------------
await key('KeyB', 300);
h = await hud();
check(/JOURNAL/i.test(h.overlay ?? '') && /hidden cache/i.test(h.overlay ?? ''), 'B opens the journal with the objectives');
const tickBefore = (await state()).tick;
await page.waitForTimeout(300);
check((await state()).tick === tickBefore, 'the game waits while the journal is open');
await shot('07-journal');
await key('KeyB', 300);
check((await hud()).overlay === null, 'B closes the journal');

// --- Goblin patrol -------------------------------------------------------------
await walkTo(5, 7);
await use(N, 700);
s = await state();
check(s.doors.door_tunnel_hall === true, 'F opens the hall door');
check(s.enemies[0].alerted === true, 'the goblin notices the party through the open door');
await fight(0, () => shot('08-goblin-telegraph'));
s = await state();
check(s.enemies[0].ai === 'dead' && s.status === 'playing', `the goblin patrol can be beaten (party hp ${s.hp})`);
check(s.level === 2 && s.xp === 40 && s.maxHp === 48, `the kill brings experience and level 2 (level ${s.level}, ${s.xp} xp, ${s.maxHp} max health)`);
h = await hud();
check(/reaches level 2/i.test(h.text) && /LV 2/i.test(h.text), 'the level-up is announced and shown on the party card');
const hpAfterGoblin = s.hp;
const maxAfterGoblin = s.maxHp;

// --- Character sheet -----------------------------------------------------------
await key('KeyC', 300);
h = await hud();
check(/STRENGTH/i.test(h.overlay ?? '') && /level 2/i.test(h.overlay ?? '') && /15/.test(h.overlay ?? ''), 'C opens the character sheet with attributes and level');
await shot('08b-character-sheet');
await key('KeyC', 300);
check((await hud()).overlay === null, 'C closes the character sheet');

// --- Key -----------------------------------------------------------------------
await walkTo(8, 3);
await use(E, 700);
await walkTo(11, 3);
await turnTo(E);
await shot('09-key-on-floor');
await walkTo(12, 3);
s = await state();
h = await hud();
check(s.inventory.item_shaft_key === 1, 'walking over the key picks it up');
check(h.belt.includes('Iron key'), 'the key appears on the belt');
check(/Slay the chief/i.test(h.objective), `the objective moves on ("${h.objective}")`);

// --- Draught -------------------------------------------------------------------
if (hpAfterGoblin < maxAfterGoblin) {
  await key('KeyH', 400);
  s = await state();
  check(s.hp === Math.min(maxAfterGoblin, hpAfterGoblin + 20) && !s.inventory.item_healing_draught, `H drinks the draught (${hpAfterGoblin} to ${s.hp})`);
} else {
  await key('KeyH', 400);
  s = await state();
  check(s.inventory.item_healing_draught === 1 && /not hurt/i.test((await hud()).text), 'a draught is not wasted at full health');
}

// --- Boss ----------------------------------------------------------------------
await walkTo(5, 9);
await use(W, 900);
s = await state();
check(s.unlocked.door_tunnel_shaft === true && s.doors.door_tunnel_shaft === true, 'the key unlocks and opens the shaft door');
check(s.enemies[1].alerted === true, 'the chief sees the party as the door opens');
h = await hud();
check(/creeping into Gnarl/i.test(h.text), 'the chief speaks his introduction');
check(/Gnarl, chief of the pit/i.test(h.target ?? ''), `the boss is named on his health bar ("${(h.target ?? '').trim()}")`);
await shot('10-boss-reveal');
await fight(1, () => shot('11-boss-telegraph'));
s = await state();
check(s.enemies[1].ai === 'dead' && s.status === 'playing', `the chief can be beaten (party hp ${s.hp})`);
check(s.quest.completed === true, 'the quest is complete');
await page.waitForTimeout(2600);
h = await hud();
check(/QUEST COMPLETE/i.test(h.overlay ?? ''), 'the victory screen appears');
check(new RegExp(`${s.hp} of ${s.maxHp}`).test(h.overlay ?? ''), 'the victory screen reports the health left');
check(s.level === 3, `the adventure ends at level 3 (level ${s.level})`);
await shot('12-victory');
await key('Enter', 400);
check((await hud()).overlay === null, 'Enter carries on exploring');
await walkTo(3, 9);
s = await state();
check(s.visited === 6, `all six rooms have been visited (${s.visited})`);
await shot('13-boss-room');

// --- Combat moves --------------------------------------------------------------
await page.evaluate(() => window.__worldForge.restart());
await page.waitForTimeout(200);
s = await state();
check(s.tick < 30 && Object.keys(s.inventory).length === 0 && s.quest.completed === false, 'a restart resets the inventory and the quest');
check(s.stamina === 40, 'the party starts with full stamina');
await key('KeyK', 150);
s = await state();
check(s.stamina === 26, `K swings a heavy attack that costs 14 stamina (${s.stamina} left)`);
await shot('15-heavy-windup');
await page.waitForTimeout(900);
await key('KeyJ', 150);
s = await state();
check(s.stamina < 40 && s.stamina >= 22, `J swings a light attack that costs less (${s.stamina} left)`);
await page.waitForTimeout(3500);
check((await state()).stamina === 40, 'stamina returns with rest');
await key('Space', 300);
s = await state();
check(s.x === 5 && s.y === 15 && s.stamina === 30, `Space dodges one step back for 10 stamina (at ${s.x},${s.y}, ${s.stamina} left)`);
await page.keyboard.down('KeyD');
await page.waitForTimeout(60);
await key('Space', 300);
await page.keyboard.up('KeyD');
await page.waitForTimeout(300);
s = await state();
check(s.x >= 6, `dodging while steering right goes right (at ${s.x},${s.y})`);
await page.keyboard.down('KeyL');
await page.waitForTimeout(150);
s = await state();
h = await hud();
check(s.blocking === true && /GUARD/i.test(h.text), 'holding L raises the guard');
await shot('16-guard');
await page.keyboard.up('KeyL');
await page.waitForTimeout(150);
check((await state()).blocking === false, 'releasing L lowers the guard');

// Block, then parry, the goblin.
await page.waitForTimeout(3000);
await walkTo(5, 7);
await use(N, 300);
await page.keyboard.down('KeyL');
await page.waitForFunction(() => /You block/i.test(document.querySelector('.log').innerText), null, { timeout: 20000 }).catch(() => {});
h = await hud();
s = await state();
check(/You block/i.test(h.text) && s.hp >= 37 && s.hp < 40, `a held guard blocks most of a blow (hp ${s.hp})`);
await page.keyboard.up('KeyL');
let parried = false;
for (let attempt = 0; attempt < 6 && !parried; attempt++) {
  // Wait for the last few ticks of a wind-up, then raise the guard.
  await page.waitForFunction(
    () => {
      const g = window.__worldForge.state;
      const e = g.enemies[0];
      return g.status !== 'playing' || (e.ai === 'telegraph' && e.aiEnd - g.tick <= 6 && e.aiEnd - g.tick >= 3);
    },
    null,
    { timeout: 20000, polling: 'raf' },
  );
  await page.keyboard.down('KeyL');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyL');
  parried = /Parried/i.test((await hud()).text);
  if (!parried) await page.waitForTimeout(500);
}
check(parried, 'raising the guard just before a blow lands parries it');
await shot('17-parry');
s = await state();
check(s.status === 'playing', `the party is still standing after blocking and parrying (hp ${s.hp})`);

// --- Defeat and restart --------------------------------------------------------
await page.waitForFunction(() => window.__worldForge.state.status === 'dead', null, { timeout: 60000 });
await page.waitForTimeout(1200);
h = await hud();
check(/has fallen/i.test(h.overlay ?? ''), 'standing still against the goblin ends in defeat');
await shot('14-defeat');
await key('KeyR', 400);
s = await state();
check(s.status === 'playing' && s.hp === 40 && s.x === 5 && s.y === 14, 'R restarts the adventure');

check(problems.length === 0, `no console errors or failed requests${problems.length ? `: ${problems.join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll browser checks passed');
process.exit(failed ? 1 : 0);
