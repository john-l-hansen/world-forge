/**
 * Browser playthrough of The Forgotten Mines, driven through the real
 * keyboard handlers in headless Chrome: the whole quest from the title
 * screen to the victory screen, then the combat moves, a defeat and a restart.
 *
 * Run `npm run build && npm run preview` first, then `npm run test:browser`.
 * Screenshots land in .shots/.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const URL = process.env.URL ?? 'http://localhost:4173/?seed=7';
mkdirSync('.shots', { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, acceptDownloads: true });
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
      equipment: s.party.members[0].equipment,
      wallDamage: s.wallDamage,
      members: s.party.members.map((m) => ({ id: m.id, hp: m.hp, maxHp: m.maxHp, mana: m.mana, controller: m.controller, row: m.row, xp: m.xp, level: m.level })),
      held: g.renderer.heldKind,
      quest: s.quests.quest_clear_mines,
      enemies: s.enemies.map((e) => ({ ...e })),
      visited: s.visitedRoomIds.length,
      width: w.width,
      open,
    };
  });
const hud = () =>
  page.evaluate(() => ({
    cells: [...document.querySelectorAll('.party .cell')].map((c) => ({ id: c.dataset.member, name: c.querySelector('.name').innerText, active: c.classList.contains('active'), fallen: c.classList.contains('fallen') })),
    spells: [...document.querySelectorAll('.spells .btn')].map((b) => b.innerText.replace(/\s+/g, ' ').trim()),
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
check(!/CONTINUE/i.test(h.overlay ?? ''), 'with nothing saved, the title offers no Continue');
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

// --- Cracked wall, hidden room and chest -------------------------------------------
await turnTo(E);
check(/cold draft breathes through cracks/i.test((await hud()).text), 'standing by the cracked wall, the log mentions a draft');
await page.waitForTimeout(800);
check((await page.evaluate(() => window.__worldForge.renderer.dust.motes.length)) === 0, 'an untouched cracked wall shows its cracks, and no dust');
await shot('03-cracked-wall');
await key('KeyW');
s = await state();
check(s.x === 5 && s.y === 9, 'the cracked wall blocks like a wall');
await use(E, 500);
check(/heavy blow \(K\) might bring it down/i.test((await hud()).text), 'searching the cracked wall says a heavy blow might break it');
await key('KeyJ', 900);
s = await state();
check(s.doors.door_tunnel_cache === false && /skitters off/i.test((await hud()).text), 'a light blow does not break it');
await key('KeyK', 450);
check((await page.evaluate(() => window.__worldForge.renderer.dust.motes.length)) > 10, 'a heavy blow throws grit from the wall');
await page.waitForTimeout(850);
s = await state();
check(s.wallDamage.door_tunnel_cache === 1 && s.doors.door_tunnel_cache === false, 'a heavy blow cracks it further');
check(await page.evaluate(() => window.__worldForge.renderer.doors.find((d) => d.id === 'door_tunnel_cache').stages[1].visible), 'the wall shows the damage');
await shot('03b-cracked-wall-hit');
await key('KeyK', 1300);
await key('KeyK', 1400);
s = await state();
check(s.doors.door_tunnel_cache === true && /caves in/i.test((await hud()).text), 'the third heavy blow brings the wall down');
await shot('04-wall-down');
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
check(s.equipment.body === 'item_studded_jerkin', 'the jerkin from the chest is put straight on');
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

// --- Blood -----------------------------------------------------------------------
const blood = await page.evaluate(() => ({ stains: window.__worldForge.state.stains.length, drawn: window.__worldForge.renderer.stainCount, gore: window.__worldForge.renderer.gore }));
check(blood.stains > 0 && blood.drawn === blood.stains, `the fight left blood on the floor, and all of it is drawn (${blood.stains} stains, ${blood.drawn} drawn)`);
check(blood.gore === 'full', 'gore is full by default');
check(!(await page.evaluate(() => document.querySelector('.floater') !== null && /^\d+!?$/.test(document.querySelector('.floater').innerText.trim()))), 'damage numbers are off by default');
await shot('07c-blood');
await key('KeyG', 300);
check((await page.evaluate(() => window.__worldForge.renderer.gore)) === 'low' && /Gore: low/i.test((await hud()).text), 'G turns gore down');
await page.waitForTimeout(100);
await shot('07d-gore-low');
await key('KeyG', 300);
check((await page.evaluate(() => window.__worldForge.renderer.gore)) === 'full', 'G turns it back up');

// --- Save and load -------------------------------------------------------------
await key('F5', 300);
check(/Game saved/i.test((await hud()).text), 'F5 saves the game');
const savedState = await state();
await page.reload();
await page.waitForFunction(() => window.__worldForge);
await page.waitForTimeout(500);
h = await hud();
check(/CONTINUE:\s*THE FORGOTTEN MINES/i.test(h.overlay ?? ''), `after a reload, the title offers Continue (${(h.overlay ?? '').slice(0, 60).replace(/\s+/g, ' ')})`);
await shot('08a-continue');
await key('KeyC', 700);
s = await state();
h = await hud();
check(h.overlay === null && /Game loaded/i.test(h.text), 'C continues the saved game');
check(
  s.x === savedState.x && s.y === savedState.y && s.facing === savedState.facing && s.level === 2 && s.hp === savedState.hp && s.enemies[0].ai === 'dead' && s.doors.door_tunnel_hall === true && s.inventory.item_healing_draught === 1,
  `the loaded game is where it was saved (at ${s.x},${s.y}, level ${s.level}, hp ${s.hp})`,
);
check(s.tick >= savedState.tick, 'the loaded game runs on from the saved tick');

// --- Character sheet -----------------------------------------------------------
await key('KeyC', 300);
h = await hud();
check(/STRENGTH/i.test(h.overlay ?? '') && /level 2/i.test(h.overlay ?? '') && /15/.test(h.overlay ?? ''), 'C opens the character sheet with attributes and level');
await shot('08b-character-sheet');
// Take the jerkin off from the sheet, then put it back on from the belt.
await page.locator('.overlay.sheet .worn .btn', { hasText: /jerkin/i }).dispatchEvent('pointerdown');
await page.waitForTimeout(250);
s = await state();
h = await hud();
check(!s.equipment.body && s.inventory.item_studded_jerkin === 1 && /DEFENCE\s*0/i.test(h.overlay ?? ''), 'clicking worn armour on the sheet takes it off');
await key('KeyC', 300);
check((await hud()).overlay === null, 'C closes the character sheet');
await page.locator('.belt button[aria-label="Studded jerkin"]').dispatchEvent('pointerdown');
await page.waitForTimeout(300);
s = await state();
check(s.equipment.body === 'item_studded_jerkin' && !s.inventory.item_studded_jerkin, 'clicking armour on the belt puts it on');

// --- Injuries ----------------------------------------------------------------------
const plainFace = await page.evaluate(() => document.querySelector('.card .portrait img').getAttribute('src'));
await page.evaluate(() => {
  const g = window.__worldForge;
  g.state.party.members[0].injuries.push({ kind: 'arm', until: g.state.tick + 3600 });
});
await page.waitForTimeout(200);
const woundedFace = await page.evaluate(() => ({ src: document.querySelector('.card .portrait img').getAttribute('src'), title: document.querySelector('.card .portrait img').getAttribute('title') }));
check(woundedFace.src !== plainFace && /Broken arm/.test(woundedFace.title ?? ''), 'an injured hero\'s portrait is cut and bloodied, and names the wound');
await key('KeyC', 300);
h = await hud();
check(/BROKEN ARM:\s*BLOWS LAND A QUARTER WEAKER/i.test(h.overlay ?? ''), 'the sheet lists the injury and what it does');
await shot('08c-injury-sheet');
const sheetFits = await page.evaluate(() => {
  const box = document.querySelector('.viewport').getBoundingClientRect();
  return [...document.querySelectorAll('.overlay.sheet > *')].every((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= box.top && r.bottom <= box.bottom;
  });
});
check(sheetFits, 'the sheet still fits with an injury listed');
await key('KeyC', 300);
await page.evaluate(() => (window.__worldForge.state.party.members[0].injuries = []));
await page.waitForTimeout(200);
// The sheet can also be found without knowing the key.
await page.locator('.buttons .btn', { hasText: /Sheet/ }).dispatchEvent('pointerdown');
await page.waitForTimeout(250);
check(/STRENGTH/i.test((await hud()).overlay ?? ''), 'the Sheet button opens the character sheet');
await page.locator('.buttons .btn', { hasText: /Sheet/ }).dispatchEvent('pointerdown');
await page.waitForTimeout(250);
await page.locator('.card .portrait').dispatchEvent('pointerdown');
await page.waitForTimeout(250);
check(/STRENGTH/i.test((await hud()).overlay ?? ''), 'clicking the portrait opens the character sheet');
await key('KeyC', 300);

// --- Scroll --------------------------------------------------------------------
await walkTo(3, 5);
await turnTo(W);
await shot('08c-scroll-on-floor');
await walkTo(2, 5);
s = await state();
h = await hud();
check(s.inventory.item_storm_scroll === 1 && h.belt.includes('Scroll of storms'), 'the scroll in the hall is picked up and shown on the belt');
await key('KeyR', 300);
s = await state();
check(s.inventory.item_storm_scroll === 1 && /nothing ahead to strike/i.test((await hud()).text), 'a scroll is kept when there is nothing to strike');

// --- Key -----------------------------------------------------------------------
await walkTo(8, 3);
await use(E, 700);
await walkTo(11, 3);
await turnTo(E);
// Close by, the key glints: the star above it shows within a moment of arriving.
const glinted = await page
  .waitForFunction(() => window.__worldForge.renderer.pickups.some((p) => p.id === 'object_shaft_key' && p.near && p.sparkle.visible), null, { timeout: 2500, polling: 30 })
  .then(() => true)
  .catch(() => false);
check(glinted, 'a floor item glints when the party comes close');
await shot('09-key-on-floor');
await walkTo(12, 3);
s = await state();
h = await hud();
check(s.inventory.item_shaft_key === 1, 'walking over the key picks it up');
check(h.belt.includes('Iron key'), 'the key appears on the belt');
const banner = await page.evaluate(() => document.querySelector('.pickup')?.innerText ?? '');
check(/IRON KEY/i.test(banner) && /lock/i.test(banner), `a banner across the view names what was picked up ("${banner.replace(/\n/g, ' / ')}")`);
check(await page.evaluate(() => Boolean(document.querySelector('.belt .slot.fresh[aria-label="Iron key"]'))), 'the key\'s belt slot flashes');
await shot('09a-key-banner');
await walkTo(11, 2);
await turnTo(N);
await shot('09b-shield-on-floor');
await walkTo(11, 1);
s = await state();
check(s.equipment.offHand === 'item_wooden_shield', 'the shield in the storeroom is picked up and worn');
check(/STRAPPED TO YOUR ARM/i.test(await page.evaluate(() => document.querySelector('.pickup')?.innerText ?? '')), 'the banner says the shield went straight on');
check(await page.evaluate(() => window.__worldForge.renderer.shield.visible), 'the shield shows at the edge of the view');
await page.keyboard.down('KeyL');
await page.waitForTimeout(400);
const shieldUp = await page.evaluate(() => window.__worldForge.renderer.shield.position.y);
await page.keyboard.up('KeyL');
await page.waitForTimeout(400);
const shieldDown = await page.evaluate(() => window.__worldForge.renderer.shield.position.y);
check(shieldUp > shieldDown + 30, `raising the guard brings the shield up (${shieldDown} to ${shieldUp})`);
await key('KeyC', 300);
check(/BLOCK\s*12% of a blow, 5 stamina/i.test((await hud()).overlay ?? ''), 'the sheet shows what a block with the shield lets through');
await key('KeyC', 300);
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
// Open with the scroll: the chief stands straight ahead through the door.
const chiefBefore = (await state()).enemies[1].hp;
await key('KeyR', 120);
await page.waitForFunction(() => document.querySelector('.floater.spell') !== null, null, { timeout: 5000 }).catch(() => {});
await shot('10b-storm-bolt');
await page.waitForTimeout(500);
s = await state();
check(!s.inventory.item_storm_scroll && chiefBefore - s.enemies[1].hp >= 14, `R reads the scroll and the bolt strikes the chief (${chiefBefore} to ${s.enemies[1].hp})`);
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

// --- A party of four -------------------------------------------------------------
// Back to the title of the solo adventure, then pick the party from there.
await page.goto(URL);
await page.waitForFunction(() => window.__worldForge);
await page.evaluate(() => {
  window.__partyLog = [];
  window.__allyFloaters = [];
  new MutationObserver(() => {
    for (const p of document.querySelectorAll('.log p')) if (!window.__partyLog.includes(p.innerText)) window.__partyLog.push(p.innerText);
    for (const f of document.querySelectorAll('.floater.ally')) if (!window.__allyFloaters.includes(f.innerText)) window.__allyFloaters.push(f.innerText);
  }).observe(document.body, { childList: true, subtree: true });
});
await page.waitForTimeout(400);
h = await hud();
check(/MINES: PARTY/i.test(h.overlay ?? '') && /CRYPT/i.test(h.overlay ?? '') && /OPEN FILE/i.test(h.overlay ?? ''), 'the title screen offers every adventure');
const titleFits = await page.evaluate(() => {
  const box = document.querySelector('.viewport').getBoundingClientRect();
  return [...document.querySelectorAll('.overlay.title > *')].every((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= box.top && r.bottom <= box.bottom && r.left >= box.left && r.right <= box.right;
  });
});
check(titleFits, 'everything on the title screen fits inside the view');
await key('Digit2', 900);
await page.waitForFunction(() => window.__worldForge.state.party.members.length === 4, null, { timeout: 5000 }).catch(() => {});
s = await state();
h = await hud();
check(s.members.length === 4 && (await page.evaluate(() => location.hash)) === '#party', 'pressing 2 on the title loads the party of four');
check(h.overlay === null && s.tick > 0, 'choosing an adventure starts it at once');
await key('KeyV', 300);
check(/Damage numbers: shown/i.test((await hud()).text), 'V turns floating damage numbers on');
check(h.cells.map((c) => c.name).join(',').toUpperCase() === 'BRANNOC,SELA,ILVANE,MAREN', `the party panel shows all four (${h.cells.map((c) => c.name).join(', ')})`);
check(h.cells[0].active && h.cells.filter((c) => c.active).length === 1 && s.held === 'short_sword', 'the party starts with the fighter being driven');
check(h.spells.length === 0, 'a character with no spells shows no spell bar');
await shot('18-party');

// Switching the driven character.
await key('Tab', 350);
s = await state();
h = await hud();
check(s.members[1].controller === 'local' && s.members[0].controller === 'ai' && h.cells[1].active, 'Tab hands control to the next character');
check(s.held === 'dagger', `the held weapon is the driven character's (${s.held})`);
check(/Sela takes the lead/i.test(h.text), 'the log says who is being driven');
await page.locator('.party .cell[data-member="char_mage"]').dispatchEvent('pointerdown');
await page.waitForTimeout(350);
s = await state();
h = await hud();
check(s.members[2].controller === 'local' && s.members.filter((m) => m.controller !== 'ai').length === 1, 'clicking a party cell takes that character over');
check(s.held === 'staff' && /Storm bolt/i.test(h.spells[0] ?? ''), `the mage shows a staff and a spell bar (${h.spells.join(', ')})`);
await key('Digit1', 400);
s = await state();
check(s.members[2].mana === 30 && /nothing ahead to strike/i.test((await hud()).text), 'a spell with no target costs nothing');
await key('KeyJ', 500);
check(/cannot reach from the back row/i.test((await hud()).text), 'a back-row character cannot swing a weapon');

// The character sheet follows the driven character, and changes rows.
// Clicking the cell of the character you drive opens their sheet.
await page.locator('.party .cell[data-member="char_mage"]').dispatchEvent('pointerdown');
await page.waitForTimeout(300);
h = await hud();
check(/ILVANE/i.test(h.overlay ?? '') && /MANA/i.test(h.overlay ?? '') && /BACK ROW/i.test(h.overlay ?? ''), 'clicking the driven character\'s cell opens their sheet, with mana and row');
await page.locator('.overlay.sheet .btn.row').dispatchEvent('pointerdown');
await page.waitForTimeout(250);
s = await state();
check(s.members[2].row === 'front' && /FRONT ROW/i.test((await hud()).overlay ?? ''), 'the row button moves the character forward');
await page.locator('.overlay.sheet .btn.row').dispatchEvent('pointerdown');
await page.waitForTimeout(250);
check((await state()).members[2].row === 'back', 'and back again');
await key('Tab', 300);
h = await hud();
check(/MAREN/i.test(h.overlay ?? ''), 'Tab on the sheet moves to the next character');
await shot('19-party-sheet');
await key('Tab', 200);
await key('Tab', 200);
await key('Tab', 200);
await key('KeyC', 300);
s = await state();
check(s.members[2].controller === 'local' && (await hud()).overlay === null, 'the sheet closes with the mage being driven again');

// Into the hall as the mage: two goblins, three companions fighting on their own.
await walkTo(5, 7);
await use(N);
await walkTo(5, 5);
await turnTo(N);
await page.waitForFunction(() => window.__worldForge.state.enemies.some((e) => e.alerted), null, { timeout: 8000 }).catch(() => {});
let cast = false;
let manaSpent = false;
let spellDamage = false;
let sawCasting = false;
for (let i = 0; i < 900; i++) {
  s = await state();
  const alive = s.enemies.filter((e) => e.ai !== 'dead' && e.id.startsWith('encounter_goblin_patrol'));
  if (s.status !== 'playing' || alive.length === 0) break;
  const me = s.members.find((m) => m.controller !== 'ai');
  const ahead = alive.find((e) => {
    const dx = e.x - s.x;
    const dy = e.y - s.y;
    const along = dx * DX[s.facing] + dy * DY[s.facing];
    return along > 0 && along <= 5 && dx * DY[s.facing] === dy * DX[s.facing];
  });
  if (me.id === 'char_mage' && ahead && me.mana >= 8 && !cast) {
    const before = ahead.hp;
    await key('Digit1', 120);
    sawCasting = sawCasting || (await page.evaluate(() => window.__worldForge.state.party.members[2].action.kind === 'cast'));
    await page.waitForTimeout(700);
    const after = await state();
    manaSpent = after.members[2].mana < me.mana;
    spellDamage = (after.enemies.find((e) => e.id === ahead.id)?.hp ?? 0) < before;
    cast = manaSpent;
    if (i === 0 || cast) await shot('20-party-fight');
  } else if (me.id === 'char_mage' && !ahead && alive.length) {
    // Face the nearest goblin if it stands in a straight line.
    const lined = alive.find((e) => e.x === s.x || e.y === s.y);
    if (lined) await turnTo(lined.x === s.x ? (lined.y < s.y ? N : S) : lined.x > s.x ? E : W);
    else await page.waitForTimeout(120);
  } else {
    await page.waitForTimeout(120);
  }
}
s = await state();
h = await hud();
check(sawCasting && manaSpent, 'pressing 1 casts the mage\'s spell and spends mana');
check(spellDamage, 'the spell wounds the goblin ahead');
const patrolDead = s.enemies.filter((e) => e.id.startsWith('encounter_goblin_patrol')).every((e) => e.ai === 'dead');
check(s.status === 'playing' && patrolDead, 'the party beats both goblins');
const logText = await page.evaluate(() => window.__worldForge && [...document.querySelectorAll('.log p')].map((p) => p.innerText).join(' | '));
const allLog = await page.evaluate(() => JSON.stringify(window.__partyLog ?? []));
check(s.members.filter((m) => m.hp > 0).every((m) => m.xp >= 80), `every survivor earns the experience (${s.members.map((m) => m.xp).join(', ')})`);
check(/(Brannoc|Sela|Maren) (hits|cleaves|strikes)/i.test(allLog + logText), 'companions fight on their own and the log says so');
check((await page.locator('.party .cell .hand').count()) === 4, 'every party cell shows its character\'s hand');
const companionStruck = await page.evaluate(() =>
  [...document.querySelectorAll('.party .cell:not(.active) .hand')].some((h) => h.classList.contains('struck')),
);
check(companionStruck, 'a companion\'s hand flashes when their blow lands');
const allyNumbers = await page.evaluate(() => window.__allyFloaters);
check(allyNumbers.some((t) => /^(BRANNOC|SELA|MAREN) \d+/i.test(t)), `a companion's damage number carries their name (${allyNumbers.slice(0, 3).join(', ')})`);
await shot('21-party-after');

// The cleric mends whoever is hurt worst.
await page.locator('.party .cell[data-member="char_cleric"]').dispatchEvent('pointerdown');
await page.waitForTimeout(300);
await page.waitForFunction(() => window.__worldForge.state.party.members[3].mana >= 7 && window.__worldForge.state.party.members[3].action.kind === 'idle', null, { timeout: 30000 }).catch(() => {});
s = await state();
const cleric = s.members[3];
if (cleric.hp > 0) {
  const hurt = s.members.filter((m) => m.hp > 0 && m.hp < m.maxHp);
  const total = (st) => st.members.reduce((n, m) => n + m.hp, 0);
  await key('Digit1', 1200);
  const after = await state();
  h = await hud();
  if (hurt.length) check(total(after) > total(s) && after.members[3].mana < cleric.mana && /mend/i.test(h.text), `the cleric's spell heals a wounded companion (${total(s)} to ${total(after)} health)`);
  else check(after.members[3].mana === cleric.mana && /No one is hurt/i.test(h.text), 'a healing spell is not wasted when nobody is hurt');
  check(/Mend/i.test(h.spells[0] ?? '') && after.held === 'mace', 'the cleric shows a mace and the mend spell');
} else {
  check(h.cells[3].fallen, 'a fallen character is shown as fallen');
}
await shot('22-party-cleric');

// --- A second world: The Sunken Crypt ---------------------------------------------
/** Average colour of the 3D view, to tell one tileset from another. */
const viewColour = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => {
          const src = document.querySelector('.viewport canvas');
          const copy = document.createElement('canvas');
          copy.width = src.width;
          copy.height = src.height;
          const ctx = copy.getContext('2d');
          ctx.drawImage(src, 0, 0);
          // The upper half: walls and ceiling, clear of the held weapon.
          const d = ctx.getImageData(0, 0, copy.width, copy.height / 2).data;
          let r = 0, g = 0, b = 0;
          for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
          const n = d.length / 4;
          resolve({ r: r / n, g: g / n, b: b / n });
        });
      }),
  );
