/**
 * The game simulation. Fixed 60 Hz steps, driven only by commands, with all
 * randomness drawn from the session's seeded generator. It knows nothing
 * about rendering, audio, React or the network.
 */
import {
  DIR_X,
  DIR_Y,
  TILE_DOORWAY,
  TILE_WALL,
  inBounds,
  roomAtCell,
  type CompiledDoor,
  type CompiledWorld,
} from '../world/compile';
import type { BoltSpellDef, EnemyAttackDef, EnemyDef, EquipSlot, HealSpellDef, ItemDef, SpellDef, WeaponAttackDef } from '../schema/world';
import { CLASSES } from './classes';
import { randomInt } from './rng';
import { CRITICAL_MULTIPLIER, criticalChance, damageBonus, levelForExperience, maxHealth, maxMana, maxStamina, experienceForLevel, modifier } from './stats';
import {
  BLOCK_DAMAGE_SHARE,
  BLOCK_STAMINA_COST,
  BUMP_TICKS,
  DODGE_COOLDOWN_TICKS,
  DODGE_INVULNERABLE_TICKS,
  DODGE_STAMINA_COST,
  DODGE_TICKS,
  ENEMY_ATTACK_POSE_TICKS,
  GUARD_BREAK_DAMAGE_SHARE,
  HIT_STOP_TICKS,
  INPUT_BUFFER_TICKS,
  MAX_STAINS,
  MOVE_TICKS,
  PARRY_STAGGER_TICKS,
  PARRY_WINDOW_TICKS,
  STAMINA_REGEN_DELAY,
  STAMINA_REGEN_INTERVAL,
  TURN_TICKS,
  type BumpReason,
  type Command,
  type EnemyState,
  AI_HEAL_THRESHOLD,
  MANA_REGEN_INTERVAL,
  type AttackKind,
  type GameEvent,
  type MoveDir,
  type PartyMember,
  type SessionState,
  type StainKind,
  type InjuryKind,
  INJURY_TICKS,
  ARM_INJURY_DAMAGE_SHARE,
  LEG_INJURY_MOVE_FACTOR,
  HEAD_INJURY_MANA_FACTOR,
} from './types';

const NEVER = -1000;

// ---------------------------------------------------------------------------
// Session creation and serialization
// ---------------------------------------------------------------------------

export function createSession(world: CompiledWorld, seed = 1): SessionState {
  const def = world.def;
  const members: PartyMember[] = def.settings.startingPartyIds.map((charId, index) => {
    const c = def.characters.find((ch) => ch.id === charId)!;
    const attributes = { ...(c.attributes ?? CLASSES[c.classId].defaults) };
    const health = maxHealth(c.classId, c.level, attributes);
    const stamina = maxStamina(c.classId, c.level, attributes);
    return {
      id: c.id,
      // The player starts as the first character; the party AI plays the rest.
      controller: index === 0 ? 'local' : 'ai',
      classId: c.classId,
      level: c.level,
      // A character who starts above level 1 starts with that level's experience.
      xp: experienceForLevel(c.level),
      attributes,
      equipment: { ...c.equipment },
      row: c.row ?? CLASSES[c.classId].row,
      spells: [...c.spells],
      mana: maxMana(c.classId, c.level, attributes),
      maxMana: maxMana(c.classId, c.level, attributes),
      // Companions do not all act on the same tick.
      aiReadyAt: 30 + index * 13,
      hp: health,
      maxHp: health,
      stamina,
      maxStamina: stamina,
      staminaRegenFrom: 0,
      blocking: false,
      blockStart: NEVER,
      action: { kind: 'idle' },
      injuries: [],
    };
  });

  const enemies: EnemyState[] = world.spawns.map((s) => {
    const e = def.enemies.find((en) => en.id === s.enemyId)!;
    return {
      id: s.instanceId,
      defId: e.id,
      x: s.x,
      y: s.y,
      prevX: s.x,
      prevY: s.y,
      moveStart: NEVER,
      facing: s.facing,
      hp: e.health,
      maxHp: e.health,
      ai: 'idle',
      aiStart: 0,
      aiEnd: 0,
      targetX: s.x,
      targetY: s.y,
      attackId: e.attacks[0].id,
      alerted: false,
      lastHitTick: NEVER,
      gore: false,
    };
  });

  const doorsOpen: Record<string, boolean> = {};
  for (const door of world.doors) doorsOpen[door.def.id] = door.def.kind === 'archway';

  const quests: SessionState['quests'] = {};
  for (const questId of def.settings.startingQuestIds) quests[questId] = { done: {}, completed: false };

  const startRoom = roomAtCell(world, world.start.x, world.start.y);
  const state: SessionState = {
    stateVersion: 9,
    worldId: def.world.id,
    tick: 0,
    rng: seed | 0,
    hitStop: 0,
    status: 'playing',
    party: {
      x: world.start.x,
      y: world.start.y,
      facing: world.start.facing,
      prevX: world.start.x,
      prevY: world.start.y,
      moveStart: NEVER,
      moveTicks: MOVE_TICKS,
      invulnerableUntil: NEVER,
      dodgeReadyAt: 0,
      prevFacing: world.start.facing,
      turnStart: NEVER,
      bumpStart: NEVER,
      bumpDir: 0,
      members,
    },
    buffered: null,
    enemies,
    doorsOpen,
    doorsUnlocked: {},
    wallDamage: {},
    chestsOpened: {},
    pickupsTaken: {},
    inventory: {},
    quests,
    encountersStarted: [],
    explored: new Array(world.width * world.height).fill(0),
    currentRoomId: startRoom ? startRoom.id : null,
    visitedRoomIds: startRoom ? [startRoom.id] : [],
    stains: [],
  };
  reveal(state, world);
  return state;
}

export function serializeSession(state: SessionState): string {
  return JSON.stringify(state);
}

export function deserializeSession(json: string): SessionState {
  // Older sessions are carried forward one version at a time.
  let state = JSON.parse(json) as { stateVersion: unknown } & Record<string, unknown>;
  if (state.stateVersion === 7) {
    // Version 7 had no breakable walls; nothing else changed.
    state = { ...state, stateVersion: 8, wallDamage: {} };
  }
  if (state.stateVersion === 8) {
    // Version 9 added blood on the floor, gore deaths and lasting injuries. Nothing existing changes.
    const old = state as unknown as Omit<SessionState, 'stateVersion'>;
    state = {
      ...state,
      stateVersion: 9,
      stains: [],
      enemies: old.enemies.map((e) => ({ ...e, gore: false })),
      party: { ...old.party, members: old.party.members.map((m) => ({ ...m, injuries: [] })) },
    };
  }
  if (state.stateVersion !== 9) throw new Error(`Unsupported session version ${String(state.stateVersion)}`);
  return state as unknown as SessionState;
}

/** A repeatable number from where and when something happened, so effects never spend the dice. */
function hashOf(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const n of parts) h = Math.imul(h ^ (n | 0), 0x01000193);
  return (h ^ (h >>> 15)) >>> 0;
}

