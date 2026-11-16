/**
 * The golden reference adventure. This plays The Forgotten Mines from the
 * first step to the finished quest and is the engine's standing regression
 * test: every major change must keep it passing.
 */
import { describe, expect, it } from 'vitest';
import { createSession, deserializeSession, serializeSession } from '../src/engine/sim';
import type { GameEvent } from '../src/engine/types';
import { validateWorld } from '../src/schema/validate';
import { HERO, act, face, fight, interact, loadMines, minesData, move, walkTo } from './helpers';

const N = 0;
const E = 1;
const S = 2;
const W = 3;
const types = (events: GameEvent[]) => events.map((e) => e.type);

describe('The Forgotten Mines: contents', () => {
  const world = loadMines();
  const def = world.def;

  it('has everything the golden reference adventure calls for', () => {
    expect(def.rooms.filter((r) => r.type !== 'secret')).toHaveLength(5);
    expect(def.rooms.filter((r) => r.type === 'entrance')).toHaveLength(1);
    expect(def.rooms.filter((r) => r.type === 'secret')).toHaveLength(1);
    expect(def.doors.filter((d) => d.lock)).toHaveLength(1);
    expect(def.items.filter((i) => i.category === 'key')).toHaveLength(1);
    expect(def.objects.filter((o) => o.type === 'chest')).toHaveLength(1);
    expect(def.encounters.filter((e) => e.boss)).toHaveLength(1);
    expect(def.encounters.filter((e) => !e.boss)).toHaveLength(1);
    expect(def.quests).toHaveLength(1);
  });
});

describe('locked door and key', () => {
  it('the shaft door stays shut without the key', () => {
    const world = loadMines();
    const state = createSession(world);
    walkTo(state, world, 5, 9);
    face(state, world, W);
    expect(act(state, world, move('forward'))).toContainEqual({ type: 'party.bumped', reason: 'door' });
    expect(act(state, world, interact())).toContainEqual({ type: 'door.locked', doorId: 'door_tunnel_shaft' });
    expect(state.doorsOpen.door_tunnel_shaft).toBe(false);
  });

  it('walking over the key picks it up, and the key opens the door', () => {
    const world = loadMines();
    const state = createSession(world);
    // Put the party beside the key without the fight, to test the lock alone.
    state.enemies[0].ai = 'dead';
    state.doorsOpen.door_tunnel_hall = true;
    state.doorsOpen.door_hall_storeroom = true;
    const events = walkTo(state, world, 12, 3);
    expect(events).toContainEqual({ type: 'item.gained', itemId: 'item_shaft_key', from: 'pickup' });
    expect(state.inventory).toEqual({ item_shaft_key: 1 });
    // Walking over the same spot again gives nothing more.
    walkTo(state, world, 11, 3);
    walkTo(state, world, 12, 3);
    expect(state.inventory).toEqual({ item_shaft_key: 1 });

    walkTo(state, world, 5, 9);
    face(state, world, W);
    const opened = act(state, world, interact());
    expect(opened).toContainEqual({ type: 'door.unlocked', doorId: 'door_tunnel_shaft', itemId: 'item_shaft_key' });
    expect(opened).toContainEqual({ type: 'door.opened', doorId: 'door_tunnel_shaft' });
    // Once unlocked it works like any door.
    state.enemies[1].ai = 'dead';
    expect(types(act(state, world, interact()))).toContain('door.closed');
    expect(types(act(state, world, interact()))).toEqual(['door.opened']);
  });
});

