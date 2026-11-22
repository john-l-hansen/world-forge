/**
 * The assembler: a plan plus a layout becomes world data the engine can load.
 * It places torches, props, chests, pickups and enemies inside rooms, keeps
 * doorways and walkways clear, and gives everything a stable ID. Its output
 * is plain data, checked by the same validator as any hand-made world.
 */
import { makeRng } from '../engine/rng';
import { SCHEMA_VERSION, type Environment, type Facing, type ItemDef, type ObjectDef, type WorldDefinition } from '../schema/world';
import { LOOT, SPELLS, characterFor, enemyFor, weaponFor } from './bestiary';
import type { Layout, Rect } from './layout';
import type { AdventurePlan, PlanLoot } from './plan';

type Cell = { x: number; y: number };
const FACING: Facing[] = ['north', 'east', 'south', 'west'];
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'x';
}

const PROPS: Record<Environment, ('barrel' | 'crate' | 'rubble' | 'sarcophagus' | 'urn' | 'bones')[]> = {
  mine: ['barrel', 'crate', 'rubble', 'crate'],
  crypt: ['sarcophagus', 'urn', 'bones', 'urn'],
};
const PROP_NAME: Record<string, string> = { barrel: 'Barrel', crate: 'Crate', rubble: 'Rubble', sarcophagus: 'Sarcophagus', urn: 'Burial urn', bones: 'Old bones' };