/** Leave blood on the floor of a cell. A cell holds at most four stains; more makes the biggest one bigger. */
function bleed(state: SessionState, x: number, y: number, kind: StainKind, size: 1 | 2 | 3) {
  const here = state.stains.filter((st) => st.x === x && st.y === y);
  if (here.length >= 4) {
    const biggest = here.reduce((a, b) => (b.size > a.size ? b : a));
    biggest.size = Math.min(3, Math.max(biggest.size, size) + (size >= 2 ? 1 : 0)) as 1 | 2 | 3;
    return;
  }
  state.stains.push({ x, y, kind, size, v: hashOf(state.tick, x, y, state.stains.length) % 64, tick: state.tick });
  if (state.stains.length > MAX_STAINS) state.stains.shift();
}

// ---------------------------------------------------------------------------
// Injuries: lasting harm that heals only with time
// ---------------------------------------------------------------------------

export function hasInjury(member: PartyMember, kind: InjuryKind): boolean {
  return member.injuries.some((i) => i.kind === kind);
}

/** How long one walking step takes. A wounded leg slows everyone: the party moves as one. */
export function partyMoveTicks(state: SessionState): number {
  const limping = state.party.members.some((m) => m.hp > 0 && hasInjury(m, 'leg'));
  return limping ? Math.round(MOVE_TICKS * LEG_INJURY_MOVE_FACTOR) : MOVE_TICKS;
}

/** What a spell costs this character. A blow to the head makes the words hard to hold. */
export function manaCostFor(member: PartyMember, spell: SpellDef): number {
  return hasInjury(member, 'head') ? Math.ceil(spell.manaCost * HEAD_INJURY_MANA_FACTOR) : spell.manaCost;
}

const INJURY_WEIGHTS: [InjuryKind, number][] = [
  ['arm', 3],
  ['leg', 3],
  ['ribs', 2],
  ['head', 2],
];

/**
 * A hard blow may leave a lasting injury. The bigger the share of the
 * character's health it took, the likelier. Small blows never roll at all.
 */
function maybeInjure(state: SessionState, member: PartyMember, damage: number, events: GameEvent[]) {
  if (member.hp <= 0 || damage * 100 < member.maxHp * 15) return;
  const chance = Math.min(50, Math.round((damage / member.maxHp) * 120));
  if (randomInt(state, 1, 100) > chance) return;
  let pick = randomInt(state, 1, INJURY_WEIGHTS.reduce((n, [, w]) => n + w, 0));
  let kind: InjuryKind = 'arm';
  for (const [k, w] of INJURY_WEIGHTS) {
    if (pick <= w) {
      kind = k;
      break;
    }
    pick -= w;
  }
  const existing = member.injuries.find((i) => i.kind === kind);
  // The same wound struck again takes longer to heal.
  if (existing) existing.until = Math.max(existing.until, state.tick) + INJURY_TICKS / 2;
  else member.injuries.push({ kind, until: state.tick + INJURY_TICKS });
  events.push({ type: 'member.injured', actor: member.id, kind });
}

/** Injuries whose time has come close up. */
function healInjuries(state: SessionState, events: GameEvent[]) {
  for (const member of state.party.members) {
    if (!member.injuries.length) continue;
    const healed = member.injuries.filter((i) => state.tick >= i.until);
    if (!healed.length) continue;
    member.injuries = member.injuries.filter((i) => state.tick < i.until);
    for (const i of healed) if (member.hp > 0) events.push({ type: 'member.recovered', actor: member.id, kind: i.kind });
  }
}

function bloodOf(def: EnemyDef): StainKind {
  return def.blood === 'none' ? 'bone' : def.blood;
}

// ---------------------------------------------------------------------------
// Queries shared with the renderer and interface
// ---------------------------------------------------------------------------

export function isDoorOpenAt(state: SessionState, world: CompiledWorld, x: number, y: number): boolean {
  const door = world.doorAt.get(y * world.width + x);
  return door ? state.doorsOpen[door.def.id] === true : true;
}

/** Can anything stand in this cell, ignoring creatures? */
export function isOpenCell(state: SessionState, world: CompiledWorld, x: number, y: number): boolean {
  if (!inBounds(world, x, y)) return false;
  const i = y * world.width + x;
  const tile = world.tiles[i];
  if (tile === TILE_WALL) return false;
  if (tile === TILE_DOORWAY && !isDoorOpenAt(state, world, x, y)) return false;
  return world.blocked[i] === 0;
}

export function enemyAt(state: SessionState, x: number, y: number): EnemyState | null {
  for (const e of state.enemies) if (e.ai !== 'dead' && e.x === x && e.y === y) return e;
  return null;
}

/** Can sight pass through this cell? Props do not block sight. */
function seeThrough(state: SessionState, world: CompiledWorld, x: number, y: number): boolean {
  if (!inBounds(world, x, y)) return false;
  const tile = world.tiles[y * world.width + x];
  if (tile === TILE_WALL) return false;
  return tile !== TILE_DOORWAY || isDoorOpenAt(state, world, x, y);
}

export function hasLineOfSight(
  state: SessionState,
  world: CompiledWorld,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (x !== x1 || y !== y1) {
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
    if ((x !== x1 || y !== y1) && !seeThrough(state, world, x, y)) return false;
  }
  return true;
}

export function partyIsBusy(state: SessionState): boolean {
  const p = state.party;
  if (state.tick < p.moveStart + p.moveTicks) return true;
  if (state.tick < p.turnStart + TURN_TICKS) return true;
  // A bump counts as a very short action so a held key does not spam it.
  if (state.tick < p.bumpStart + BUMP_TICKS) return true;
  // Only a character the player is driving holds the party in place. Companions
  // played by the party AI swing and cast without stopping anyone moving.
  return p.members.some((m) => m.controller !== 'ai' && m.hp > 0 && m.action.kind !== 'idle' && state.tick < m.action.end);
}

/** The character the player is driving: the first living one not played by the AI. */
export function activeMember(state: SessionState): PartyMember {
  const members = state.party.members;
  return members.find((m) => m.controller !== 'ai' && m.hp > 0) ?? members.find((m) => m.hp > 0) ?? members[0];
}

/**
 * Whether a character stands where blows from ahead land and weapons reach:
 * in the front row, or in the back row once nobody in front is left standing.
 */
export function inFrontLine(state: SessionState, member: PartyMember): boolean {
  return member.row === 'front' || !state.party.members.some((m) => m.row === 'front' && m.hp > 0);
}

/** True while the guard is actually up: held, and not in the middle of a swing. */
export function isGuarding(member: PartyMember): boolean {
  return member.blocking && member.hp > 0 && member.action.kind === 'idle';
}

/** The cells an enemy's wound-up attack will hit. */
export function attackCells(enemy: EnemyState, attack: EnemyAttackDef): { x: number; y: number }[] {
  const cells = [{ x: enemy.targetX, y: enemy.targetY }];
  if (attack.pattern === 'sweep') {
    // The cells to the left and right of the target, as the enemy faces it.
    for (const side of [1, 3]) {
      const dir = (enemy.facing + side) % 4;
      cells.push({ x: enemy.targetX + DIR_X[dir], y: enemy.targetY + DIR_Y[dir] });
    }
  }
  return cells;
}

export function livingEnemies(state: SessionState): number {
  return state.enemies.filter((e) => e.ai !== 'dead').length;
}

// ---------------------------------------------------------------------------
// The step
// ---------------------------------------------------------------------------

/**
 * Advance the simulation by one tick. Commands that cannot run yet are held
 * briefly, so a key pressed slightly early still counts.
 */
