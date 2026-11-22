/**
 * World validation. Shape is checked by Zod; this file checks meaning:
 * references resolve, geometry is consistent and every room can be reached.
 * A world that fails here must never reach the engine.
 */
import { EQUIP_SLOTS, SCHEMA_VERSION, WorldSchema, type RoomDef, type WorldDefinition } from './world';

export interface ValidationIssue {
  code:
    | 'not_an_object'
    | 'unsupported_version'
    | 'shape'
    | 'duplicate_id'
    | 'missing_reference'
    | 'geometry'
    | 'connection'
    | 'placement'
    | 'unreachable'
    | 'quest';
  message: string;
  path?: string;
}

export type ValidationResult =
  | { ok: true; world: WorldDefinition }
  | { ok: false; issues: ValidationIssue[] };

const inRoom = (room: RoomDef, x: number, y: number) =>
  x >= room.layout.x &&
  x < room.layout.x + room.layout.width &&
  y >= room.layout.y &&
  y < room.layout.y + room.layout.height;

/** True when (x, y) is orthogonally next to a floor cell of the room. */
const touchesRoom = (room: RoomDef, x: number, y: number) =>
  inRoom(room, x + 1, y) || inRoom(room, x - 1, y) || inRoom(room, x, y + 1) || inRoom(room, x, y - 1);

/**
 * Bring a world written for an older schema up to the current one. Only
 * known versions are migrated, one explicit step at a time; anything else is
 * returned untouched and then rejected by the version check.
 */
export function migrateWorld(input: unknown): unknown {
  if (typeof input !== 'object' || input === null) return input;
  let data = input as Record<string, unknown>;
  if (data.schemaVersion === '0.1.0') {
    // 0.2.0 added quests, locks, chests and pickups. All of them are optional,
    // so an older world only needs its new settings field and version stamp.
    const settings = (typeof data.settings === 'object' && data.settings !== null ? data.settings : {}) as Record<string, unknown>;
    data = { ...data, schemaVersion: '0.2.0', settings: { startingQuestIds: [], ...settings }, quests: data.quests ?? [] };
  }
  if (data.schemaVersion === '0.2.0') {
    // 0.3.0 split a weapon's attack into light and heavy, gave enemies a list
    // of attacks, and added stamina and poise (both have defaults).
    const items = Array.isArray(data.items) ? data.items : [];
    const enemies = Array.isArray(data.enemies) ? data.enemies : [];
    data = {
      ...data,
      schemaVersion: '0.3.0',
      items: items.map((raw) => {
        const item = raw as Record<string, any>;
        const w = item.weapon;
        if (item.category !== 'weapon' || !w || w.light) return item;
        const light = { damage: w.damage, windupTicks: w.windupTicks, recoveryTicks: w.recoveryTicks, staminaCost: 4, impact: 1 };
        const heavy = {
          damage: { min: Math.round(w.damage.min * 1.8) + 1, max: Math.round(w.damage.max * 1.8) },
          windupTicks: Math.round(w.windupTicks * 2.5),
          recoveryTicks: Math.round(w.recoveryTicks * 1.5),
          staminaCost: 14,
          impact: 3,
        };
        return { ...item, weapon: { light, heavy } };
      }),
      enemies: enemies.map((raw) => {
        const enemy = raw as Record<string, any>;
        if (enemy.attacks || !enemy.attack) return enemy;
        const { attack, damage, ...rest } = enemy;
        return { ...rest, attacks: [{ id: 'strike', name: 'strike', damage, telegraphTicks: attack.telegraphTicks, recoverTicks: attack.recoverTicks }] };
      }),
    };
  }
  if (data.schemaVersion === '0.3.0') {
    // 0.4.0 derives health and stamina from class, level and attributes, so
    // the fixed numbers on a character are dropped. Enemies gain an xp field
    // with a default.
    const characters = Array.isArray(data.characters) ? data.characters : [];
    data = {
      ...data,
      schemaVersion: '0.4.0',
      characters: characters.map((raw) => {
        const { maxHealth: _health, maxStamina: _stamina, ...rest } = raw as Record<string, unknown>;
        return rest;
      }),
    };
  }
  if (data.schemaVersion === '0.4.0') {
    // 0.5.0 added armour and more equipment slots. Nothing existing changes.
    data = { ...data, schemaVersion: '0.5.0' };
  }
  if (data.schemaVersion === '0.5.0') {
    // 0.6.0 added spells and scrolls. Nothing existing changes.
    data = { ...data, schemaVersion: '0.6.0', spells: data.spells ?? [] };
  }
  if (data.schemaVersion === '0.6.0') {
    // 0.7.0 added party rows, known spells and healing spells. Nothing existing changes.
    data = { ...data, schemaVersion: '0.7.0' };
  }
  if (data.schemaVersion === '0.7.0') {
    // 0.8.0 added the crypt environment, its enemies and props, side quests and alert lines. Nothing existing changes.
    data = { ...data, schemaVersion: '0.8.0' };
  }
  if (data.schemaVersion === '0.8.0') {
    // 0.9.0 added shields that change a block, and walls that break. Nothing existing changes.
    data = { ...data, schemaVersion: '0.9.0' };
  }
  return data;
}