export function assemble(plan: AdventurePlan, layout: Layout, seed: number): WorldDefinition {
  const rng = makeRng(seed * 104729 + 3);
  const brief = plan.brief;
  const inside = (r: Rect, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

  // ---- IDs ---------------------------------------------------------------
  const taken = new Set<string>();
  const unique = (base: string) => {
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}_${n}`;
    taken.add(id);
    return id;
  };
  const roomId = new Map(plan.rooms.map((r) => [r.key, unique(`room_${slug(r.name)}`)]));
  const rectOf = (key: string) => layout.rects.get(key)!;

  // ---- Doors -------------------------------------------------------------
  const doorIds: string[] = [];
  const doors: WorldDefinition['doors'] = layout.doors.map((d) => {
    const a = plan.rooms.find((r) => r.key === d.a)!;
    const b = plan.rooms.find((r) => r.key === d.b)!;
    const id = unique(`door_${slug(a.name).slice(0, 16)}_${slug(b.name).slice(0, 16)}`);
    doorIds.push(id);
    const name = d.via === 'archway' ? 'Archway' : d.via === 'breakable' ? 'Cracked wall' : d.via === 'locked' ? `Door to ${b.name}` : 'Door';
    return {
      id,
      name,
      kind: d.via === 'archway' ? 'archway' : d.via === 'breakable' ? 'breakable' : 'door',
      cell: { x: d.x, y: d.y },
      ...(d.via === 'locked' ? { lock: { keyItemId: 'item_inner_key' } } : {}),
      ...(d.via === 'breakable' ? { toughness: 3 } : {}),
    };
  });
  const doorCell = new Set(layout.doors.map((d) => `${d.x},${d.y}`));
  /** Cells right inside each doorway, which must stay clear. */
  const doorstep = new Set<string>();
  for (const d of layout.doors) for (let k = 0; k < 4; k++) doorstep.add(`${d.x + DX[k]},${d.y + DY[k]}`);

  // ---- Items -------------------------------------------------------------
  const items = new Map<string, ItemDef>();
  const crypt = (key: string) => plan.rooms.find((r) => r.key === key)?.environment === 'crypt';
  const itemFor = (loot: PlanLoot): ItemDef => {
    switch (loot.kind) {
      case 'key':
        return LOOT.key(crypt(plan.rooms.find((r) => r.type === 'boss')!.key));
      case 'relic':
        return LOOT.relic(plan.relicName);
      case 'draught':
        return LOOT.draught();
      case 'scroll':
        return LOOT.scroll(crypt(loot.roomKey));
      case 'shield':
        return LOOT.shield();
      case 'jerkin':
        return LOOT.jerkin();
      case 'helm':
        return LOOT.helm();
      case 'gold':
        return LOOT.gold();
    }
  };
  for (const c of plan.party) items.set(weaponFor(c.classId).id, weaponFor(c.classId));
  const lootItem = new Map<string, string>();
  for (const loot of plan.loot) {
    const item = itemFor(loot);
    items.set(item.id, item);
    lootItem.set(loot.key, item.id);
  }

  // ---- Placing things inside rooms ---------------------------------------
  const used = new Set<string>(); // anything standing in a cell
  const blocking = new Set<string>(); // things nobody can walk through
  const objects: ObjectDef[] = [];
  const objectIdsOf = new Map<string, string[]>(plan.rooms.map((r) => [r.key, []]));
  const cellsOf = (key: string) => {
    const r = rectOf(key);
    const out: Cell[] = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push({ x, y });
    return out;
  };
  const free = (c: Cell) => !used.has(`${c.x},${c.y}`) && !doorstep.has(`${c.x},${c.y}`);
  /** A cell against a wall that is not a doorway, with that wall's direction. */
  const wallSides = (key: string, c: Cell) => {
    const r = rectOf(key);
    const sides: number[] = [];
    for (let k = 0; k < 4; k++) {
      const nx = c.x + DX[k];
      const ny = c.y + DY[k];
      if (!inside(r, nx, ny) && !doorCell.has(`${nx},${ny}`)) sides.push(k);
    }
    return sides;
  };
  const place = (key: string, obj: ObjectDef, block: boolean) => {
    objects.push(obj);
    objectIdsOf.get(key)!.push(obj.id);
    used.add(`${obj.cell.x},${obj.cell.y}`);
    if (block) blocking.add(`${obj.cell.x},${obj.cell.y}`);
  };
  const shuffle = <T,>(list: T[]): T[] => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  // The start: the entrance cell farthest from its way on, facing it.
  const entrance = plan.rooms[0];
  const firstDoor = layout.doors.find((d) => d.a === entrance.key || d.b === entrance.key)!;
  const startCell = cellsOf(entrance.key).reduce((best, c) => (dist(c, firstDoor) > dist(best, firstDoor) ? c : best));
  used.add(`${startCell.x},${startCell.y}`);
  const startFacing = facingToward(startCell, firstDoor);

  // Torches on the walls, one or two a room.
  for (const room of plan.rooms) {
    const r = rectOf(room.key);
    const want = r.w * r.h <= 6 ? 1 : 2;
    let n = 0;
    for (const c of shuffle(cellsOf(room.key))) {
      if (n >= want) break;
      const sides = wallSides(room.key, c);
      if (!sides.length || !free(c)) continue;
      // Not two torches side by side.
      if (objects.some((o) => o.type === 'torch' && o.roomId === roomId.get(room.key) && dist(o.cell, c) < 2)) continue;
      place(room.key, { id: unique(`object_torch_${slug(room.name).slice(0, 18)}`), type: 'torch', name: 'Torch', roomId: roomId.get(room.key)!, cell: c, wall: FACING[sides[0]], radius: 4 }, false);
      n++;
    }
  }

  // Chests, against a wall and away from the doorways.
  const chests = new Map<string, PlanLoot[]>();
  for (const loot of plan.loot) if (loot.chest) chests.set(loot.chest, [...(chests.get(loot.chest) ?? []), loot]);
  const chestId = new Map<string, string>();
  for (const [key, contents] of chests) {
    const room = contents[0].roomKey;
    const spot = shuffle(cellsOf(room)).find((c) => free(c) && wallSides(room, c).length > 0);
    if (!spot) throw new Error(`no room for a chest in ${room}`);
    const id = unique(`object_${key}`);
    chestId.set(key, id);
    place(room, { id, type: 'chest', name: contents[0].chestName ?? 'Chest', roomId: roomId.get(room)!, cell: spot, contents: contents.map((l) => lootItem.get(l.key)!) }, true);
  }

  // Props, in the corners of the larger rooms, never in a corridor.
  for (const room of plan.rooms) {
    const r = rectOf(room.key);
    if (Math.min(r.w, r.h) < 3 || room.type === 'boss') continue;
    const count = Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const visual = PROPS[room.environment][Math.floor(rng() * PROPS[room.environment].length)];
      const spot = shuffle(cellsOf(room.key)).find((c) => free(c) && wallSides(room.key, c).length >= 2);
      if (!spot) break;
      const flat = visual === 'bones';
      place(room.key, { id: unique(`object_${visual}_${slug(room.name).slice(0, 16)}`), type: 'prop', name: PROP_NAME[visual], roomId: roomId.get(room.key)!, cell: spot, visualAssetId: visual, blocking: !flat }, !flat);
    }
  }

  // Things lying on the floor.
  for (const loot of plan.loot) {
    if (loot.chest) continue;
    // A pickup blocks nothing, so it may lie just inside a doorway if that is all the room there is.
    const cells = shuffle(cellsOf(loot.roomKey));
    const spot = cells.find(free) ?? cells.find((c) => !used.has(`${c.x},${c.y}`));
    if (!spot) throw new Error(`no room for ${loot.kind} in ${loot.roomKey}`);
    const item = items.get(lootItem.get(loot.key)!)!;
    place(loot.roomKey, { id: unique(`object_${slug(item.name)}`), type: 'pickup', name: item.name, roomId: roomId.get(loot.roomKey)!, cell: spot, itemId: item.id }, false);
  }

  // ---- Enemies -----------------------------------------------------------
  const enemies = new Map<string, WorldDefinition['enemies'][number]>();
  const encounters: WorldDefinition['encounters'] = [];
  const encounterId = new Map<string, string>();
  const encounterIdsOf = new Map<string, string[]>(plan.rooms.map((r) => [r.key, []]));
  for (const enc of plan.encounters) {
    const def = enemyFor(enc.enemy, brief.difficulty, brief.party, enc.boss ? plan.bossName : undefined);
    enemies.set(def.id, def);
    const room = enc.roomKey;
    const entry = layout.doors.find((d) => d.a === room || d.b === room)!;
    // The boss waits at the far end; others stand anywhere clear.
    const options = cellsOf(room).filter(free);
    const ordered = enc.boss ? options.sort((a, b) => dist(b, entry) - dist(a, entry)) : shuffle(options);
    const placements = ordered.slice(0, enc.count).map((c) => ({ enemyId: def.id, cell: c, facing: facingToward(c, entry) }));
    if (placements.length === 0) throw new Error(`no room for enemies in ${room}`);
    for (const p of placements) used.add(`${p.cell.x},${p.cell.y}`);
    const id = unique(`encounter_${slug(enc.name)}`);
    encounterId.set(enc.key, id);
    encounterIdsOf.get(room)!.push(id);
    encounters.push({ id, name: enc.name, roomId: roomId.get(room)!, placements, boss: Boolean(enc.boss), ...(enc.boss && enc.intro ? { intro: enc.intro } : {}) });
  }

  // ---- Walkways stay open ------------------------------------------------
  // Every open cell of every room, and a side of every chest, must be reachable from its doors.
  for (const room of plan.rooms) {
    const cells = cellsOf(room.key);
    const open = cells.filter((c) => !blocking.has(`${c.x},${c.y}`));
    const seen = new Set<string>();
    const queue = open.filter((c) => doorstep.has(`${c.x},${c.y}`) || (room.key === entrance.key && c.x === startCell.x && c.y === startCell.y));
    for (const c of queue) seen.add(`${c.x},${c.y}`);
    while (queue.length) {
      const c = queue.shift()!;
      for (let k = 0; k < 4; k++) {
        const n = { x: c.x + DX[k], y: c.y + DY[k] };
        const id = `${n.x},${n.y}`;
        if (seen.has(id) || blocking.has(id) || !inside(rectOf(room.key), n.x, n.y)) continue;
        seen.add(id);
        queue.push(n);
      }
    }
    if (open.some((c) => !seen.has(`${c.x},${c.y}`))) throw new Error(`a walkway in ${room.name} is cut off`);
  }

  // ---- Characters, quests, regions ---------------------------------------
  const characters = plan.party.map((c) => characterFor(c, unique(`char_${slug(c.name)}`)));
  const spells = new Map<string, WorldDefinition['spells'][number]>();
  for (const c of characters) for (const s of c.spells) spells.set(s, Object.values(SPELLS).find((sp) => sp.id === s)!);
  for (const item of items.values()) if (item.category === 'consumable' && item.effect.type === 'cast') {
    const id = item.effect.spellId;
    spells.set(id, Object.values(SPELLS).find((sp) => sp.id === id)!);
  }

  const target = (type: string, key: string): string => {
    if (type === 'reach_room') return roomId.get(key)!;
    if (type === 'defeat_encounter') return encounterId.get(key)!;
    if (type === 'open_chest') return chestId.get(key)!;
    return lootItem.get(key)!;
  };
  const quests: WorldDefinition['quests'] = plan.quests.map((q) => ({
    id: `quest_${q.key}`,
    title: q.title,
    description: q.description,
    kind: q.kind,
    completionText: q.completionText,
    objectives: q.objectives.map((o) => ({ id: o.key, description: o.text, type: o.type, targetId: target(o.type, o.target), optional: o.optional ?? false })),
  }));

  const environments = [...new Set(plan.rooms.map((r) => r.environment))];
  const regions = environments.map((env) => ({
    id: `region_${env}`,
    name: env === 'mine' ? 'The Old Workings' : 'The Crypt',
    description: env === 'mine' ? 'Timbered tunnels and rough-cut stone.' : 'Dressed stone, burial niches and bronze doors.',
    environment: env,
    roomIds: plan.rooms.filter((r) => r.environment === env).map((r) => roomId.get(r.key)!),
  }));

  const rooms: WorldDefinition['rooms'] = plan.rooms.map((room) => {
    const r = rectOf(room.key);
    return {
      id: roomId.get(room.key)!,
      regionId: `region_${room.environment}`,
      name: room.name,
      type: room.type,
      description: room.description,
      layout: { x: r.x, y: r.y, width: r.w, height: r.h },
      connections: layout.doors.flatMap((d, i) =>
        d.a === room.key ? [{ targetRoomId: roomId.get(d.b)!, doorId: doorIds[i] }] : d.b === room.key ? [{ targetRoomId: roomId.get(d.a)!, doorId: doorIds[i] }] : [],
      ),
      encounterIds: encounterIdsOf.get(room.key)!,
      objectIds: objectIdsOf.get(room.key)!,
    };
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    world: {
      id: `world_${slug(plan.title)}_${seed}`,
      name: plan.title,
      description: plan.description,
      theme: brief.atmosphere,
      difficulty: brief.difficulty,
      author: 'World Forge creator',
    },
    settings: {
      movementMode: 'grid',
      startRoomId: roomId.get(entrance.key)!,
      startCell,
      startFacing,
      startingPartyIds: characters.map((c) => c.id),
      startingQuestIds: quests.map((q) => q.id),
    },
    regions,
    rooms,
    doors,
    enemies: [...enemies.values()],
    encounters,
    objects,
    items: [...items.values()],
    characters,
    quests,
    spells: [...spells.values()],
    npcs: [],
    factions: [],
  };
}

function dist(a: Cell, b: Cell) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** The facing that looks most nearly from one cell toward another. */
function facingToward(from: Cell, to: Cell): Facing {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'east' : 'west';
  return dy > 0 ? 'south' : 'north';
}
