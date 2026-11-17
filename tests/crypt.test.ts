/**
 * The Sunken Crypt: a second adventure, different in layout, tileset, enemies,
 * party and quests, played through the same engine with no code of its own.
 * If this file passes, the engine is not tied to The Forgotten Mines.
 */
import { describe, expect, it } from 'vitest';
import { createSession, serializeSession } from '../src/engine/sim';
import type { SessionState } from '../src/engine/types';
import { loadWorld, loadWorldText } from '../src/world/load';
import type { CompiledWorld } from '../src/world/compile';
import cryptJson from '../src/worlds/sunken-crypt.json';
import { act, face, fight, interact, loadCrypt, loadMines, walkTo } from './helpers';

const N = 0;
const E = 1;
const W = 3;

function use(state: SessionState, world: CompiledWorld, dir: number) {
  face(state, world, dir);
  return act(state, world, interact(), 4);
}
const enemyOf = (state: SessionState, encounter: string) => state.enemies.filter((e) => e.id.startsWith(encounter));

/** By the front door: take the sigil from the embalmers' coffer and unlock the vault. */
function byTheKey(seed: number) {
  const world = loadCrypt();
  const state = createSession(world, seed);
  walkTo(state, world, 5, 10);
  use(state, world, W);
  for (const e of enemyOf(state, 'encounter_coffer_guard')) fight(state, world, e);
  walkTo(state, world, 2, 9);
  use(state, world, W);
  const afterCoffer = structuredClone(state.quests);
  walkTo(state, world, 7, 9);
  use(state, world, N);
  for (const e of enemyOf(state, 'encounter_warden')) fight(state, world, e);
  walkTo(state, world, 6, 4);
  use(state, world, N);
  walkTo(state, world, 7, 1);
  use(state, world, E);
  return { world, state, afterCoffer };
}

/** By the back way: through the ossuary and chapel, and the walled-up door. */
function byTheSecretWay(seed: number) {
  const world = loadCrypt();
  const state = createSession(world, seed);
  walkTo(state, world, 9, 10);
  use(state, world, E);
  for (const e of enemyOf(state, 'encounter_restless_dead')) fight(state, world, e);
  walkTo(state, world, 12, 8);
  use(state, world, N);
  for (const e of enemyOf(state, 'encounter_chapel_watch')) fight(state, world, e);
  walkTo(state, world, 10, 5);
  const found = use(state, world, W);
  // The Warden hears the stone move and comes to the gap; the fight is where it finds you.
  for (const e of enemyOf(state, 'encounter_warden')) fight(state, world, e);
  walkTo(state, world, 6, 4);
  use(state, world, N);
  walkTo(state, world, 7, 1);
  use(state, world, E);
  return { world, state, found };
}

describe('The Sunken Crypt as world data', () => {
  it('loads through the same loader as the Mines', () => {
    const world = loadCrypt();
    expect(world.def.world.name).toBe('The Sunken Crypt');
    expect(world.def.rooms).toHaveLength(7);
    expect(world.spawns).toHaveLength(5);
    expect(world.def.settings.startingPartyIds).toEqual(['char_wren', 'char_hale']);
  });

  it('uses two environments, and each cell knows its own', () => {
    const world = loadCrypt();
    expect(world.environments).toEqual(['mine', 'crypt']);
    const env = (x: number, y: number) => world.environments[world.envAt[y * world.width + x]];
    expect(env(7, 15)).toBe('mine'); // the broken adit
    expect(env(7, 10)).toBe('crypt'); // the hall of the dead
    expect(env(4, 10)).toBe('crypt'); // a doorway between two crypt rooms
    expect(['mine', 'crypt']).toContain(env(7, 13)); // the breach joins one of each
    expect(loadMines().environments).toEqual(['mine']);
  });

  it('shares no content with the Mines', () => {
    const mines = loadMines().def;
    const crypt = loadCrypt().def;
    const ids = (def: typeof mines) => [...def.rooms, ...def.doors, ...def.enemies, ...def.encounters, ...def.characters, ...def.quests].map((x) => x.id);
    expect(ids(crypt).filter((id) => ids(mines).includes(id))).toEqual([]);
  });

  it('starts with a party of two and both quests', () => {
    const world = loadCrypt();
    const state = createSession(world, 1);
    expect(state.party.members.map((m) => [m.id, m.controller, m.row])).toEqual([
      ['char_wren', 'local', 'front'],
      ['char_hale', 'ai', 'front'],
    ]);
    expect(Object.keys(state.quests)).toEqual(['quest_ashen_chalice', 'quest_embalmers']);
  });
});