export function validateWorld(input: unknown): ValidationResult {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, issues: [{ code: 'not_an_object', message: 'World data must be an object.' }] };
  }
  input = migrateWorld(input);
  const version = (input as { schemaVersion?: unknown }).schemaVersion;
  if (version !== SCHEMA_VERSION) {
    return {
      ok: false,
      issues: [
        {
          code: 'unsupported_version',
          message: `Unsupported schema version ${JSON.stringify(version)}. This engine reads ${SCHEMA_VERSION}.`,
        },
      ],
    };
  }

  const parsed = WorldSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({
        code: 'shape' as const,
        message: i.message,
        path: i.path.join('.'),
      })),
    };
  }

  const world = parsed.data;
  const issues: ValidationIssue[] = [];
  const add = (code: ValidationIssue['code'], message: string, path?: string) =>
    issues.push({ code, message, path });

  // ---- Unique IDs across the whole world -----------------------------------
  const seen = new Map<string, string>();
  const claim = (entityId: string, kind: string) => {
    const prior = seen.get(entityId);
    if (prior) add('duplicate_id', `ID "${entityId}" is used by both a ${prior} and a ${kind}.`);
    else seen.set(entityId, kind);
  };
  claim(world.world.id, 'world');
  world.regions.forEach((r) => claim(r.id, 'region'));
  world.rooms.forEach((r) => claim(r.id, 'room'));
  world.doors.forEach((d) => claim(d.id, 'door'));
  world.enemies.forEach((e) => claim(e.id, 'enemy'));
  world.encounters.forEach((e) => claim(e.id, 'encounter'));
  world.objects.forEach((o) => claim(o.id, 'object'));
  world.items.forEach((i) => claim(i.id, 'item'));
  world.characters.forEach((c) => claim(c.id, 'character'));
  world.quests.forEach((q) => claim(q.id, 'quest'));
  world.spells.forEach((sp) => claim(sp.id, 'spell'));
  for (const item of world.items) {
    if (item.category !== 'consumable' || item.effect.type !== 'cast') continue;
    const spellId = item.effect.spellId;
    if (!world.spells.some((sp) => sp.id === spellId)) add('missing_reference', `Item "${item.id}" casts missing spell "${spellId}".`);
  }

  const regions = new Map(world.regions.map((r) => [r.id, r]));
  const rooms = new Map(world.rooms.map((r) => [r.id, r]));
  const doors = new Map(world.doors.map((d) => [d.id, d]));
  const enemies = new Map(world.enemies.map((e) => [e.id, e]));
  const encounters = new Map(world.encounters.map((e) => [e.id, e]));
  const objects = new Map(world.objects.map((o) => [o.id, o]));
  const items = new Map(world.items.map((i) => [i.id, i]));
  const characters = new Map(world.characters.map((c) => [c.id, c]));

  // ---- Regions and rooms ----------------------------------------------------
  for (const region of world.regions) {
    for (const roomId of region.roomIds) {
      const room = rooms.get(roomId);
      if (!room) add('missing_reference', `Region "${region.id}" lists missing room "${roomId}".`);
      else if (room.regionId !== region.id)
        add('missing_reference', `Room "${roomId}" is listed in region "${region.id}" but belongs to "${room.regionId}".`);
    }
  }
  for (const room of world.rooms) {
    const region = regions.get(room.regionId);
    if (!region) add('missing_reference', `Room "${room.id}" refers to missing region "${room.regionId}".`);
    else if (!region.roomIds.includes(room.id))
      add('missing_reference', `Room "${room.id}" is not listed in its region "${region.id}".`);
  }

  // Rooms must not overlap or share a wall-less edge: at least one wall cell apart.
  for (let i = 0; i < world.rooms.length; i++) {
    for (let j = i + 1; j < world.rooms.length; j++) {
      const a = world.rooms[i].layout;
      const b = world.rooms[j].layout;
      const apart =
        a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y;
      // Diagonal-only contact is fine (a wall corner separates them).
      const cornerOnly =
        (a.x + a.width === b.x || b.x + b.width === a.x) && (a.y + a.height === b.y || b.y + b.height === a.y);
      if (!apart && !cornerOnly)
        add('geometry', `Rooms "${world.rooms[i].id}" and "${world.rooms[j].id}" overlap or touch without a wall between them.`);
    }
  }

  // ---- Doors and connections ------------------------------------------------
  const doorUsers = new Map<string, Set<string>>();
  for (const room of world.rooms) {
    for (const conn of room.connections) {
      const target = rooms.get(conn.targetRoomId);
      const door = doors.get(conn.doorId);
      if (!target) {
        add('missing_reference', `Room "${room.id}" connects to missing room "${conn.targetRoomId}".`);
        continue;
      }
      if (!door) {
        add('missing_reference', `Room "${room.id}" uses missing door "${conn.doorId}".`);
        continue;
      }
      if (target.id === room.id) add('connection', `Room "${room.id}" connects to itself.`);
      const back = target.connections.some((c) => c.targetRoomId === room.id && c.doorId === conn.doorId);
      if (!back)
        add('connection', `Room "${room.id}" connects to "${target.id}" through "${door.id}", but "${target.id}" does not connect back.`);
      if (!touchesRoom(room, door.cell.x, door.cell.y) || !touchesRoom(target, door.cell.x, door.cell.y))
        add('connection', `Door "${door.id}" at (${door.cell.x}, ${door.cell.y}) does not sit between "${room.id}" and "${target.id}".`);
      if (!doorUsers.has(door.id)) doorUsers.set(door.id, new Set());
      doorUsers.get(door.id)!.add(room.id).add(target.id);
    }
  }
  for (const door of world.doors) {
    const users = doorUsers.get(door.id);
    if (!users) add('connection', `Door "${door.id}" is not used by any room connection.`);
    else if (users.size !== 2) add('connection', `Door "${door.id}" must join exactly two rooms.`);
    if (world.rooms.some((r) => inRoom(r, door.cell.x, door.cell.y)))
      add('geometry', `Door "${door.id}" sits inside a room instead of in the wall between rooms.`);
  }
  for (const door of world.doors) {
    if (!door.lock) continue;
    if (door.kind !== 'door') add('connection', `Only a door can be locked, but "${door.id}" is a ${door.kind}.`);
    const key = world.items.find((i) => i.id === door.lock!.keyItemId);
    if (!key) add('missing_reference', `Door "${door.id}" needs missing key item "${door.lock.keyItemId}".`);
    else if (key.category !== 'key') add('missing_reference', `Door "${door.id}" is locked by "${key.id}", which is not a key.`);
  }
  const doorCells = new Set<string>();
  for (const door of world.doors) {
    const key = `${door.cell.x},${door.cell.y}`;
    if (doorCells.has(key)) add('geometry', `Two doors share the cell (${key}).`);
    doorCells.add(key);
  }

  for (const enemy of world.enemies) {
    const attackIds = new Set<string>();
    for (const attack of enemy.attacks) {
      if (attackIds.has(attack.id)) add('duplicate_id', `Enemy "${enemy.id}" has two attacks called "${attack.id}".`);
      attackIds.add(attack.id);
    }
  }

  // ---- Encounters -----------------------------------------------------------
  const occupied = new Map<string, string>();
  const occupy = (x: number, y: number, who: string) => {
    const key = `${x},${y}`;
    const prior = occupied.get(key);
    if (prior) add('placement', `"${who}" and "${prior}" are both placed at (${key}).`);
    else occupied.set(key, who);
  };

  for (const room of world.rooms) {
    for (const encId of room.encounterIds) {
      const enc = encounters.get(encId);
      if (!enc) add('missing_reference', `Room "${room.id}" lists missing encounter "${encId}".`);
      else if (enc.roomId !== room.id)
        add('missing_reference', `Encounter "${encId}" is listed by room "${room.id}" but is set in "${enc.roomId}".`);
    }
    for (const objId of room.objectIds) {
      const obj = objects.get(objId);
      if (!obj) add('missing_reference', `Room "${room.id}" lists missing object "${objId}".`);
      else if (obj.roomId !== room.id)
        add('missing_reference', `Object "${objId}" is listed by room "${room.id}" but is set in "${obj.roomId}".`);
    }
  }
  for (const enc of world.encounters) {
    const room = rooms.get(enc.roomId);
    if (!room) {
      add('missing_reference', `Encounter "${enc.id}" is set in missing room "${enc.roomId}".`);
      continue;
    }
    if (!room.encounterIds.includes(enc.id))
      add('missing_reference', `Encounter "${enc.id}" is not listed by its room "${room.id}".`);
    for (const p of enc.placements) {
      if (!enemies.has(p.enemyId))
        add('missing_reference', `Encounter "${enc.id}" places missing enemy "${p.enemyId}".`);
      if (!inRoom(room, p.cell.x, p.cell.y))
        add('placement', `Encounter "${enc.id}" places "${p.enemyId}" at (${p.cell.x}, ${p.cell.y}), outside room "${room.id}".`);
      occupy(p.cell.x, p.cell.y, `${enc.id}/${p.enemyId}`);
    }
  }

  // ---- Objects --------------------------------------------------------------
  for (const obj of world.objects) {
    const room = rooms.get(obj.roomId);
    if (!room) {
      add('missing_reference', `Object "${obj.id}" is set in missing room "${obj.roomId}".`);
      continue;
    }
    if (!room.objectIds.includes(obj.id))
      add('missing_reference', `Object "${obj.id}" is not listed by its room "${room.id}".`);
    if (!inRoom(room, obj.cell.x, obj.cell.y)) {
      add('placement', `Object "${obj.id}" at (${obj.cell.x}, ${obj.cell.y}) is outside room "${room.id}".`);
      continue;
    }
    if (obj.type === 'torch') {
      const dx = obj.wall === 'east' ? 1 : obj.wall === 'west' ? -1 : 0;
      const dy = obj.wall === 'south' ? 1 : obj.wall === 'north' ? -1 : 0;
      const nx = obj.cell.x + dx;
      const ny = obj.cell.y + dy;
      const open = world.rooms.some((r) => inRoom(r, nx, ny)) || doorCells.has(`${nx},${ny}`);
      if (open) add('placement', `Torch "${obj.id}" has no ${obj.wall} wall to hang on.`);
    } else if (obj.type === 'prop') {
      if (obj.blocking) occupy(obj.cell.x, obj.cell.y, obj.id);
    } else if (obj.type === 'chest') {
      occupy(obj.cell.x, obj.cell.y, obj.id);
      for (const itemId of obj.contents) {
        if (!items.has(itemId)) add('missing_reference', `Chest "${obj.id}" holds missing item "${itemId}".`);
      }
    } else {
      occupy(obj.cell.x, obj.cell.y, obj.id);
      if (!items.has(obj.itemId)) add('missing_reference', `Pickup "${obj.id}" is missing item "${obj.itemId}".`);
    }
  }

  // ---- Quests ---------------------------------------------------------------
  const quests = new Map(world.quests.map((q) => [q.id, q]));
  for (const questId of world.settings.startingQuestIds) {
    if (!quests.has(questId)) add('missing_reference', `Starting quests list missing quest "${questId}".`);
  }
  for (const quest of world.quests) {
    const objectiveIds = new Set<string>();
    if (!quest.objectives.some((o) => !o.optional)) add('quest', `Quest "${quest.id}" has no required objective, so it can never be finished.`);
    for (const objective of quest.objectives) {
      if (objectiveIds.has(objective.id)) add('duplicate_id', `Quest "${quest.id}" has two objectives called "${objective.id}".`);
      objectiveIds.add(objective.id);
      const t = objective.targetId;
      const where = `Quest "${quest.id}" objective "${objective.id}"`;
      if (objective.type === 'collect_item') {
        if (!items.has(t)) add('quest', `${where} asks for missing item "${t}".`);
        else {
          const obtainable = world.objects.some((o) => (o.type === 'pickup' && o.itemId === t) || (o.type === 'chest' && o.contents.includes(t)));
          if (!obtainable) add('quest', `${where} asks for "${t}", but nothing in the world gives that item.`);
        }
      } else if (objective.type === 'defeat_encounter') {
        if (!encounters.has(t)) add('quest', `${where} targets missing encounter "${t}".`);
      } else if (objective.type === 'open_chest') {
        if (objects.get(t)?.type !== 'chest') add('quest', `${where} targets "${t}", which is not a chest.`);
      } else if (!rooms.has(t)) {
        add('quest', `${where} targets missing room "${t}".`);
      }
    }
  }

  // ---- Characters, items and start position ---------------------------------
  for (const c of world.characters) {
    for (const spellId of c.spells) {
      if (!world.spells.some((sp) => sp.id === spellId)) add('missing_reference', `Character "${c.id}" knows missing spell "${spellId}".`);
    }
    for (const slot of EQUIP_SLOTS) {
      const itemId = c.equipment[slot];
      if (!itemId) continue;
      const item = items.get(itemId);
      if (!item) add('missing_reference', `Character "${c.id}" has missing item "${itemId}" in the ${slot} slot.`);
      else if (slot === 'mainHand' ? item.category !== 'weapon' : item.category !== 'armour' || item.slot !== slot)
        add('missing_reference', `Character "${c.id}" has "${item.id}" in the ${slot} slot, where it does not belong.`);
    }
  }
  for (const pid of world.settings.startingPartyIds) {
    if (!characters.has(pid)) add('missing_reference', `Starting party lists missing character "${pid}".`);
  }
  if (new Set(world.settings.startingPartyIds).size !== world.settings.startingPartyIds.length)
    add('duplicate_id', 'The starting party lists the same character more than once.');
  const startRoom = rooms.get(world.settings.startRoomId);
  if (!startRoom) {
    add('missing_reference', `Start room "${world.settings.startRoomId}" does not exist.`);
  } else {
    const { x, y } = world.settings.startCell;
    if (!inRoom(startRoom, x, y)) add('placement', `Start cell (${x}, ${y}) is outside the start room "${startRoom.id}".`);
    const blocker = occupied.get(`${x},${y}`);
    if (blocker) add('placement', `Start cell (${x}, ${y}) is occupied by "${blocker}".`);

    // ---- Reachability, respecting locks --------------------------------------
    // Walk the room graph from the start. A locked door only opens once its
    // key has been found in a room already reached, so a key shut behind its
    // own door leaves rooms unreachable.
    const reached = new Set<string>([startRoom.id]);
    const keys = new Set<string>();
    let grew = true;
    while (grew) {
      grew = false;
      for (const obj of world.objects) {
        if (!reached.has(obj.roomId)) continue;
        const found = obj.type === 'pickup' ? [obj.itemId] : obj.type === 'chest' ? obj.contents : [];
        for (const itemId of found) {
          if (!keys.has(itemId)) {
            keys.add(itemId);
            grew = true;
          }
        }
      }
      for (const room of world.rooms) {
        if (!reached.has(room.id)) continue;
        for (const conn of room.connections) {
          const door = doors.get(conn.doorId);
          if (!door || !rooms.has(conn.targetRoomId) || reached.has(conn.targetRoomId)) continue;
          if (door.lock && !keys.has(door.lock.keyItemId)) continue;
          reached.add(conn.targetRoomId);
          grew = true;
        }
      }
    }
    for (const room of world.rooms) {
      if (!reached.has(room.id)) add('unreachable', `Room "${room.id}" cannot be reached from the start room. Check its connections and where the keys are.`);
    }
  }

  return issues.length ? { ok: false, issues } : { ok: true, world };
}

/** Parse a JSON string into a validated world. Never throws. */
export function deserializeWorld(json: string): ValidationResult {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (err) {
    return { ok: false, issues: [{ code: 'not_an_object', message: `Not valid JSON: ${(err as Error).message}` }] };
  }
  return validateWorld(data);
}

export function serializeWorld(world: WorldDefinition): string {
  return JSON.stringify(world, null, 2);
}
