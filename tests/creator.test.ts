/**
 * The world creator (Phase 5): briefs become plans, plans become layouts and
 * world data, and every world it hands over validates, loads and can be won.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_BRIEF, readConcept, type AdventureBrief } from '../src/creator/brief';
import { generateWorld } from '../src/creator/generate';
import { layOut } from '../src/creator/layout';
import { planAdventure } from '../src/creator/local';
import { createSession, serializeSession } from '../src/engine/sim';
import { validateWorld } from '../src/schema/validate';
import { loadWorld } from '../src/world/load';
import { explore, loadMines } from './helpers';

const brief = (over: Partial<AdventureBrief> = {}): AdventureBrief => ({ ...DEFAULT_BRIEF, ...over });

async function made(over: Partial<AdventureBrief>, seed: number) {
  const result = await generateWorld(brief(over), seed);
  if (!result.ok) throw new Error(result.attempts.map((a) => a.problem).join('\n'));
  const loaded = loadWorld(result.world);
  if (!loaded.ok) throw new Error(loaded.issues.map((i) => i.message).join('\n'));
  return { ...result, compiled: loaded.world };
}

describe('reading a description', () => {
  it('takes what the words clearly say', () => {
    expect(readConcept('Goblins have taken an old dwarven mine. Recover the Ember Crown from their chief.')).toMatchObject({
      setting: 'mine',
      inhabitants: 'goblins',
      objective: 'relic',
      relicName: 'Ember Crown',
    });
    expect(readConcept('A crypt beneath a ruined chapel, where the dead will not stay buried.')).toMatchObject({ setting: 'crypt', inhabitants: 'undead' });
    expect(readConcept('Miners broke into a forgotten tomb, and skeletons followed them up.')).toMatchObject({ setting: 'both', inhabitants: 'undead' });
    expect(readConcept('A short, brutal raid on a goblin warren for a party of four.')).toMatchObject({ scale: 'small', difficulty: 'brutal', party: 'four' });
    expect(readConcept('Slay the lich in its barrow.')).toMatchObject({ objective: 'slay', setting: 'crypt', inhabitants: 'undead' });
    expect(readConcept('An adventure called "The Glass Deeps"')).toMatchObject({ title: 'The Glass Deeps' });
  });

  it('leaves alone what the words do not say', () => {
    expect(readConcept('')).toEqual({});
    expect(readConcept('Something interesting, please.')).toEqual({});
  });
});

describe('planning and laying out', () => {
  it('the same brief and seed give the same plan and the same world', async () => {
    const b = brief({ scale: 'medium', setting: 'both', inhabitants: 'mixed' });
    expect(JSON.stringify(planAdventure(b, 9))).toBe(JSON.stringify(planAdventure(b, 9)));
    const one = await generateWorld(b, 9);
    const two = await generateWorld(b, 9);
    expect(JSON.stringify(one)).toBe(JSON.stringify(two));
  });

  it('a plan is progression-aware: the boss sits behind a locked door, its key on the near side', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const plan = planAdventure(brief({ scale: seed % 2 ? 'medium' : 'small' }), seed);
      const boss = plan.rooms.find((r) => r.type === 'boss')!;
      expect(boss.via).toBe('locked');
      const key = plan.loot.find((l) => l.kind === 'key')!;
      expect(key.roomKey).not.toBe(boss.key);
      expect(plan.encounters.filter((e) => e.boss)).toHaveLength(1);
      expect(plan.quests[0].kind).toBe('main');
    }
  });

  it('room counts follow the scale', () => {
    const count = (scale: AdventureBrief['scale'], seed: number) => planAdventure(brief({ scale, secrets: false }), seed).rooms.length;
    for (let seed = 1; seed <= 10; seed++) {
      expect(count('small', seed)).toBeGreaterThanOrEqual(4);
      expect(count('small', seed)).toBeLessThanOrEqual(6);
      expect(count('medium', seed)).toBeGreaterThanOrEqual(10);
      expect(count('large', seed)).toBeGreaterThanOrEqual(20);
    }
  });

  it('rooms never overlap and every door sits in the wall between two rooms', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const plan = planAdventure(brief({ scale: 'large' }), seed);
      const layout = layOut(plan, seed);
      if (!layout) continue;
      const rects = [...layout.rects.values()];
      for (let i = 0; i < rects.length; i++)
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i];
          const b = rects[j];
          expect(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y).toBe(true);
        }
      for (const d of layout.doors) {
        const touches = (r: { x: number; y: number; w: number; h: number }) =>
          [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => d.x + dx >= r.x && d.x + dx < r.x + r.w && d.y + dy >= r.y && d.y + dy < r.y + r.h);
        expect(touches(layout.rects.get(d.a)!) && touches(layout.rects.get(d.b)!)).toBe(true);
      }
    }
  });
});

describe('generated worlds', () => {
  const variety: Partial<AdventureBrief>[] = [];
  for (const scale of ['small', 'medium', 'large'] as const)
    for (const setting of ['mine', 'crypt', 'both'] as const)
      for (const party of ['fighter', 'pair', 'four'] as const)
        variety.push({ scale, setting, party, inhabitants: setting === 'mine' ? 'goblins' : setting === 'crypt' ? 'undead' : 'mixed', objective: party === 'pair' ? 'slay' : 'relic' });

  it('every combination of scale, setting and party validates and loads', async () => {
    for (const [i, over] of variety.entries()) {
      for (const seed of [i * 3 + 1, i * 3 + 2]) {
        const { world, compiled } = await made(over, seed);
        expect(validateWorld(world).ok).toBe(true);
        expect(compiled.def.settings.startingPartyIds).toHaveLength(over.party === 'fighter' ? 1 : over.party === 'pair' ? 2 : 4);
        // It plays: a session starts and survives a save and reload.
        const state = createSession(compiled, seed);
        expect(JSON.parse(serializeSession(state)).stateVersion).toBe(8);
      }
    }
  });

  it('uses the right tilesets, enemies and objective', async () => {
    const crypt = await made({ setting: 'crypt', inhabitants: 'undead' }, 4);
    expect(crypt.compiled.environments).toEqual(['crypt']);
    expect(crypt.world.enemies.map((e) => e.archetype).sort()).toEqual(['skeleton', 'warden']);
    const both = await made({ scale: 'medium', setting: 'both', inhabitants: 'mixed' }, 4);
    expect(both.compiled.environments.sort()).toEqual(['crypt', 'mine']);
    const relic = await made({ objective: 'relic', relicName: 'Moon Crown' }, 5);
    expect(relic.world.items.some((i) => i.name === 'Moon Crown')).toBe(true);
    expect(relic.world.quests[0].objectives.map((o) => o.type)).toEqual(['reach_room', 'defeat_encounter', 'collect_item']);
    const slay = await made({ objective: 'slay' }, 5);
    expect(slay.world.quests[0].objectives.map((o) => o.type)).toEqual(['collect_item', 'defeat_encounter']);
    const plain = await made({ secrets: false, sideQuest: false }, 6);
    expect(plain.world.doors.some((d) => d.kind === 'breakable')).toBe(false);
    expect(plain.world.quests).toHaveLength(1);
  });

  it('a brief from a sentence alone makes a world', async () => {
    const { world } = await made(readConcept('Goblins have taken an old dwarven mine. Recover the Ember Crown from their chief.'), 3);
    expect(world.quests[0].title).toBe('The Ember Crown');
  });

  it('generated worlds can be won by a player who has never seen them', async () => {
    const cases: [Partial<AdventureBrief>, number][] = [
      [{ scale: 'small', setting: 'mine', party: 'fighter', difficulty: 'gentle' }, 1],
      [{ scale: 'small', setting: 'crypt', inhabitants: 'undead', party: 'pair', objective: 'slay', difficulty: 'gentle' }, 2],
      [{ scale: 'small', setting: 'both', inhabitants: 'mixed', party: 'four', difficulty: 'gentle' }, 3],
      [{ scale: 'medium', setting: 'mine', party: 'four', difficulty: 'gentle' }, 4],
      [{ scale: 'medium', setting: 'crypt', inhabitants: 'undead', party: 'four', difficulty: 'gentle' }, 5],
    ];
    for (const [over, seed] of cases) {
      const { compiled } = await made(over, seed);
      const state = createSession(compiled, seed);
      const outcome = explore(state, compiled);
      expect(`${JSON.stringify(over)}: ${outcome}`).toBe(`${JSON.stringify(over)}: won`);
    }
  }, 60000);

  it('the bot also wins the hand-made Mines, so it is a fair judge', () => {
    const world = loadMines();
    const state = createSession(world, 7);
    expect(explore(state, world)).toBe('won');
  });
});