export function step(state: SessionState, world: CompiledWorld, commands: readonly Command[]): GameEvent[] {
  const events: GameEvent[] = [];
  if (state.status !== 'playing') return events;

  for (const command of commands) {
    const member = state.party.members.find((m) => m.id === command.actor && m.hp > 0);
    if (!member) continue;
    if (command.type === 'control') {
      takeControl(state, member, events);
    } else if (command.type === 'row') {
      if (member.row !== command.row) {
        member.row = command.row;
        events.push({ type: 'member.row', actor: member.id, row: command.row });
      }
    } else if (command.type === 'equip' || command.type === 'unequip') {
      // Changing equipment is a pack action: it does not wait for a swing to finish.
      runCommand(state, world, command, events);
    } else if (member.controller === 'ai') {
      // Everything else must come from whoever is driving the character.
      continue;
    } else if (command.type === 'block') {
      // Raising or lowering the guard is never queued behind other actions.
      if (command.held && !member.blocking) member.blockStart = state.tick + 1;
      member.blocking = command.held;
    } else {
      state.buffered = { command, tick: state.tick };
    }
  }

  // Hit-stop: the world holds its breath for a few ticks after a solid blow.
  if (state.hitStop > 0) {
    state.hitStop--;
    return events;
  }

  state.tick++;

  if (state.buffered && state.tick - state.buffered.tick > INPUT_BUFFER_TICKS) state.buffered = null;
  if (state.buffered && !partyIsBusy(state)) {
    const { command } = state.buffered;
    state.buffered = null;
    runCommand(state, world, command, events);
  }

  resolvePartyAttacks(state, world, events);
  updatePartyAi(state, world, events);
  for (const enemy of state.enemies) updateEnemy(state, world, enemy, events);
  restoreStamina(state);
  healInjuries(state, events);
  trackQuests(state, world, events);

  return events;
}

// ---------------------------------------------------------------------------
// Party
// ---------------------------------------------------------------------------

function runCommand(state: SessionState, world: CompiledWorld, command: Command, events: GameEvent[]) {
  const p = state.party;
  switch (command.type) {
    case 'turn': {
      p.prevFacing = p.facing;
      p.facing = (p.facing + (command.dir === 'right' ? 1 : 3)) % 4;
      p.turnStart = state.tick;
      events.push({ type: 'party.turned', facing: p.facing });
      return;
    }
    case 'move': {
      const dir = (p.facing + MOVE_OFFSET[command.dir]) % 4;
      moveParty(state, world, dir, partyMoveTicks(state), events);
      return;
    }
    case 'dodge': {
      const member = p.members.find((m) => m.id === command.actor);
      if (!member || member.hp <= 0) return;
      if (state.tick < p.dodgeReadyAt) return;
      if (member.stamina < DODGE_STAMINA_COST) {
        events.push({ type: 'stamina.low', actor: member.id });
        return;
      }
      const dir = (p.facing + MOVE_OFFSET[command.dir ?? 'back']) % 4;
      if (!moveParty(state, world, dir, DODGE_TICKS, events)) return;
      spendStamina(state, member, DODGE_STAMINA_COST);
      p.invulnerableUntil = state.tick + DODGE_INVULNERABLE_TICKS;
      p.dodgeReadyAt = state.tick + DODGE_COOLDOWN_TICKS;
      events.push({ type: 'party.dodged', dir });
      return;
    }
    case 'attack': {
      const member = p.members.find((m) => m.id === command.actor);
      if (member && member.hp > 0) startAttack(state, world, member, command.kind ?? 'light', events);
      return;
    }
    case 'cast': {
      const member = p.members.find((m) => m.id === command.actor);
      if (member && member.hp > 0) castKnownSpell(state, world, member, command.spellId, events);
      return;
    }
    case 'block':
    case 'control':
    case 'row':
      return; // handled as soon as they arrive, in step()
    case 'interact': {
      const fx = p.x + DIR_X[p.facing];
      const fy = p.y + DIR_Y[p.facing];
      const front = inBounds(world, fx, fy) ? fy * world.width + fx : -1;

      const chest = world.chestAt.get(front);
      if (chest) {
        if (state.chestsOpened[chest.id]) {
          events.push({ type: 'interact.nothing' });
          return;
        }
        state.chestsOpened[chest.id] = true;
        events.push({ type: 'chest.opened', objectId: chest.id });
        for (const itemId of chest.contents) gainItem(state, world, itemId, 'chest', events);
        return;
      }

      const door = world.doorAt.get(front);
      if (!door || door.def.kind === 'archway') {
        events.push({ type: 'interact.nothing' });
        return;
      }
      if (door.def.kind === 'breakable') {
        // Searching a cracked wall tells you what it needs; only blows open it.
        events.push(state.doorsOpen[door.def.id] ? { type: 'interact.nothing' } : { type: 'wall.inspected', doorId: door.def.id });
        return;
      }
      if (door.def.kind === 'secret') {
        // A secret door opens once and stays open.
        if (state.doorsOpen[door.def.id]) events.push({ type: 'interact.nothing' });
        else {
          state.doorsOpen[door.def.id] = true;
          events.push({ type: 'secret.found', doorId: door.def.id });
        }
        return;
      }
      if (state.doorsOpen[door.def.id]) {
        // A door cannot close on something standing in it.
        if (enemyAt(state, fx, fy)) {
          events.push({ type: 'interact.nothing' });
          return;
        }
        state.doorsOpen[door.def.id] = false;
        events.push({ type: 'door.closed', doorId: door.def.id });
        return;
      }
      const lock = door.def.lock;
      if (lock && !state.doorsUnlocked[door.def.id]) {
        if (!state.inventory[lock.keyItemId]) {
          events.push({ type: 'door.locked', doorId: door.def.id });
          return;
        }
        state.doorsUnlocked[door.def.id] = true;
        events.push({ type: 'door.unlocked', doorId: door.def.id, itemId: lock.keyItemId });
      }
      state.doorsOpen[door.def.id] = true;
      events.push({ type: 'door.opened', doorId: door.def.id });
      return;
    }
    case 'equip': {
      const member = p.members.find((m) => m.id === command.actor);
      const item = world.def.items.find((it) => it.id === command.itemId);
      if (!member || member.hp <= 0) return;
      if (!item || !equipItem(state, member, item, false, events)) {
        events.push({ type: 'item.refused', itemId: command.itemId, reason: 'not_usable' });
      }
      return;
    }
    case 'unequip': {
      const member = p.members.find((m) => m.id === command.actor);
      const itemId = member?.equipment[command.slot];
      if (!member || member.hp <= 0 || !itemId) return;
      delete member.equipment[command.slot];
      state.inventory[itemId] = (state.inventory[itemId] ?? 0) + 1;
      events.push({ type: 'item.unequipped', actor: member.id, itemId, slot: command.slot });
      return;
    }
    case 'use': {
      const member = p.members.find((m) => m.id === command.actor);
      const item = world.def.items.find((it) => it.id === command.itemId);
      if (!member || member.hp <= 0) return;
      if (!item || item.category !== 'consumable') {
        events.push({ type: 'item.refused', itemId: command.itemId, reason: 'not_usable' });
        return;
      }
      if (!state.inventory[item.id]) {
        events.push({ type: 'item.refused', itemId: item.id, reason: 'none_left' });
        return;
      }
      const effect = item.effect;
      if (effect.type === 'cast') {
        // A scroll casts its spell once, for no mana. It is kept if it would do nothing.
        const spell = world.def.spells.find((sp) => sp.id === effect.spellId)!;
        if (!spellHasTarget(state, world, spell)) {
          events.push({ type: 'item.refused', itemId: item.id, reason: 'no_target' });
          return;
        }
        state.inventory[item.id] -= 1;
        if (state.inventory[item.id] === 0) delete state.inventory[item.id];
        startCast(state, member, spell, events, item.id);
        return;
      }
      if (member.hp >= member.maxHp) {
        events.push({ type: 'item.refused', itemId: item.id, reason: 'full_health' });
        return;
      }
      const healed = Math.min(effect.amount, member.maxHp - member.hp);
      member.hp += healed;
      state.inventory[item.id] -= 1;
      if (state.inventory[item.id] === 0) delete state.inventory[item.id];
      events.push({ type: 'item.used', itemId: item.id, actor: member.id, healed });
      return;
    }
  }
}