await page.goto(URL);
await page.waitForFunction(() => window.__worldForge);
await page.waitForTimeout(400);
await key('Digit3', 900);
await page.waitForFunction(() => window.__worldForge.world.def.world.id === 'world_sunken_crypt', null, { timeout: 5000 }).catch(() => {});
s = await state();
h = await hud();
check((await page.evaluate(() => window.__worldForge.world.def.world.name)) === 'The Sunken Crypt' && (await page.evaluate(() => location.hash)) === '#crypt', 'pressing 3 on the title loads The Sunken Crypt');
check(h.cells.map((c) => c.name).join(',').toUpperCase() === 'WREN,HALE' && s.held === 'dagger', `a different party of two is shown (${h.cells.map((c) => c.name).join(', ')})`);
check(/THE BROKEN ADIT/i.test(h.text) && /Get into the vault/i.test(h.objective), `the room and first objective come from the new world ("${h.objective}")`);
const aditColour = await viewColour();
await shot('23-crypt-adit');
await key('KeyB', 300);
h = await hud();
check(/THE ASHEN CHALICE/i.test(h.overlay ?? '') && /THE EMBALMERS' COFFER/i.test(h.overlay ?? '') && /SIDE QUEST/i.test(h.overlay ?? ''), 'the journal lists the main quest and the side quest');
await shot('24-crypt-journal');
await key('KeyB', 300);
await walkTo(7, 11);
await turnTo(N);
await page.waitForTimeout(300);
const hallColour = await viewColour();
check(aditColour.r > aditColour.b * 1.15, `the adit is drawn in the mine's warm stone (r ${aditColour.r.toFixed(0)}, b ${aditColour.b.toFixed(0)})`);
check(hallColour.r / hallColour.b < 1.4 && hallColour.r / hallColour.b < (aditColour.r / aditColour.b) * 0.7, `the hall is drawn in the crypt's grey stone (r ${hallColour.r.toFixed(0)}, b ${hallColour.b.toFixed(0)})`);
await shot('25-crypt-hall');
await walkTo(7, 9);
await use(N, 500);
check(/locked/i.test((await hud()).text) && (await state()).doors.door_hall_vault === false, 'the vault door is locked without the sigil');

// Into the ossuary: two skeletons.
await walkTo(9, 10);
await use(E, 600);
await page.waitForFunction(() => window.__worldForge.state.enemies.some((e) => e.alerted), null, { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(300);
h = await hud();
check(/Bones rattle upright/i.test(h.text), 'the skeleton announces itself with its own line');
check(/SKELETON/i.test(h.target ?? ''), `the target bar names the new enemy ("${(h.target ?? '').trim()}")`);
await shot('26-crypt-skeleton');
await fight(0);
await fight(1);
s = await state();
check(s.status === 'playing' && s.enemies[0].ai === 'dead' && s.enemies[1].ai === 'dead', 'the party beats the skeletons in the ossuary');
check(s.members.filter((m) => m.hp > 0).every((m) => m.xp >= 60), `both characters earn the experience (${s.members.map((m) => m.xp).join(', ')})`);
await shot('27-crypt-ossuary');

// The walled-up way: through the chapel, search the west wall.
await walkTo(12, 8);
await use(N, 600);
await fight(2);
await walkTo(10, 5);
await use(W, 700);
s = await state();
h = await hud();
check(s.doors.door_chapel_vault === true && /hidden way opens/i.test(h.text), 'searching the chapel wall opens the walled-up way');
check(s.unlocked.door_hall_vault !== true && s.inventory.item_bronze_sigil === undefined, 'the vault can be reached without the sigil');
await page.waitForFunction(() => window.__worldForge.state.enemies[4].alerted, null, { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(400);
h = await hud();
check(/keeper of ash/i.test(h.text) && /WARDEN OF ASH/i.test(h.target ?? ''), 'the Warden speaks and is shown as the boss');
await shot('28-crypt-warden');

// --- Opening a world file ---------------------------------------------------------
const cryptFile = JSON.parse(readFileSync(new globalThis.URL('../src/worlds/sunken-crypt.json', import.meta.url), 'utf8'));
const asFile = (name, data) => ({ name, mimeType: 'application/json', buffer: Buffer.from(typeof data === 'string' ? data : JSON.stringify(data)) });
await page.goto(URL);
await page.waitForFunction(() => window.__worldForge);
await page.waitForTimeout(300);
const borrowed = structuredClone(cryptFile);
borrowed.world.name = 'The Borrowed Crypt';
borrowed.world.id = 'world_borrowed_crypt';
await page.setInputFiles('input.world-file', asFile('borrowed-crypt.json', borrowed));
await page.waitForFunction(() => window.__worldForge?.world.def.world.id === 'world_borrowed_crypt', null, { timeout: 5000 }).catch(() => {});
await page.waitForTimeout(500);
s = await state();
h = await hud();
check((await page.evaluate(() => window.__worldForge.world.def.world.name)) === 'The Borrowed Crypt' && h.overlay === null && s.tick > 0, 'a world file from the computer is loaded and played');
await key('KeyW', 300);
check((await state()).y === 14, 'the opened world plays like any other');

const broken = structuredClone(cryptFile);
broken.encounters[0].placements[0].enemyId = 'enemy_that_is_not_there';
broken.doors[0].cell = { x: 1, y: 1 };
await page.setInputFiles('input.world-file', asFile('broken-crypt.json', broken));
await page.waitForSelector('.fatal', { timeout: 5000 }).catch(() => {});
let fatal = await page.evaluate(() => document.querySelector('.fatal')?.innerText ?? '');
check(/broken-crypt\.json cannot be played/i.test(fatal) && /missing_reference/.test(fatal) && /enemy_that_is_not_there/.test(fatal), 'a world file with faults is reported with its faults');
check((await page.evaluate(() => document.querySelector('.viewport canvas'))) === null, 'and is not played');
await shot('29-world-file-refused');
await page.setInputFiles('input.world-file', asFile('notes.json', 'this is not a world'));
await page.waitForFunction(() => /notes\.json/.test(document.querySelector('.fatal')?.innerText ?? ''), null, { timeout: 5000 }).catch(() => {});
fatal = await page.evaluate(() => document.querySelector('.fatal')?.innerText ?? '');
check(/Not valid JSON/i.test(fatal), 'a file that is not JSON is reported, not run');
await page.getByRole('button', { name: 'Back to the adventures' }).click();
await page.waitForFunction(() => document.querySelector('.overlay.title'), null, { timeout: 5000 }).catch(() => {});
h = await hud();
check(/THE FORGOTTEN MINES/i.test(h.overlay ?? ''), 'the way back leads to the title screen');

// --- The world creator -------------------------------------------------------------
await page.goto(URL);
await page.waitForFunction(() => window.__worldForge);
await page.waitForTimeout(300);
check(/N\s+CREATE/i.test((await hud()).overlay ?? ''), 'the title screen offers to create an adventure');
await key('KeyN', 400);
check(await page.locator('.creator textarea').isVisible(), 'N opens the creator, which asks what kind of adventure to make');
await page.locator('.creator .example').first().click();
check(/Goblins have taken an old dwarven mine/.test(await page.locator('.creator textarea').inputValue()), 'clicking a suggestion fills in the description');
await page.locator('.creator textarea').fill('Miners broke into a forgotten tomb beneath their mine, and the dead followed them up. Recover the Bell of Ruin.');
await page.keyboard.press('Enter');
await page.waitForTimeout(250);
let talk = await page.locator('.creator .talk').innerText();
check(/MINES OVER A TOMB/i.test(talk) && /THE DEAD/i.test(talk) && /BELL OF RUIN/i.test(talk), 'the designer says what it read from the description');
check(/WHERE DOES IT HAPPEN/i.test(talk) && (await page.locator('.creator .option.current').innerText()).match(/MINES OVER A TOMB/i), 'the first question has the reading marked');
await shot('30-creator-question');
// Keep the setting and inhabitants, pick horror, medium, keep the treasure, a party of four, classic.
for (const k of ['Enter', 'Enter', '2', '2', 'Enter', '3', 'Enter']) {
  await page.keyboard.press(k);
  await page.waitForTimeout(150);
}
await page.waitForSelector('.creator .outcome', { timeout: 5000 }).catch(() => {});
talk = await page.locator('.creator .talk').innerText();
check(/READY TO PLAY/i.test(talk) && /PARTY OF FOUR/i.test(talk) && /BELL OF RUIN/i.test(talk), 'answering the questions draws up a valid world that matches them');
const preview = await page.evaluate(() => {
  const c = document.querySelector('.creator canvas.worldmap');
  return c ? { w: c.width, h: c.height } : null;
});
check(preview && preview.w > 60 && preview.h > 40, `the map of the new world is shown (${preview?.w}x${preview?.h})`);
const madeName = (await page.locator('.creator .side .title').innerText()).trim();
await shot('31-creator-world');
const [download] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.locator('.creator .btn', { hasText: /^Download$/i }).click()]);
let downloaded = null;
if (download) downloaded = JSON.parse(readFileSync(await download.path(), 'utf8'));
check(downloaded && downloaded.world.name.toUpperCase() === madeName.toUpperCase() && downloaded.rooms.length >= 10, 'Download saves the world as a file');
await page.locator('.creator .btn', { hasText: /Another layout/i }).click();
await page.waitForTimeout(500);
const second = (await page.locator('.creator .side .title').innerText()).trim();
check(/READY TO PLAY/i.test(await page.locator('.creator .talk').innerText()), `Another layout draws a different valid world ("${madeName}", then "${second}")`);
await page.keyboard.press('KeyP');
await page.waitForFunction(() => window.__worldForge?.world.def.world.author === 'World Forge creator', null, { timeout: 5000 }).catch(() => {});
await page.waitForTimeout(400);
h = await hud();
check(h.overlay !== null && h.overlay.toUpperCase().includes(second.toUpperCase()) && /BACK\s+TO\s+CREATOR/i.test(h.overlay), 'P plays it, opening on its own title screen');
await shot('32-created-title');
await key('KeyX', 500);
s = await state();
h = await hud();
check(h.overlay === null && s.members.length === 4 && s.tick > 0, 'the made world plays, with a party of four');
await key('KeyW', 300);
await shot('33-created-play');
await page.goto(URL + '#create');
await page.reload();
await page.waitForSelector('.creator textarea', { timeout: 5000 }).catch(() => {});
check(await page.locator('.creator textarea').isVisible(), 'the creator can be opened from the address (#create)');
await page.locator('.creator .btn', { hasText: /Surprise me/i }).click();
await page.locator('.creator .btn', { hasText: /Decide the rest/i }).click();
await page.waitForSelector('.creator .outcome', { timeout: 5000 }).catch(() => {});
check(/READY TO PLAY/i.test(await page.locator('.creator .talk').innerText()), 'with no description at all, the defaults still make a valid world');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
check(/WORLD FORGE PRESENTS/i.test((await hud()).overlay ?? ''), 'Escape leaves the creator for the title screen');

check(problems.length === 0, `no console errors or failed requests${problems.length ? `: ${problems.join(' | ')}` : ''}`);
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll browser checks passed');
process.exit(failed ? 1 : 0);
