/**
 * Save files. A save is one world: the definition it started from and the
 * state it has reached, written as plain JSON. Loading a save checks both
 * halves before anything is played. Nothing in a save is ever executed.
 */
import type { WorldDefinition } from '../schema/world';
import { validateWorld, type ValidationIssue } from '../schema/validate';
import { compileWorld, type CompiledWorld } from '../world/compile';
import { deserializeSession } from './sim';
import type { SessionState } from './types';

export const SAVE_VERSION = 1;

export interface SaveFile {
  saveVersion: typeof SAVE_VERSION;
  /** Marks the file as a World Forge save, so it is never mistaken for a world file. */
  kind: 'world-forge-save';
  /** When it was written, in milliseconds since 1970. Supplied by the caller: the engine has no clock. */
  savedAt: number;
  /** What the player sees in a list of saves. */
  label: string;
  /** The seed the session began with; a restart counts on from it. */
  seed: number;
  /** The world was made in the creator. */
  created: boolean;
  world: WorldDefinition;
  session: SessionState;
}

export type ReadSaveResult = { ok: true; save: SaveFile; world: CompiledWorld; session: SessionState } | { ok: false; issues: ValidationIssue[] };

export function makeSave(world: CompiledWorld, session: SessionState, opts: { seed: number; created: boolean; savedAt: number; label?: string }): SaveFile {
  return {
    saveVersion: SAVE_VERSION,
    kind: 'world-forge-save',
    savedAt: opts.savedAt,
    label: opts.label ?? world.def.world.name,
    seed: opts.seed,
    created: opts.created,
    world: world.def,
    // A deep copy, so later steps of the game never change a save already made.
    session: JSON.parse(JSON.stringify(session)) as SessionState,
  };
}

export function serializeSave(save: SaveFile): string {
  return JSON.stringify(save);
}

/** True when parsed JSON looks like a save rather than a world file. */
export function looksLikeSave(data: unknown): boolean {
  return typeof data === 'object' && data !== null && (data as { kind?: unknown }).kind === 'world-forge-save';
}

const issue = (_kind: string, message: string): ValidationIssue => ({ code: 'save', message });

/** Read a save from text: parse it, check the world, migrate and check the session. */
export function readSaveText(text: string): ReadSaveResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, issues: [issue('save.not_json', 'The save file is not valid JSON.')] };
  }
  return readSave(data);
}

export function readSave(data: unknown): ReadSaveResult {
  if (!looksLikeSave(data)) return { ok: false, issues: [issue('save.not_a_save', 'This is not a World Forge save file.')] };
  const raw = data as Partial<SaveFile> & { saveVersion?: unknown };
  if (raw.saveVersion !== SAVE_VERSION) return { ok: false, issues: [issue('save.version', `Save version ${String(raw.saveVersion)} is not supported.`)] };

  const checked = validateWorld(raw.world);
  if (!checked.ok) return { ok: false, issues: checked.issues };
  const world = compileWorld(checked.world);

  let session: SessionState;
  try {
    session = deserializeSession(JSON.stringify(raw.session));
  } catch (error) {
    return { ok: false, issues: [issue('save.session', error instanceof Error ? error.message : 'The saved game could not be read.')] };
  }
  const problems = checkSession(session, world);
  if (problems.length) return { ok: false, issues: problems };

  const save: SaveFile = {
    saveVersion: SAVE_VERSION,
    kind: 'world-forge-save',
    savedAt: typeof raw.savedAt === 'number' ? raw.savedAt : 0,
    label: typeof raw.label === 'string' ? raw.label.slice(0, 80) : world.def.world.name,
    seed: typeof raw.seed === 'number' && Number.isFinite(raw.seed) ? raw.seed | 0 : 1,
    created: raw.created === true,
    world: world.def,
    session,
  };
  return { ok: true, save, world, session };
}

/**
 * The session must fit the world it claims to belong to. These checks keep a
 * damaged or hand-edited save from putting the engine in a state it cannot reach.
 */
export function checkSession(session: SessionState, world: CompiledWorld): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const bad = (message: string) => out.push(issue('save.session', message));
  const def = world.def;
  const isInt = (n: unknown) => typeof n === 'number' && Number.isInteger(n);
  const inside = (x: unknown, y: unknown) => isInt(x) && isInt(y) && (x as number) >= 0 && (y as number) >= 0 && (x as number) < world.width && (y as number) < world.height;

  if (session.worldId !== def.world.id) bad(`The save belongs to world "${session.worldId}", not "${def.world.id}".`);
  if (!isInt(session.tick) || session.tick < 0) bad('The saved tick is not a whole number.');
  if (!isInt(session.rng)) bad('The saved random state is not a whole number.');
  if (session.status !== 'playing' && session.status !== 'dead') bad('The saved status is unknown.');
  if (!Array.isArray(session.explored) || session.explored.length !== world.width * world.height) bad('The explored map does not match the world size.');

  const party = session.party;
  if (!party || !inside(party.x, party.y)) bad('The party is outside the world.');
  if (!party || !Array.isArray(party.members) || party.members.length === 0) bad('The party has no members.');
  else {
    const ids = new Set(def.characters.map((c) => c.id));
    for (const m of party.members) {
      if (!ids.has(m.id)) bad(`Party member "${m.id}" is not a character in this world.`);
      if (!isInt(m.hp) || !isInt(m.maxHp) || m.maxHp <= 0) bad(`Party member "${m.id}" has impossible health.`);
    }
    if (party.members.filter((m) => m.controller === 'local').length !== 1) bad('The party must have exactly one character the player controls.');
  }

  const enemyDefs = new Set(def.enemies.map((e) => e.id));
  for (const e of session.enemies ?? []) {
    if (!enemyDefs.has(e.defId)) bad(`Enemy "${e.id}" is of unknown kind "${e.defId}".`);
    if (!inside(e.x, e.y)) bad(`Enemy "${e.id}" is outside the world.`);
  }
  const itemIds = new Set(def.items.map((i) => i.id));
  for (const [itemId, count] of Object.entries(session.inventory ?? {})) {
    if (!itemIds.has(itemId)) bad(`The pack holds unknown item "${itemId}".`);
    if (!isInt(count) || count < 0) bad(`The pack holds an impossible count of "${itemId}".`);
  }
  return out;
}