const MOVE_OFFSET: Record<MoveDir, number> = { forward: 0, right: 1, back: 2, left: 3 };

/** The player takes over a character; whoever they were driving goes to the party AI. */
function takeControl(state: SessionState, member: PartyMember, events: GameEvent[]) {
  if (member.controller !== 'ai') return;
  for (const other of state.party.members) {
    if (other.controller === 'local') {
      other.controller = 'ai';
      other.blocking = false;
      other.aiReadyAt = state.tick + CLASSES[other.classId].aiPace;
    }
  }
  member.controller = 'local';
  // Anything queued was meant for the previous character.
  state.buffered = null;
  events.push({ type: 'party.control', actor: member.id });
}

/** Begin a weapon swing. False if the character is out of reach or too tired. */
function startAttack(state: SessionState, world: CompiledWorld, member: PartyMember, kind: AttackKind, events: GameEvent[]): boolean {
  if (!inFrontLine(state, member)) {
    events.push({ type: 'attack.out_of_reach', actor: member.id });
    return false;
  }
  const attack = weaponOf(world, member)[kind];
  if (member.stamina < attack.staminaCost) {
    events.push({ type: 'stamina.low', actor: member.id });
    return false;
  }
  spendStamina(state, member, attack.staminaCost);
  member.action = {
    kind: 'attack',
    attack: kind,
    start: state.tick,
    hitTick: state.tick + attack.windupTicks,
    end: state.tick + attack.windupTicks + attack.recoveryTicks,
    resolved: false,
  };
  events.push({ type: 'attack.swing', actor: member.id, kind });
  return true;
}

/** The living member with the least health left, as a share, who is not at full health. */
function mostHurt(state: SessionState): PartyMember | null {
  let worst: PartyMember | null = null;
  for (const m of state.party.members) {
    if (m.hp <= 0 || m.hp >= m.maxHp) continue;
    if (!worst || m.hp / m.maxHp < worst.hp / worst.maxHp) worst = m;
  }
  return worst;
}

/** Would casting this spell right now do anything? */
export function spellHasTarget(state: SessionState, world: CompiledWorld, spell: SpellDef): boolean {
  return spell.shape === 'bolt' ? spellTarget(state, world, spell) !== null : mostHurt(state) !== null;
}

function startCast(state: SessionState, member: PartyMember, spell: SpellDef, events: GameEvent[], itemId?: string) {
  member.action = {
    kind: 'cast',
    spellId: spell.id,
    start: state.tick,
    hitTick: state.tick + spell.castTicks,
    end: state.tick + spell.castTicks + spell.recoveryTicks,
    resolved: false,
  };
  events.push(itemId ? { type: 'spell.cast', actor: member.id, spellId: spell.id, itemId } : { type: 'spell.cast', actor: member.id, spellId: spell.id });
}

/** Cast a spell the character knows, for mana. False if it could not be cast. */
function castKnownSpell(state: SessionState, world: CompiledWorld, member: PartyMember, spellId: string, events: GameEvent[]): boolean {
  const spell = member.spells.includes(spellId) ? world.def.spells.find((sp) => sp.id === spellId) : undefined;
  const refuse = (reason: 'unknown' | 'no_mana' | 'no_target') => {
    events.push({ type: 'spell.refused', actor: member.id, spellId, reason });
    return false;
  };
  if (!spell) return refuse('unknown');
  const cost = manaCostFor(member, spell);
  if (member.mana < cost) return refuse('no_mana');
  if (!spellHasTarget(state, world, spell)) return refuse('no_target');
  member.mana -= cost;
  startCast(state, member, spell, events);
  return true;
}

/** Step the party one cell in an absolute direction. False if something is in the way. */
function moveParty(state: SessionState, world: CompiledWorld, dir: number, ticks: number, events: GameEvent[]): boolean {
  const p = state.party;
  const nx = p.x + DIR_X[dir];
  const ny = p.y + DIR_Y[dir];
  const reason = blockReason(state, world, nx, ny);
  if (reason) {
    p.bumpStart = state.tick;
    p.bumpDir = dir;
    events.push({ type: 'party.bumped', reason });
    return false;
  }
  p.prevX = p.x;
  p.prevY = p.y;
  p.x = nx;
  p.y = ny;
  p.moveStart = state.tick;
  p.moveTicks = ticks;
  events.push({ type: 'party.moved', x: nx, y: ny });
  reveal(state, world);
  for (const pickup of world.pickups) {
    if (pickup.x !== nx || pickup.y !== ny || state.pickupsTaken[pickup.id]) continue;
    state.pickupsTaken[pickup.id] = true;
    gainItem(state, world, pickup.itemId, 'pickup', events);
  }
  const room = roomAtCell(world, nx, ny);
  if (room && room.id !== state.currentRoomId) {
    const firstVisit = !state.visitedRoomIds.includes(room.id);
    if (firstVisit) state.visitedRoomIds.push(room.id);
    state.currentRoomId = room.id;
    events.push({ type: 'room.entered', roomId: room.id, firstVisit });
  }
  return true;
}

function spendStamina(state: SessionState, member: PartyMember, amount: number) {
  member.stamina = Math.max(0, member.stamina - amount);
  member.staminaRegenFrom = state.tick + STAMINA_REGEN_DELAY;
}

/** Stamina returns steadily, but not while swinging or holding the guard up. */
function restoreStamina(state: SessionState) {
  if (state.tick % STAMINA_REGEN_INTERVAL !== 0) return;
  for (const member of state.party.members) {
    if (member.hp <= 0 || member.stamina >= member.maxStamina) continue;
    if (state.tick < member.staminaRegenFrom || member.blocking || member.action.kind !== 'idle') continue;
    // Cracked ribs: breath comes back at half the pace.
    if (hasInjury(member, 'ribs') && state.tick % (STAMINA_REGEN_INTERVAL * 2) !== 0) continue;
    member.stamina += 1;
  }
  if (state.tick % MANA_REGEN_INTERVAL !== 0) return;
  for (const member of state.party.members) {
    if (member.hp > 0 && member.mana < member.maxMana && member.action.kind === 'idle') member.mana += 1;
  }
}