describe('secret room and chest', () => {
  it('the secret door feels like wall until it is tried', () => {
    const world = loadMines();
    const state = createSession(world);
    walkTo(state, world, 5, 9);
    face(state, world, E);
    expect(act(state, world, move('forward'))).toContainEqual({ type: 'party.bumped', reason: 'wall' });
    expect(act(state, world, interact())).toContainEqual({ type: 'secret.found', doorId: 'door_tunnel_cache' });
    expect(types(act(state, world, interact()))).toEqual(['interact.nothing']);
    const entered = walkTo(state, world, 7, 9);
    expect(entered).toContainEqual({ type: 'room.entered', roomId: 'room_hidden_cache', firstVisit: true });
  });

  it('the chest blocks its cell, opens once and gives its contents', () => {
    const world = loadMines();
    const state = createSession(world);
    walkTo(state, world, 5, 9);
    face(state, world, E);
    act(state, world, interact());
    walkTo(state, world, 8, 9);
    face(state, world, S);
    expect(act(state, world, move('forward'))).toContainEqual({ type: 'party.bumped', reason: 'object' });
    const opened = act(state, world, interact());
    expect(types(opened)).toEqual(['chest.opened', 'item.gained', 'item.gained', 'quest.objective']);
    expect(state.inventory).toEqual({ item_healing_draught: 1, item_gold_pouch: 1 });
    expect(types(act(state, world, interact()))).toEqual(['interact.nothing']);
  });
});

describe('healing draught', () => {
  it('heals a hurt character and is used up', () => {
    const world = loadMines();
    const state = createSession(world);
    state.inventory.item_healing_draught = 1;
    state.party.members[0].hp = 15;
    const events = act(state, world, { type: 'use', actor: HERO, itemId: 'item_healing_draught' });
    expect(events).toContainEqual({ type: 'item.used', itemId: 'item_healing_draught', actor: HERO, healed: 20 });
    expect(state.party.members[0].hp).toBe(35);
    expect(state.inventory).toEqual({});
    expect(act(state, world, { type: 'use', actor: HERO, itemId: 'item_healing_draught' })).toContainEqual({
      type: 'item.refused',
      itemId: 'item_healing_draught',
      reason: 'none_left',
    });
  });

  it('never heals past full health and is not wasted at full health', () => {
    const world = loadMines();
    const state = createSession(world);
    state.inventory.item_healing_draught = 2;
    expect(types(act(state, world, { type: 'use', actor: HERO, itemId: 'item_healing_draught' }))).toEqual(['item.refused']);
    expect(state.inventory.item_healing_draught).toBe(2);
    state.party.members[0].hp = 33;
    act(state, world, { type: 'use', actor: HERO, itemId: 'item_healing_draught' });
    expect(state.party.members[0].hp).toBe(40);
    expect(state.inventory.item_healing_draught).toBe(1);
  });

  it('refuses things that cannot be drunk', () => {
    const world = loadMines();
    const state = createSession(world);
    state.inventory.item_shaft_key = 1;
    expect(act(state, world, { type: 'use', actor: HERO, itemId: 'item_shaft_key' })).toContainEqual({
      type: 'item.refused',
      itemId: 'item_shaft_key',
      reason: 'not_usable',
    });
  });
});

