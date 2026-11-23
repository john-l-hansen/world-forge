/**
 * The world layer: world time, the world's history (the event bus), and the
 * slow systems that change the world a minute or an hour at a time, whether
 * the party is there or not. Pure and deterministic, like the rest of the
 * simulation: it reads and writes session state and nothing else.
 */
import { roomAtCell, type CompiledWorld } from '../world/compile';
import { hasLineOfSight } from './sim';
import {
  MAX_CATCH_UP_MINUTES,
  MAX_HISTORY,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  type GameEvent,
  type SessionState,
  type WorldEvent,
  type WorldEventType,
} from './types';

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

export type DayPart = 'night' | 'dawn' | 'morning' | 'afternoon' | 'dusk';

export interface ClockReading {
  day: number;
  hour: number;
  minute: number;
  part: DayPart;
}

export function readClock(totalMinutes: number): ClockReading {
  const day = Math.floor(totalMinutes / MINUTES_PER_DAY) + 1;
  const inDay = ((totalMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour = Math.floor(inDay / 60);
  const part: DayPart = hour < 5 || hour >= 21 ? 'night' : hour < 7 ? 'dawn' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'dusk';
  return { day, hour, minute: inDay % 60, part };
}

/** "Day 2, 14:05, afternoon". */
export function formatClock(totalMinutes: number): string {
  const c = readClock(totalMinutes);
  return `Day ${c.day}, ${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}, ${c.part}`;
}

/** "3 days, 4 hours", "40 minutes". */
export function formatDuration(minutes: number): string {
  const days = Math.floor(minutes / MINUTES_PER_DAY);
  const hours = Math.floor((minutes % MINUTES_PER_DAY) / 60);
  const mins = minutes % 60;
  const part = (n: number, word: string) => (n ? `${n} ${word}${n === 1 ? '' : 's'}` : '');
  if (days) return [part(days, 'day'), part(hours, 'hour')].filter(Boolean).join(', ');
  if (hours) return [part(hours, 'hour'), part(mins, 'minute')].filter(Boolean).join(', ');
  return part(Math.max(1, mins), 'minute');
}

// ---------------------------------------------------------------------------
// The event bus
// ---------------------------------------------------------------------------

export interface WorldEventDraft {
  type: WorldEventType;
  actor?: string | null;
  target?: string | null;
  x: number;
  y: number;
  amount?: number;
  note?: string;
}

/**
 * A system of the world layer. It may listen to events as they are published
 * and may act on each world tick, given how many minutes the tick covers: one
 * in play, up to an hour at a time when time is skipped or caught up.
 */
interface WorldSystem {
  id: string;
  on?: Partial<Record<WorldEventType, (state: SessionState, world: CompiledWorld, event: WorldEvent) => void>>;
  tick?: (state: SessionState, world: CompiledWorld, elapsed: number, events: GameEvent[]) => void;
}

/** Enemy instances that can see a place: alive, in range, with a clear line. */
export function witnessesOf(state: SessionState, world: CompiledWorld, x: number, y: number, exclude: string | null): string[] {
  const out: string[] = [];
  for (const enemy of state.enemies) {
    if (enemy.ai === 'dead' || enemy.gone || enemy.id === exclude) continue;
    const def = world.def.enemies.find((d) => d.id === enemy.defId);
    if (!def) continue;
    const dx = enemy.x - x;
    const dy = enemy.y - y;
    if (dx * dx + dy * dy > def.sightRange * def.sightRange) continue;
    if (hasLineOfSight(state, world, enemy.x, enemy.y, x, y)) out.push(enemy.id);
  }
  return out;
}

/** Record an event in the world's history and hand it to every system that listens for it. */
export function publish(state: SessionState, world: CompiledWorld, draft: WorldEventDraft): WorldEvent {
  const event: WorldEvent = {
    id: state.nextEventId++,
    minute: state.clock.minute,
    type: draft.type,
    actor: draft.actor ?? null,
    target: draft.target ?? null,
    x: draft.x,
    y: draft.y,
    roomId: roomAtCell(world, draft.x, draft.y)?.id ?? null,
    witnesses: witnessesOf(state, world, draft.x, draft.y, draft.target ?? null),
  };
  if (draft.amount !== undefined) event.amount = draft.amount;
  if (draft.note !== undefined) event.note = draft.note;
  state.history.push(event);
  if (state.history.length > MAX_HISTORY) state.history.splice(0, state.history.length - MAX_HISTORY);
  for (const system of SYSTEMS) system.on?.[event.type]?.(state, world, event);
  return event;
}

/** Turn this step's notable outcomes into world history. */
export function recordStep(state: SessionState, world: CompiledWorld, events: readonly GameEvent[]) {
  const p = state.party;
  const at = (enemyId: string) => state.enemies.find((e) => e.id === enemyId) ?? p;
  for (const e of events) {
    switch (e.type) {
      case 'attack.hit':
      case 'spell.hit':
        if (e.killed) {
          const enemy = at(e.enemyId);
          publish(state, world, { type: 'enemy.slain', actor: e.actor, target: e.enemyId, x: enemy.x, y: enemy.y });
        }
        break;
      case 'member.fell':
        publish(state, world, { type: 'member.fell', actor: e.actor, x: p.x, y: p.y });
        break;
      case 'member.injured':
        publish(state, world, { type: 'member.injured', actor: e.actor, x: p.x, y: p.y, note: e.kind });
        break;
      case 'item.gained':
        publish(state, world, { type: 'item.taken', actor: activeId(state), target: e.itemId, x: p.x, y: p.y, note: e.from });
        break;
      case 'chest.opened':
        publish(state, world, { type: 'chest.opened', actor: activeId(state), target: e.objectId, x: p.x, y: p.y });
        break;
      case 'door.unlocked':
        publish(state, world, { type: 'door.unlocked', actor: activeId(state), target: e.doorId, x: p.x, y: p.y, note: e.itemId });
        break;
      case 'wall.broken':
        publish(state, world, { type: 'wall.broken', actor: e.actor, target: e.doorId, x: p.x, y: p.y });
        break;
      case 'secret.found':
        publish(state, world, { type: 'secret.found', actor: activeId(state), target: e.doorId, x: p.x, y: p.y });
        break;
      case 'quest.completed':
        publish(state, world, { type: 'quest.completed', actor: activeId(state), target: e.questId, x: p.x, y: p.y });
        break;
      case 'room.entered':
        if (e.firstVisit) publish(state, world, { type: 'place.discovered', actor: activeId(state), target: e.roomId, x: p.x, y: p.y });
        break;
      default:
        break;
    }
  }
}

function activeId(state: SessionState): string | null {
  return state.party.members.find((m) => m.controller === 'local')?.id ?? null;
}

// ---------------------------------------------------------------------------
// World ticks
// ---------------------------------------------------------------------------

/** Run the world layer forward by `elapsed` minutes in one coarse step. */
export function worldTick(state: SessionState, world: CompiledWorld, elapsed: number, events: GameEvent[]) {
  state.clock.minute += elapsed;
  for (const system of SYSTEMS) system.tick?.(state, world, elapsed, events);
}

/**
 * Time passing outside play: hour by hour, up to the catch-up limit. The party
 * stays where it was, out of harm's way; the world goes on around it.
 */
export function advanceWorld(state: SessionState, world: CompiledWorld, minutes: number, by: 'world' | 'dm', events: GameEvent[]) {
  const total = Math.max(0, Math.min(MAX_CATCH_UP_MINUTES, Math.floor(minutes)));
  if (total === 0) return;
  for (let left = total; left > 0; left -= MINUTES_PER_HOUR) worldTick(state, world, Math.min(MINUTES_PER_HOUR, left), events);
  publish(state, world, { type: 'time.passed', actor: by, x: state.party.x, y: state.party.y, amount: total });
  events.push({ type: 'time.passed', minutes: total, by });
}

/** Blood dries black after six hours and is gone after three days. */
export const BLOOD_DRIES_AFTER = 6 * MINUTES_PER_HOUR;
export const BLOOD_GONE_AFTER = 3 * MINUTES_PER_DAY;
/** Something drags the dead away after two days. */
export const BODIES_TAKEN_AFTER = 2 * MINUTES_PER_DAY;
/** Wounded creatures heal this share of their health for each hour they are left alone. */
const ENEMY_HEAL_PER_HOUR = 0.1;

/** Tell the log, once, about a change the world made on its own. */
function changed(state: SessionState, world: CompiledWorld, events: GameEvent[], draft: Omit<WorldEventDraft, 'x' | 'y'> & { x?: number; y?: number }) {
  const event = publish(state, world, { x: state.party.x, y: state.party.y, ...draft });
  events.push({ type: 'world.changed', event });
}

const SYSTEMS: WorldSystem[] = [
  {
    // The dead and what they spilled.
    id: 'remains',
    on: {
      'enemy.slain': (state, _world, event) => {
        const enemy = state.enemies.find((e) => e.id === event.target);
        if (enemy && enemy.diedAt === null) enemy.diedAt = event.minute;
      },
    },
    tick: (state, world, elapsed, events) => {
      const now = state.clock.minute;
      const before = now - elapsed;
      // Only a stretch of time worth noting gets a line; drying a stain at a time in play is not news.
      const dried = state.stains.filter((s) => s.minute + BLOOD_DRIES_AFTER > before && s.minute + BLOOD_DRIES_AFTER <= now).length;
      state.stains = state.stains.filter((s) => now - s.minute < BLOOD_GONE_AFTER);
      if (dried && elapsed >= MINUTES_PER_HOUR) changed(state, world, events, { type: 'blood.dried', actor: 'world', amount: dried });

      let taken = 0;
      for (const enemy of state.enemies) {
        if (enemy.ai !== 'dead' || enemy.gone || enemy.diedAt === null) continue;
        if (now - enemy.diedAt >= BODIES_TAKEN_AFTER) {
          enemy.gone = true;
          taken++;
        }
      }
      if (taken) changed(state, world, events, { type: 'bodies.taken', actor: 'world', amount: taken });
    },
  },
  {
    // Wounds close only with time. Rest restores breath and mana, and very slowly flesh.
    id: 'recovery',
    tick: (state, world, elapsed, events) => {
      const now = state.clock.minute;
      for (const member of state.party.members) {
        if (member.hp <= 0) continue;
        const healed = member.injuries.filter((i) => now >= i.healsAt);
        if (healed.length) {
          member.injuries = member.injuries.filter((i) => now < i.healsAt);
          for (const i of healed) {
            events.push({ type: 'member.recovered', actor: member.id, kind: i.kind });
            publish(state, world, { type: 'member.recovered', actor: member.id, x: state.party.x, y: state.party.y, note: i.kind });
          }
        }
        // One point of health an hour, and no more: the world does not mend you for free.
        const hours = Math.floor(now / MINUTES_PER_HOUR) - Math.floor((now - elapsed) / MINUTES_PER_HOUR);
        if (hours > 0) member.hp = Math.min(member.maxHp, member.hp + hours);
        if (elapsed >= MINUTES_PER_HOUR) {
          member.stamina = member.maxStamina;
          member.mana = member.maxMana;
        }
      }
    },
  },
  {
    // Creatures left alone lose the scent, go back to where they keep, and lick their wounds.
    id: 'wariness',
    tick: (state, world, elapsed, events) => {
      if (elapsed < MINUTES_PER_HOUR) return;
      let returned = 0;
      let tended = 0;
      const p = state.party;
      for (const enemy of state.enemies) {
        if (enemy.ai === 'dead') continue;
        const def = world.def.enemies.find((d) => d.id === enemy.defId);
        const home = world.spawns.find((s) => s.instanceId === enemy.id);
        if (!def || !home) continue;
        const dx = enemy.x - p.x;
        const dy = enemy.y - p.y;
        const seesParty = dx * dx + dy * dy <= def.sightRange * def.sightRange && hasLineOfSight(state, world, enemy.x, enemy.y, p.x, p.y);
        if (enemy.alerted && !seesParty) {
          const away = enemy.x !== home.x || enemy.y !== home.y;
          enemy.x = enemy.prevX = home.x;
          enemy.y = enemy.prevY = home.y;
          enemy.facing = home.facing;
          enemy.ai = 'idle';
          enemy.alerted = false;
          if (away) returned++;
        }
        if (enemy.hp < enemy.maxHp && !seesParty) {
          enemy.hp = Math.min(enemy.maxHp, enemy.hp + Math.max(1, Math.round(enemy.maxHp * ENEMY_HEAL_PER_HOUR * (elapsed / MINUTES_PER_HOUR))));
          if (enemy.hp === enemy.maxHp) tended++;
        }
      }
      if (returned) changed(state, world, events, { type: 'creatures.returned', actor: 'world', amount: returned });
      if (tended) changed(state, world, events, { type: 'wounds.tended', actor: 'world', amount: tended });
    },
  },
];