function gainItem(state: SessionState, world: CompiledWorld, itemId: string, from: 'pickup' | 'chest', events: GameEvent[]) {
  state.inventory[itemId] = (state.inventory[itemId] ?? 0) + 1;
  events.push({ type: 'item.gained', itemId, from });
  // Armour for an empty slot is put straight on.
  const item = world.def.items.find((it) => it.id === itemId);
  if (item?.category !== 'armour') return;
  const living = state.party.members.filter((m) => m.hp > 0);
  const active = activeMember(state);
  const wearer = [active, ...living.filter((m) => m !== active)].find((m) => m.hp > 0 && !m.equipment[item.slot]);
  if (wearer) equipItem(state, wearer, item, true, events);
}

/** The slot an item goes in, or null if it cannot be worn or wielded. */
function slotFor(item: ItemDef): EquipSlot | null {
  if (item.category === 'weapon') return 'mainHand';
  if (item.category === 'armour') return item.slot;
  return null;
}

function equipItem(state: SessionState, member: PartyMember, item: ItemDef, auto: boolean, events: GameEvent[]) {
  const slot = slotFor(item);
  if (!slot || !state.inventory[item.id]) return false;
  const previous = member.equipment[slot];
  if (previous) state.inventory[previous] = (state.inventory[previous] ?? 0) + 1;
  state.inventory[item.id] -= 1;
  if (state.inventory[item.id] === 0) delete state.inventory[item.id];
  member.equipment[slot] = item.id;
  events.push({ type: 'item.equipped', actor: member.id, itemId: item.id, slot, auto });
  return true;
}

/** Bare hands, for a character with nothing in the main hand. */
const UNARMED: { light: WeaponAttackDef; heavy: WeaponAttackDef } = {
  light: { damage: { min: 1, max: 2 }, windupTicks: 5, recoveryTicks: 16, staminaCost: 3, impact: 1 },
  heavy: { damage: { min: 2, max: 4 }, windupTicks: 12, recoveryTicks: 24, staminaCost: 10, impact: 2 },
};

/** The total defence of everything a character wears. */
/** How a member's block works: the engine's usual numbers, or their shield's. */
export function guardOf(world: CompiledWorld, member: PartyMember): { damageShare: number; staminaCost: number; shieldId: string | null } {
  const item = world.def.items.find((it) => it.id === member.equipment.offHand);
  if (item?.category === 'armour' && item.block) return { ...item.block, shieldId: item.id };
  return { damageShare: BLOCK_DAMAGE_SHARE, staminaCost: BLOCK_STAMINA_COST, shieldId: null };
}

export function defenceOf(world: CompiledWorld, member: PartyMember): number {
  let total = 0;
  for (const itemId of Object.values(member.equipment)) {
    const item = world.def.items.find((it) => it.id === itemId);
    if (item?.category === 'armour') total += item.defence;
  }
  return total;
}

function blockReason(state: SessionState, world: CompiledWorld, x: number, y: number): BumpReason | null {
  if (!inBounds(world, x, y)) return 'wall';
  const i = y * world.width + x;
  if (world.tiles[i] === TILE_WALL) return 'wall';
  if (world.tiles[i] === TILE_DOORWAY && !isDoorOpenAt(state, world, x, y)) {
    // An undiscovered secret door feels exactly like the wall it pretends to be.
    const kind = world.doorAt.get(i)!.def.kind;
    return kind === 'secret' || kind === 'breakable' ? 'wall' : 'door';
  }
  if (world.blocked[i]) return 'object';
  if (enemyAt(state, x, y)) return 'enemy';
  return null;
}

/** The light and heavy attacks of whatever the character holds, or bare hands. */
function weaponOf(world: CompiledWorld, member: PartyMember): { light: WeaponAttackDef; heavy: WeaponAttackDef } {
  const item = world.def.items.find((it) => it.id === member.equipment.mainHand);
  return item?.category === 'weapon' ? item.weapon : UNARMED;
}

function resolvePartyAttacks(state: SessionState, world: CompiledWorld, events: GameEvent[]) {
  const p = state.party;
  for (const member of p.members) {
    const action = member.action;
    if (action.kind === 'cast') {
      if (!action.resolved && state.tick >= action.hitTick) {
        action.resolved = true;
        const spell = world.def.spells.find((sp) => sp.id === action.spellId)!;
        if (spell.shape === 'bolt') resolveSpell(state, world, member, spell, events);
        else resolveHeal(state, member, spell, events);
      }
      if (state.tick >= action.end) {
        member.action = { kind: 'idle' };
        if (member.blocking) member.blockStart = state.tick;
      }
      continue;
    }
    if (action.kind !== 'attack') continue;
    if (!action.resolved && state.tick >= action.hitTick) {
      action.resolved = true;
      const fx = p.x + DIR_X[p.facing];
      const fy = p.y + DIR_Y[p.facing];
      const enemy = enemyAt(state, fx, fy);
      if (enemy) {
        const attack = weaponOf(world, member)[action.attack];
        const def = enemyDef(world, enemy);
        const rolled = randomInt(state, attack.damage.min, attack.damage.max) + damageBonus(member.attributes);
        // A dazed fighter still rolls, so the dice fall the same, but cannot land a telling blow.
        const critical = randomInt(state, 1, 100) <= criticalChance(member.attributes) && !hasInjury(member, 'head');
        // Some classes hit harder when the enemy is reeling or recovering.
        const opening = enemy.ai === 'stagger' || enemy.ai === 'recover' ? CLASSES[member.classId].opportunist : 1;
        const grip = hasInjury(member, 'arm') ? ARM_INJURY_DAMAGE_SHARE : 1;
        const damage = Math.max(1, Math.round(rolled * (critical ? CRITICAL_MULTIPLIER : 1) * opening * grip) - def.defence);
        const heavy = attack.impact >= 3;
        enemy.hp = Math.max(0, enemy.hp - damage);
        enemy.lastHitTick = state.tick;
        if (!enemy.alerted) alertEnemy(state, world, enemy, events);
        const killed = enemy.hp === 0;
        // A heavy or critical killing blow tears the body apart.
        if (killed) enemy.gore = action.attack === 'heavy' || critical;
        bleed(state, enemy.x, enemy.y, bloodOf(def), killed ? 3 : heavy || critical ? 2 : 1);
        events.push({ type: 'attack.hit', actor: member.id, enemyId: enemy.id, damage, killed, kind: action.attack, critical });
        // The world only holds its breath for the player's own blows.
        if (member.controller !== 'ai') state.hitStop = heavy ? HIT_STOP_TICKS + 3 : HIT_STOP_TICKS;
        const staggerTicks = def.staggerTicks * (heavy ? 2 : 1);
        if (killed) {
          killEnemy(state, world, enemy, events);
        } else if (enemy.ai === 'telegraph') {
          // Only a blow at least as heavy as the enemy's poise breaks a wind-up.
          if (attack.impact >= def.poise) {
            setAi(state, enemy, 'stagger', staggerTicks);
            events.push({ type: 'enemy.interrupted', enemyId: enemy.id });
          }
        } else if (enemy.ai === 'idle' || enemy.ai === 'move') {
          // A blow interrupts an enemy that is not already committed to a swing.
          setAi(state, enemy, 'stagger', staggerTicks);
        } else if (enemy.ai === 'attack') {
          setAi(state, enemy, 'recover', currentAttack(def, enemy).recoverTicks);
        } else if (enemy.ai === 'recover' || enemy.ai === 'stagger') {
          // Never shorten a recovery: hitting an open enemy must not speed it up.
          enemy.aiEnd = Math.max(enemy.aiEnd, state.tick + staggerTicks);
        }
      } else if (breakableAt(state, world, fx, fy)) {
        strikeWall(state, member, breakableAt(state, world, fx, fy)!, action.attack === 'heavy', events);
      } else if (!inBounds(world, fx, fy) || world.tiles[fy * world.width + fx] === TILE_WALL || !isDoorOpenAt(state, world, fx, fy)) {
        events.push({ type: 'attack.clang', actor: member.id });
      } else {
        events.push({ type: 'attack.miss', actor: member.id });
      }
    }
    if (state.tick >= action.end) {
      member.action = { kind: 'idle' };
      // A guard held through the swing comes up now, and can parry from now.
      if (member.blocking) member.blockStart = state.tick;
    }
  }
}