describe('the whole adventure', () => {
  function playThrough(seed: number) {
    const world = loadMines();
    const state = createSession(world, seed);
    const log: GameEvent[] = [];
    const go = (x: number, y: number) => log.push(...walkTo(state, world, x, y));
    const use = (dir: number) => {
      log.push(...face(state, world, dir));
      log.push(...act(state, world, interact(), 4));
    };

    // The shaft door is locked, so look around: the east wall gives way.
    go(5, 9);
    use(W);
    use(E);
    go(8, 9);
    use(S);
    // Through the hall door and the goblin patrol.
    go(5, 7);
    use(N);
    log.push(...fight(state, world, state.enemies[0]));
    // The key is in the storeroom.
    go(8, 3);
    use(E);
    go(12, 3);
    // Back to the shaft door, and the chief behind it.
    go(5, 9);
    use(W);
    log.push(...fight(state, world, state.enemies[1]));
    // Step into the chief's hall to finish the tour.
    if (state.status === 'playing') go(3, 9);
    return { world, state, log };
  }

  it('can be played from the entrance to the finished quest', () => {
    const { state, log } = playThrough(7);
    const order = types(log);
    expect(state.status).toBe('playing');
    expect(state.enemies.every((e) => e.ai === 'dead')).toBe(true);
    expect(state.quests.quest_clear_mines).toEqual({
      done: { find_cache: true, find_key: true, slay_chief: true },
      completed: true,
    });
    expect(state.visitedRoomIds).toHaveLength(6);

    // The story happens in the right order.
    const at = (type: GameEvent['type']) => order.indexOf(type);
    expect(at('door.locked')).toBeGreaterThan(-1);
    expect(at('secret.found')).toBeGreaterThan(at('door.locked'));
    expect(at('chest.opened')).toBeGreaterThan(at('secret.found'));
    expect(at('door.unlocked')).toBeGreaterThan(at('item.gained'));
    expect(order.filter((t) => t === 'encounter.started')).toHaveLength(2);
    expect(order.filter((t) => t === 'quest.completed')).toHaveLength(1);
    expect(order.lastIndexOf('quest.completed')).toBeGreaterThan(order.lastIndexOf('enemy.died') - 3);
  });

  it('is finished only by the required objectives', () => {
    const world = loadMines();
    const state = createSession(world, 3);
    state.enemies[0].ai = 'dead';
    state.doorsOpen.door_tunnel_hall = true;
    state.doorsOpen.door_hall_storeroom = true;
    walkTo(state, world, 12, 3);
    walkTo(state, world, 5, 9);
    face(state, world, W);
    act(state, world, interact(), 4);
    fight(state, world, state.enemies[1]);
    expect(state.quests.quest_clear_mines.completed).toBe(true);
    expect(state.quests.quest_clear_mines.done.find_cache).toBeUndefined();
  });

  it('plays out identically from the same seed', () => {
    expect(serializeSession(playThrough(11).state)).toBe(serializeSession(playThrough(11).state));
  });

  it('survives a save and reload in the middle', () => {
    const world = loadMines();
    const state = createSession(world, 5);
    walkTo(state, world, 5, 9);
    face(state, world, E);
    act(state, world, interact());
    walkTo(state, world, 8, 9);
    face(state, world, S);
    act(state, world, interact());
    const restored = deserializeSession(serializeSession(state));
    expect(restored).toEqual(state);
    expect(restored.inventory.item_healing_draught).toBe(1);
    expect(restored.doorsOpen.door_tunnel_cache).toBe(true);
    expect(restored.quests.quest_clear_mines.done.find_cache).toBe(true);
  });
});