describe('The Sunken Crypt, played', () => {
  it('can be won by the front door, with the sigil', () => {
    const { state, afterCoffer } = byTheKey(7);
    expect(state.status).toBe('playing');
    // The side quest finished at the coffer, and that did not finish the adventure.
    expect(afterCoffer.quest_embalmers.completed).toBe(true);
    expect(afterCoffer.quest_ashen_chalice.completed).toBe(false);
    expect(state.doorsUnlocked.door_hall_vault).toBe(true);
    expect(state.quests.quest_ashen_chalice).toEqual({ completed: true, done: { enter_vault: true, lay_warden: true, take_chalice: true } });
    expect(state.inventory.item_ashen_chalice).toBe(1);
  });

  it('can be won by the walled-up way, without the sigil', () => {
    const { state, found } = byTheSecretWay(7);
    expect(found.some((e) => e.type === 'secret.found')).toBe(true);
    expect(state.status).toBe('playing');
    expect(state.inventory.item_bronze_sigil).toBeUndefined();
    expect(state.doorsUnlocked.door_hall_vault).toBeFalsy();
    expect(state.quests.quest_ashen_chalice.completed).toBe(true);
    expect(state.quests.quest_embalmers.completed).toBe(false);
  });

  it('plays out identically from the same seed', () => {
    expect(serializeSession(byTheKey(11).state)).toBe(serializeSession(byTheKey(11).state));
    expect(serializeSession(byTheSecretWay(11).state)).toBe(serializeSession(byTheSecretWay(11).state));
  });
});

describe('loading worlds', () => {
  it('reports text that is not JSON without throwing', () => {
    const result = loadWorldText('{ not a world');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].message).toMatch(/Not valid JSON/);
  });

  it('loads a world from the text of a file', () => {
    const result = loadWorldText(JSON.stringify(cryptJson));
    expect(result.ok).toBe(true);
  });

  it('refuses a world with a broken reference, and says where', () => {
    const broken = structuredClone(cryptJson) as any;
    broken.encounters[0].placements[0].enemyId = 'enemy_that_is_not_there';
    const result = loadWorld(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.code === 'missing_reference' && /enemy_that_is_not_there/.test(i.message))).toBe(true);
  });

  it('refuses a world from an engine that does not exist yet', () => {
    const result = loadWorld({ ...structuredClone(cryptJson), schemaVersion: '9.0.0' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].code).toBe('unsupported_version');
  });

  it('refuses anything that tries to bring behaviour of its own', () => {
    const sneaky = structuredClone(cryptJson) as any;
    sneaky.enemies[0].behaviour = 'function(){ steal() }';
    const result = loadWorld(sneaky);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].code).toBe('shape');
  });

  it('migrates an older world forward on load', () => {
    const old = structuredClone(cryptJson) as any;
    // A 0.7.0 file could not have had these; strip them and wind the version back.
    old.schemaVersion = '0.7.0';
    old.regions.forEach((r: any) => (r.environment = 'mine'));
    old.enemies.forEach((e: any) => {
      e.archetype = 'goblin';
      e.visualAssetId = 'goblin';
      delete e.alertText;
    });
    old.objects = old.objects.filter((o: any) => o.type !== 'prop' || ['barrel', 'crate', 'rubble'].includes(o.visualAssetId));
    old.rooms.forEach((r: any) => (r.objectIds = r.objectIds.filter((id: string) => old.objects.some((o: any) => o.id === id))));
    old.quests.forEach((q: any) => delete q.kind);
    const result = loadWorld(old);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.world.def.schemaVersion).toBe('0.8.0');
    expect(result.world.def.quests.map((q) => q.kind)).toEqual(['main', 'main']);
  });
});