/** The breakable wall still standing at a cell, if there is one. */
function breakableAt(state: SessionState, world: CompiledWorld, x: number, y: number): CompiledDoor | null {
  if (!inBounds(world, x, y)) return null;
  const door = world.doorAt.get(y * world.width + x);
  return door && door.def.kind === 'breakable' && !state.doorsOpen[door.def.id] ? door : null;
}

/** Heavy blows chip a breakable wall until it gives way; light ones bounce off. */
function strikeWall(state: SessionState, member: PartyMember, door: CompiledDoor, heavy: boolean, events: GameEvent[]) {
  const id = door.def.id;
  if (!heavy) {
    events.push({ type: 'wall.held', doorId: id, actor: member.id });
    return;
  }
  const taken = (state.wallDamage[id] ?? 0) + 1;
  state.wallDamage[id] = taken;
  if (member.controller !== 'ai') state.hitStop = HIT_STOP_TICKS + 3;
  const hitsLeft = (door.def.toughness ?? 3) - taken;
  if (hitsLeft > 0) {
    events.push({ type: 'wall.cracked', doorId: id, actor: member.id, hitsLeft });
    return;
  }
  state.doorsOpen[id] = true;
  events.push({ type: 'wall.broken', doorId: id, actor: member.id });
}

/** The first living enemy straight ahead within a spell's reach, if the way is clear. */
export function spellTarget(state: SessionState, world: CompiledWorld, spell: BoltSpellDef): EnemyState | null {
  const p = state.party;
  let x = p.x;
  let y = p.y;
  for (let i = 0; i < spell.range; i++) {
    x += DIR_X[p.facing];
    y += DIR_Y[p.facing];
    if (!inBounds(world, x, y) || world.tiles[y * world.width + x] === TILE_WALL || !isDoorOpenAt(state, world, x, y)) return null;
    const enemy = enemyAt(state, x, y);
    if (enemy) return enemy;
  }
  return null;
}

function resolveSpell(state: SessionState, world: CompiledWorld, member: PartyMember, spell: BoltSpellDef, events: GameEvent[]) {
  const enemy = spellTarget(state, world, spell);
  if (!enemy) {
    // The target moved out of the line while the words were being spoken.
    events.push({ type: 'spell.fizzled', actor: member.id, spellId: spell.id });
    return;
  }
  const def = enemyDef(world, enemy);
  // Magic ignores armour, and a keen mind sharpens it.
  const damage = Math.max(1, randomInt(state, spell.damage.min, spell.damage.max) + Math.max(0, modifier(member.attributes.intelligence)));
  const before = enemy.hp;
  enemy.hp = Math.max(0, enemy.hp - damage);
  enemy.lastHitTick = state.tick;
  if (!enemy.alerted) alertEnemy(state, world, enemy, events);
  const killed = enemy.hp === 0;
  // A spell that does twice what was needed leaves little behind.
  if (killed) enemy.gore = damage >= before * 2;
  bleed(state, enemy.x, enemy.y, bloodOf(def), killed ? 3 : 2);
  events.push({ type: 'spell.hit', actor: member.id, spellId: spell.id, enemyId: enemy.id, damage, killed });
  if (member.controller !== 'ai') state.hitStop = HIT_STOP_TICKS + 2;
  if (killed) killEnemy(state, world, enemy, events);
  else if (enemy.ai === 'telegraph') {
    if (spell.impact >= def.poise) {
      setAi(state, enemy, 'stagger', def.staggerTicks * 2);
      events.push({ type: 'enemy.interrupted', enemyId: enemy.id });
    }
  } else if (enemy.ai === 'idle' || enemy.ai === 'move') setAi(state, enemy, 'stagger', def.staggerTicks * 2);
  else if (enemy.ai === 'recover' || enemy.ai === 'stagger') enemy.aiEnd = Math.max(enemy.aiEnd, state.tick + def.staggerTicks * 2);
}

function resolveHeal(state: SessionState, member: PartyMember, spell: HealSpellDef, events: GameEvent[]) {
  const target = mostHurt(state);
  if (!target) {
    events.push({ type: 'spell.fizzled', actor: member.id, spellId: spell.id });
    return;
  }
  // Wisdom deepens a healing.
  const healed = Math.min(spell.amount + Math.max(0, modifier(member.attributes.wisdom)), target.maxHp - target.hp);
  target.hp += healed;
  events.push({ type: 'spell.healed', actor: member.id, spellId: spell.id, target: target.id, healed });
  // Healing magic eases the worst injury: it heals in half the time it had left.
  const worst = target.injuries.reduce<(typeof target.injuries)[number] | null>((a, b) => (!a || b.until > a.until ? b : a), null);
  if (worst) worst.until = state.tick + Math.floor((worst.until - state.tick) / 2);
}

// ---------------------------------------------------------------------------
// Party AI: simple, predictable rules for companions the player is not driving
// ---------------------------------------------------------------------------

function updatePartyAi(state: SessionState, world: CompiledWorld, events: GameEvent[]) {
  const p = state.party;
  for (const member of p.members) {
    if (member.controller !== 'ai' || member.hp <= 0 || member.action.kind !== 'idle' || state.tick < member.aiReadyAt) continue;
    const cls = CLASSES[member.classId];
    let acted = false;
    const quiet: GameEvent[] = []; // refusals a companion triggers are not worth reporting

    // 1. Heal a badly hurt companion, if this character can.
    const hurt = mostHurt(state);
    if (hurt && hurt.hp / hurt.maxHp <= AI_HEAL_THRESHOLD) {
      const heal = knownSpell(world, member, 'heal');
      if (heal && member.mana >= manaCostFor(member, heal)) acted = castKnownSpell(state, world, member, heal.id, events);
    }

    // 2. Strike with a bolt spell at whatever is ahead and aware of the party.
    if (!acted) {
      const bolt = knownSpell(world, member, 'bolt');
      if (bolt && bolt.shape === 'bolt' && member.mana >= manaCostFor(member, bolt)) {
        const target = spellTarget(state, world, bolt);
        if (target?.alerted) acted = castKnownSpell(state, world, member, bolt.id, events);
      }
    }

    // 3. Otherwise fight with a weapon, from the front line.
    if (!acted && inFrontLine(state, member)) {
      const enemy = enemyAt(state, p.x + DIR_X[p.facing], p.y + DIR_Y[p.facing]);
      // An opportunist waits for an opening; everyone else just engages.
      const opening = enemy && (enemy.ai === 'stagger' || enemy.ai === 'recover' || enemy.ai === 'attack');
      if (enemy && (cls.opportunist === 1 || opening)) acted = startAttack(state, world, member, 'light', quiet);
      if (acted) events.push(...quiet);
    }

    // After acting, rest for the class's pace; otherwise look again shortly.
    member.aiReadyAt = state.tick + (acted ? cls.aiPace : 6);
  }
}