describe('progression checks in validation', () => {
  const codes = (data: unknown) => {
    const r = validateWorld(data);
    return r.ok ? [] : r.issues.map((i) => i.code);
  };
  const object = (data: any, objectId: string) => data.objects.find((o: any) => o.id === objectId);

  it('rejects a key locked behind its own door', () => {
    const data = minesData();
    const key = object(data, 'object_shaft_key');
    key.roomId = 'room_old_shaft';
    key.cell = { x: 3, y: 10 };
    data.rooms.find((r: any) => r.id === 'room_storeroom').objectIds = data.rooms
      .find((r: any) => r.id === 'room_storeroom')
      .objectIds.filter((o: string) => o !== 'object_shaft_key');
    data.rooms.find((r: any) => r.id === 'room_old_shaft').objectIds.push('object_shaft_key');
    expect(codes(data)).toEqual(['unreachable']);
  });

  it('accepts a key kept inside a chest', () => {
    const data = minesData();
    data.objects = data.objects.filter((o: any) => o.id !== 'object_shaft_key');
    const store = data.rooms.find((r: any) => r.id === 'room_storeroom');
    store.objectIds = store.objectIds.filter((o: string) => o !== 'object_shaft_key');
    object(data, 'object_cache_chest').contents.push('item_shaft_key');
    expect(codes(data)).toEqual([]);
  });

  it('rejects a lock that needs a missing or wrong item', () => {
    const missing = minesData();
    missing.doors.find((d: any) => d.lock).lock.keyItemId = 'item_skeleton_key';
    expect(codes(missing)).toContain('missing_reference');
    const wrong = minesData();
    wrong.doors.find((d: any) => d.lock).lock.keyItemId = 'item_gold_pouch';
    expect(codes(wrong)).toContain('missing_reference');
  });

  it('rejects a lock on anything but a door', () => {
    const data = minesData();
    data.doors.find((d: any) => d.kind === 'secret').lock = { keyItemId: 'item_shaft_key' };
    expect(codes(data)).toContain('connection');
  });

  it('rejects a chest or pickup with a missing item', () => {
    const data = minesData();
    object(data, 'object_cache_chest').contents = ['item_crown'];
    expect(codes(data)).toContain('missing_reference');
  });

  it('rejects quest objectives that point at nothing', () => {
    const data = minesData();
    data.quests[0].objectives[1].targetId = 'encounter_dragon';
    expect(codes(data)).toContain('quest');
  });

  it('rejects a quest item that nothing in the world gives', () => {
    const data = minesData();
    data.quests[0].objectives[0].targetId = 'item_short_sword';
    expect(codes(data)).toContain('quest');
  });

  it('rejects a quest with only optional objectives', () => {
    const data = minesData();
    for (const o of data.quests[0].objectives) o.optional = true;
    expect(codes(data)).toContain('quest');
  });

  it('rejects objective types the engine does not support', () => {
    const data = minesData();
    data.quests[0].objectives[0].type = 'eval_script';
    expect(codes(data)).toContain('shape');
  });

  it('migrates a 0.1.0 world step by step and still rejects unknown versions', () => {
    const old = minesData();
    old.schemaVersion = '0.1.0';
    delete old.settings.startingQuestIds;
    delete old.quests;
    // A 0.1.0 world has none of the 0.2.0 content.
    old.objects = old.objects.filter((o: any) => (o.type === 'torch' || o.type === 'prop') && o.roomId !== 'room_hidden_cache');
    old.items = old.items.filter((i: any) => i.category === 'weapon');
    old.doors = old.doors.filter((d: any) => d.kind !== 'secret');
    for (const d of old.doors) delete d.lock;
    old.rooms = old.rooms.filter((r: any) => r.id !== 'room_hidden_cache');
    old.regions[0].roomIds = old.regions[0].roomIds.filter((r: string) => r !== 'room_hidden_cache');
    for (const r of old.rooms) {
      r.connections = r.connections.filter((c: any) => c.targetRoomId !== 'room_hidden_cache');
      r.objectIds = r.objectIds.filter((o: string) => old.objects.some((obj: any) => obj.id === o));
    }
    for (const e of old.encounters) {
      delete e.boss;
      delete e.intro;
    }
    // Weapons had a single attack and enemies a single blow before 0.3.0.
    for (const item of old.items) item.weapon = { damage: item.weapon.light.damage, windupTicks: 6, recoveryTicks: 20 };
    for (const c of old.characters) {
      delete c.level;
      delete c.attributes;
      c.maxHealth = 40;
    }
    for (const e of old.enemies) delete e.xp;
    for (const item of old.items) item.weapon.damage = { min: 4, max: 7 };
    for (const e of old.enemies) {
      e.damage = e.attacks[0].damage;
      e.attack = { telegraphTicks: e.attacks[0].telegraphTicks, recoverTicks: e.attacks[0].recoverTicks };
      delete e.attacks;
      delete e.poise;
    }
    const migrated = validateWorld(old);
    expect(migrated.ok ? [] : migrated.issues).toEqual([]);
    if (!migrated.ok) throw new Error('migration failed');
    expect(migrated.world.schemaVersion).toBe('0.4.0');
    expect(migrated.world.settings.startingQuestIds).toEqual([]);
    const sword = migrated.world.items[0];
    if (sword.category !== 'weapon') throw new Error('not a weapon');
    expect(sword.weapon.light).toEqual({ damage: { min: 4, max: 7 }, windupTicks: 6, recoveryTicks: 20, staminaCost: 4, impact: 1 });
    expect(sword.weapon.heavy.impact).toBe(3);
    expect(sword.weapon.heavy.damage.min).toBeGreaterThan(sword.weapon.light.damage.max);
    expect(migrated.world.enemies[0].attacks).toHaveLength(1);
    expect(migrated.world.enemies[0].attacks[0]).toMatchObject({ id: 'strike', pattern: 'front', blockable: true, telegraphTicks: 34 });
    // Health and stamina now come from class, level and attributes.
    expect(migrated.world.characters[0]).toMatchObject({ classId: 'fighter', level: 1 });
    expect(migrated.world.characters[0]).not.toHaveProperty('maxHealth');
    expect(migrated.world.enemies[0].xp).toBe(0);

    const future = minesData();
    future.schemaVersion = '9.9.9';
    expect(codes(future)).toEqual(['unsupported_version']);
  });
});