function knownSpell(world: CompiledWorld, member: PartyMember, shape: SpellDef['shape']): SpellDef | undefined {
  for (const spellId of member.spells) {
    const spell = world.def.spells.find((sp) => sp.id === spellId);
    if (spell?.shape === shape) return spell;
  }
  return undefined;
}

function reveal(state: SessionState, world: CompiledWorld) {
  const { x, y } = state.party;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (inBounds(world, x + dx, y + dy)) state.explored[(y + dy) * world.width + (x + dx)] = 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------

function enemyDef(world: CompiledWorld, enemy: EnemyState): EnemyDef {
  return world.def.enemies.find((e) => e.id === enemy.defId)!;
}

function killEnemy(state: SessionState, world: CompiledWorld, enemy: EnemyState, events: GameEvent[]) {
  enemy.ai = 'dead';
  enemy.aiStart = state.tick;
  enemy.aiEnd = state.tick;
  events.push({ type: 'enemy.died', enemyId: enemy.id });
  awardExperience(state, enemyDef(world, enemy).xp, enemy.id, events);
  const encounterId = enemy.id.split('#')[0];
  const remaining = state.enemies.some((e) => e.ai !== 'dead' && e.id.split('#')[0] === encounterId);
  if (!remaining && world.def.encounters.some((enc) => enc.id === encounterId)) {
    events.push({ type: 'encounter.cleared', encounterId });
  }
}

/** Every living member earns the full amount. Levels are gained at once. */
function awardExperience(state: SessionState, amount: number, enemyId: string, events: GameEvent[]) {
  if (amount <= 0) return;
  events.push({ type: 'xp.gained', amount, enemyId });
  for (const member of state.party.members) {
    if (member.hp <= 0) continue;
    member.xp += amount;
    while (member.level < levelForExperience(member.xp)) {
      member.level += 1;
      // Each level sharpens what the class is best at.
      member.attributes[CLASSES[member.classId].primary] += 1;
      const health = maxHealth(member.classId, member.level, member.attributes);
      const stamina = maxStamina(member.classId, member.level, member.attributes);
      const healthGained = health - member.maxHp;
      const staminaGained = stamina - member.maxStamina;
      // The new health and stamina arrive filled, on top of what was left.
      member.maxHp = health;
      member.hp += healthGained;
      member.maxStamina = stamina;
      member.stamina += staminaGained;
      const mana = maxMana(member.classId, member.level, member.attributes);
      member.mana += mana - member.maxMana;
      member.maxMana = mana;
      events.push({ type: 'level.up', actor: member.id, level: member.level, healthGained, staminaGained });
    }
  }
}

const encounterOf = (enemy: EnemyState) => enemy.id.split('#')[0];

function alertEnemy(state: SessionState, world: CompiledWorld, enemy: EnemyState, events: GameEvent[]) {
  enemy.alerted = true;
  events.push({ type: 'enemy.alerted', enemyId: enemy.id });
  const encounterId = encounterOf(enemy);
  if (!state.encountersStarted.includes(encounterId) && world.def.encounters.some((enc) => enc.id === encounterId)) {
    state.encountersStarted.push(encounterId);
    events.push({ type: 'encounter.started', encounterId });
  }
}

function setAi(state: SessionState, enemy: EnemyState, ai: EnemyState['ai'], duration: number) {
  enemy.ai = ai;
  enemy.aiStart = state.tick;
  enemy.aiEnd = state.tick + duration;
}

function facingToward(fromX: number, fromY: number, toX: number, toY: number, fallback: number): number {
  for (let dir = 0; dir < 4; dir++) if (fromX + DIR_X[dir] === toX && fromY + DIR_Y[dir] === toY) return dir;
  return fallback;
}

function updateEnemy(state: SessionState, world: CompiledWorld, enemy: EnemyState, events: GameEvent[]) {
  if (enemy.ai === 'dead') return;
  const def = enemyDef(world, enemy);
  const p = state.party;

  switch (enemy.ai) {
    case 'move':
    case 'recover':
    case 'stagger':
      if (state.tick >= enemy.aiEnd) setAi(state, enemy, 'idle', 0);
      return;

    case 'telegraph': {
      if (state.tick < enemy.aiEnd) return;
      const attack = currentAttack(def, enemy);
      resolveEnemyAttack(state, world, enemy, attack, events);
      // A parry leaves the enemy reeling instead of following through.
      if (enemy.ai === 'telegraph') setAi(state, enemy, 'attack', ENEMY_ATTACK_POSE_TICKS);
      return;
    }

    case 'attack':
      if (state.tick >= enemy.aiEnd) setAi(state, enemy, 'recover', currentAttack(def, enemy).recoverTicks);
      return;

    case 'idle': {
      if (!enemy.alerted) {
        const dx = p.x - enemy.x;
        const dy = p.y - enemy.y;
        const near = dx * dx + dy * dy <= def.sightRange * def.sightRange;
        if (near && hasLineOfSight(state, world, enemy.x, enemy.y, p.x, p.y)) {
          alertEnemy(state, world, enemy, events);
        }
        return;
      }

      const adjacent = Math.abs(p.x - enemy.x) + Math.abs(p.y - enemy.y) === 1;
      if (adjacent) {
        enemy.facing = facingToward(enemy.x, enemy.y, p.x, p.y, enemy.facing);
        enemy.targetX = p.x;
        enemy.targetY = p.y;
        const attack = chooseAttack(state, def);
        enemy.attackId = attack.id;
        setAi(state, enemy, 'telegraph', attack.telegraphTicks);
        events.push({ type: 'enemy.telegraph', enemyId: enemy.id, attackId: attack.id });
        return;
      }

      const next = nextStepToward(state, world, enemy, p.x, p.y);
      if (next) {
        enemy.facing = facingToward(enemy.x, enemy.y, next.x, next.y, enemy.facing);
        enemy.prevX = enemy.x;
        enemy.prevY = enemy.y;
        enemy.x = next.x;
        enemy.y = next.y;
        enemy.moveStart = state.tick;
        setAi(state, enemy, 'move', def.moveTicks);
        events.push({ type: 'enemy.moved', enemyId: enemy.id });
      }
      return;
    }
  }
}

function currentAttack(def: EnemyDef, enemy: EnemyState): EnemyAttackDef {
  return def.attacks.find((a) => a.id === enemy.attackId) ?? def.attacks[0];
}

/** Pick one of the enemy's attacks by weight, using the session's seed. */
function chooseAttack(state: SessionState, def: EnemyDef): EnemyAttackDef {
  if (def.attacks.length === 1) return def.attacks[0];
  const total = def.attacks.reduce((sum, a) => sum + a.weight, 0);
  let roll = randomInt(state, 1, total);
  for (const attack of def.attacks) {
    roll -= attack.weight;
    if (roll <= 0) return attack;
  }
  return def.attacks[0];
}

/**
 * The wind-up is over and the blow lands on the cells it was aimed at. The
 * party can avoid it by not being there, by a dodge, by a parry, or soften
 * it with a block.
 */
function resolveEnemyAttack(state: SessionState, world: CompiledWorld, enemy: EnemyState, attack: EnemyAttackDef, events: GameEvent[]) {
  const p = state.party;
  const inReach = attackCells(enemy, attack).some((c) => c.x === p.x && c.y === p.y);
  if (!inReach) {
    events.push({ type: 'enemy.attack.miss', enemyId: enemy.id });
    return;
  }
  if (state.tick < p.invulnerableUntil) {
    events.push({ type: 'enemy.attack.dodged', enemyId: enemy.id });
    return;
  }
  const targets = attackTargets(state, enemy, attack);
  const facingEnemy = p.x + DIR_X[p.facing] === enemy.x && p.y + DIR_Y[p.facing] === enemy.y;

  for (const target of targets) {
    // Armour takes its defence off the blow before anything else, down to 1.
    const rolled = Math.max(1, randomInt(state, attack.damage.min, attack.damage.max) - defenceOf(world, target));
    let damage = rolled;

    if (attack.blockable && facingEnemy && isGuarding(target)) {
      if (state.tick - target.blockStart <= PARRY_WINDOW_TICKS) {
        // Guard raised at the last moment: the blow is turned aside for everyone.
        setAi(state, enemy, 'stagger', PARRY_STAGGER_TICKS);
        state.hitStop = HIT_STOP_TICKS + 2;
        events.push({ type: 'attack.parried', enemyId: enemy.id, actor: target.id });
        return;
      }
      const guard = guardOf(world, target);
      const shield = guard.shieldId ? { shieldId: guard.shieldId } : {};
      if (target.stamina >= guard.staminaCost) {
        // A shield's block can stop a blow outright; a bare guard always lets something through.
        damage = guard.shieldId ? Math.round(rolled * guard.damageShare) : Math.max(1, Math.ceil(rolled * guard.damageShare));
        spendStamina(state, target, guard.staminaCost);
        target.hp = Math.max(0, target.hp - damage);
        if (damage > 0) bleed(state, p.x, p.y, 'red', 1);
        events.push({ type: 'attack.blocked', enemyId: enemy.id, target: target.id, damage, ...shield });
      } else {
        // Too tired to hold the guard: it is knocked aside.
        damage = Math.max(1, Math.ceil(rolled * GUARD_BREAK_DAMAGE_SHARE));
        spendStamina(state, target, target.stamina);
        target.blocking = false;
        target.hp = Math.max(0, target.hp - damage);
        bleed(state, p.x, p.y, 'red', 1);
        events.push({ type: 'guard.broken', enemyId: enemy.id, target: target.id, damage, ...shield });
        maybeInjure(state, target, damage, events);
      }
    } else {
      target.hp = Math.max(0, target.hp - damage);
      bleed(state, p.x, p.y, 'red', damage >= target.maxHp * 0.25 ? 2 : 1);
      events.push({ type: 'enemy.attack.hit', enemyId: enemy.id, target: target.id, damage, attackId: attack.id });
      maybeInjure(state, target, damage, events);
    }
    if (target.hp === 0) {
      bleed(state, p.x, p.y, 'red', 3);
      memberFell(state, target, events);
    }
  }

  if (!p.members.some((m) => m.hp > 0)) {
    state.status = 'dead';
    events.push({ type: 'party.died' });
  }
}

/**
 * Who a blow lands on. From ahead it falls on the front row and from behind
 * on the back row; from the side it can find anyone. An ordinary blow picks
 * one of them; a sweep catches the whole row.
 */
function attackTargets(state: SessionState, enemy: EnemyState, attack: EnemyAttackDef): PartyMember[] {
  const p = state.party;
  const living = p.members.filter((m) => m.hp > 0);
  const ahead = p.x + DIR_X[p.facing] === enemy.x && p.y + DIR_Y[p.facing] === enemy.y;
  const behind = p.x - DIR_X[p.facing] === enemy.x && p.y - DIR_Y[p.facing] === enemy.y;
  let exposed = living;
  if (ahead || behind) {
    const row = ahead ? 'front' : 'back';
    const inRow = living.filter((m) => m.row === row);
    if (inRow.length) exposed = inRow;
  }
  if (attack.pattern === 'sweep' || exposed.length <= 1) return exposed;
  return [exposed[randomInt(state, 0, exposed.length - 1)]];
}

/** A character drops. If the player was driving them, the next one standing is taken over. */
function memberFell(state: SessionState, member: PartyMember, events: GameEvent[]) {
  member.blocking = false;
  member.action = { kind: 'idle' };
  const survivors = state.party.members.filter((m) => m.hp > 0);
  if (survivors.length === 0) return; // the party is dead; party.died says so
  events.push({ type: 'member.fell', actor: member.id });
  if (member.controller !== 'ai') {
    member.controller = 'ai';
    const next = survivors[0];
    next.controller = 'local';
    state.buffered = null;
    events.push({ type: 'party.control', actor: next.id });
  }
}

/** Breadth-first search for the first step of the shortest path to the goal. */
function nextStepToward(
  state: SessionState,
  world: CompiledWorld,
  enemy: EnemyState,
  goalX: number,
  goalY: number,
): { x: number; y: number } | null {
  const w = world.width;
  const start = enemy.y * w + enemy.x;
  const goal = goalY * w + goalX;
  const from = new Int32Array(w * world.height).fill(-1);
  from[start] = start;
  const queue = [start];
  while (queue.length) {
    const i = queue.shift()!;
    if (i === goal) break;
    const cx = i % w;
    const cy = (i - cx) / w;
    for (let dir = 0; dir < 4; dir++) {
      const nx = cx + DIR_X[dir];
      const ny = cy + DIR_Y[dir];
      const ni = ny * w + nx;
      if (!inBounds(world, nx, ny) || from[ni] !== -1) continue;
      if (ni !== goal) {
        if (!isOpenCell(state, world, nx, ny)) continue;
        const other = enemyAt(state, nx, ny);
        if (other && other !== enemy) continue;
      }
      from[ni] = i;
      queue.push(ni);
    }
  }
  if (from[goal] === -1) return null;
  let i = goal;
  while (from[i] !== start) i = from[i];
  if (i === goal) return null; // already adjacent; the caller attacks instead
  return { x: i % w, y: Math.floor(i / w) };
}

// ---------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------

/** Mark quest objectives that this tick's events have satisfied. */
function trackQuests(state: SessionState, world: CompiledWorld, events: GameEvent[]) {
  if (events.length === 0) return;
  const happened = events.slice();
  for (const quest of world.def.quests) {
    const progress = state.quests[quest.id];
    if (!progress || progress.completed) continue;
    for (const objective of quest.objectives) {
      if (progress.done[objective.id]) continue;
      const met = happened.some((e) => {
        switch (objective.type) {
          case 'collect_item':
            return e.type === 'item.gained' && e.itemId === objective.targetId;
          case 'defeat_encounter':
            return e.type === 'encounter.cleared' && e.encounterId === objective.targetId;
          case 'open_chest':
            return e.type === 'chest.opened' && e.objectId === objective.targetId;
          case 'reach_room':
            return e.type === 'room.entered' && e.roomId === objective.targetId;
        }
      });
      if (!met) continue;
      progress.done[objective.id] = true;
      events.push({ type: 'quest.objective', questId: quest.id, objectiveId: objective.id });
    }
    if (quest.objectives.every((o) => o.optional || progress.done[o.id])) {
      progress.completed = true;
      events.push({ type: 'quest.completed', questId: quest.id });
    }
  }
}
