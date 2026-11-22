/**
 * Phase 3: the party. One body, front and back rows, a character the player
 * drives, and companions played by simple, predictable rules.
 */
import { describe, expect, it } from 'vitest';
import { activeMember, createSession, deserializeSession, inFrontLine, partyIsBusy, serializeSession, step } from '../src/engine/sim';
import type { Command, EnemyState, GameEvent, PartyMember, SessionState } from '../src/engine/types';
import { validateWorld } from '../src/schema/validate';
import type { CompiledWorld } from '../src/world/compile';
import { minesForParty } from '../src/worlds';
import { HERO, act, attack, face, fight, interact, loadMines, loadPartyMines, minesData, move, run, smash, turn, walkTo } from './helpers';

const ROGUE = 'char_rogue';
const MAGE = 'char_mage';
const CLERIC = 'char_cleric';
const types = (events: GameEvent[]) => events.map((e) => e.type);
const control = (actor: string): Command => ({ type: 'control', actor });
const cast = (actor: string, spellId: string): Command => ({ type: 'cast', actor, spellId });

function party(seed = 7) {
  const world = loadPartyMines();
  const state = createSession(world, seed);
  const by = (id: string) => state.party.members.find((m) => m.id === id)!;
  return { world, state, fighter: by(HERO), rogue: by(ROGUE), mage: by(MAGE), cleric: by(CLERIC), goblin: state.enemies[0] };
}

/** Put an enemy in a cell next to the party and make it aware. */
function place(enemy: EnemyState, x: number, y: number, extra: Partial<EnemyState> = {}) {
  Object.assign(enemy, { x, y, prevX: x, prevY: y, alerted: true, ...extra });
}

/** Stop every companion from acting, to test one thing at a time. */
function benchCompanions(state: SessionState) {
  for (const m of state.party.members) m.aiReadyAt = 10_000_000;
}

/** Run until the enemy's next blow has landed and collect who it struck. */
function struckBy(state: SessionState, world: CompiledWorld, enemy: EnemyState, blows: number): string[] {
  const struck: string[] = [];
  let count = 0;
  for (let i = 0; i < 20000 && count < blows && state.status === 'playing'; i++) {
    for (const m of state.party.members) if (m.hp > 0) m.hp = m.maxHp;
    for (const e of step(state, world, [])) {
      if (e.type === 'enemy.attack.hit') struck.push(e.target);
      if (e.type === 'enemy.attack.hit' || e.type === 'enemy.attack.miss') count++;
    }
  }
  void enemy;
  return struck;
}

describe('the party of four', () => {
  it('is a valid world built from the solo adventure', () => {
    const result = validateWorld(minesForParty(minesData()));
    expect(result.ok ? [] : result.issues).toEqual([]);
    if (!result.ok) return;
    expect(result.world.rooms).toHaveLength(6);
    expect(result.world.settings.startingPartyIds).toHaveLength(4);
    expect(result.world.encounters[0].placements).toHaveLength(2);
  });

  it('starts with the player driving the first character and the AI the rest', () => {
    const { state, fighter, rogue, mage, cleric } = party();
    expect(state.party.members.map((m) => m.controller)).toEqual(['local', 'ai', 'ai', 'ai']);
    expect(activeMember(state)).toBe(fighter);
    expect([fighter.row, rogue.row, mage.row, cleric.row]).toEqual(['front', 'front', 'back', 'back']);
    expect([fighter.maxMana, rogue.maxMana, mage.maxMana, cleric.maxMana]).toEqual([0, 0, 30, 25]);
    expect(mage.spells).toEqual(['spell_storm_bolt']);
  });

  it('gives a class its usual row when the world does not say', () => {
    const data = minesForParty(minesData()) as any;
    for (const c of data.characters) delete c.row;
    const result = validateWorld(data);
    if (!result.ok) throw new Error('invalid');
    expect(result.world.characters.map((c) => c.row)).toEqual([undefined, undefined, undefined, undefined]);
    const world = loadPartyMines();
    world.def.characters.forEach((c) => delete c.row);
    expect(createSession(world).party.members.map((m) => m.row)).toEqual(['front', 'front', 'back', 'front']);
  });

  it('a solo world is still a party of one', () => {
    const state = createSession(loadMines());
    expect(state.party.members).toHaveLength(1);
    expect(state.party.members[0]).toMatchObject({ controller: 'local', row: 'front', mana: 0, spells: [] });
  });
});

describe('taking control', () => {
  it('hands the previous character to the AI', () => {
    const { world, state, fighter, rogue } = party();
    const events = step(state, world, [control(ROGUE)]);
    expect(events).toContainEqual({ type: 'party.control', actor: ROGUE });
    expect([fighter.controller, rogue.controller]).toEqual(['ai', 'local']);
    expect(activeMember(state)).toBe(rogue);
    expect(types(step(state, world, [control(ROGUE)]))).toEqual([]);
  });

  it('only the character being driven takes orders', () => {
    const { world, state, rogue } = party();
    benchCompanions(state);
    act(state, world, { type: 'attack', actor: ROGUE }, 5);
    expect(rogue.action.kind).toBe('idle');
    step(state, world, [control(ROGUE)]);
    act(state, world, { type: 'attack', actor: HERO }, 5);
    expect(state.party.members[0].action.kind).toBe('idle');
    step(state, world, [{ type: 'attack', actor: ROGUE }]);
    step(state, world, []);
    expect(rogue.action.kind).toBe('attack');
  });

  it('drops the guard and anything queued for the previous character', () => {
    const { world, state, fighter } = party();
    benchCompanions(state);
    step(state, world, [{ type: 'block', actor: HERO, held: true }]);
    step(state, world, [attack()]);
    step(state, world, [move('forward')]);
    expect(state.buffered).not.toBeNull();
    step(state, world, [control(MAGE)]);
    expect(fighter.blocking).toBe(false);
    expect(state.buffered).toBeNull();
  });

  it('a companion mid-swing does not hold the party in place', () => {
    const { world, state, rogue } = party();
    benchCompanions(state);
    rogue.action = { kind: 'attack', attack: 'light', start: state.tick, hitTick: state.tick + 50, end: state.tick + 90, resolved: false };
    expect(partyIsBusy(state)).toBe(false);
    act(state, world, move('forward'), 20);
    expect([state.party.x, state.party.y]).toEqual([5, 13]);
  });

  it('survives a save and reload', () => {
    const { world, state } = party();
    step(state, world, [control(CLERIC)]);
    step(state, world, [{ type: 'row', actor: MAGE, row: 'front' }]);
    const restored = deserializeSession(serializeSession(state));
    expect(activeMember(restored).id).toBe(CLERIC);
    expect(restored.party.members.map((m) => m.row)).toEqual(['front', 'front', 'front', 'back']);
  });
});

describe('rows', () => {
  it('the back row cannot reach with a weapon', () => {
    const { world, state, mage, goblin } = party();
    benchCompanions(state);
    place(goblin, 5, 13, { ai: 'recover', aiEnd: 100000 });
    step(state, world, [control(MAGE)]);
    const events = act(state, world, { type: 'attack', actor: MAGE }, 10);
    expect(events).toContainEqual({ type: 'attack.out_of_reach', actor: MAGE });
    expect(mage.action.kind).toBe('idle');
    expect(mage.stamina).toBe(mage.maxStamina);
  });

  it('a character can be moved between rows', () => {
    const { world, state, mage, goblin } = party();
    benchCompanions(state);
    place(goblin, 5, 13, { ai: 'recover', aiEnd: 100000 });
    expect(step(state, world, [{ type: 'row', actor: MAGE, row: 'front' }])).toContainEqual({ type: 'member.row', actor: MAGE, row: 'front' });
    step(state, world, [control(MAGE)]);
    expect(types(act(state, world, { type: 'attack', actor: MAGE }, 12))).toContain('attack.hit');
    expect(mage.row).toBe('front');
  });

  it('blows from ahead fall on the front row only', () => {
    const { world, state, goblin } = party();
    benchCompanions(state);
    place(goblin, 5, 13, { facing: 2 });
    const struck = struckBy(state, world, goblin, 14);
    expect(new Set(struck)).toEqual(new Set([HERO, ROGUE]));
  });

  it('blows from behind fall on the back row', () => {
    const { world, state, goblin } = party();
    benchCompanions(state);
    place(goblin, 5, 15, { facing: 0 });
    const struck = struckBy(state, world, goblin, 14);
    expect(new Set(struck)).toEqual(new Set([MAGE, CLERIC]));
  });

  it('blows from the side can find anyone', () => {
    const { world, state, goblin } = party();
    benchCompanions(state);
    place(goblin, 4, 14, { facing: 1 });
    const struck = struckBy(state, world, goblin, 40);
    expect(new Set(struck)).toEqual(new Set([HERO, ROGUE, MAGE, CLERIC]));
  });

  it('with the front row down, the back row stands in the front line', () => {
    const { world, state, fighter, rogue, mage, goblin } = party();
    benchCompanions(state);
    expect(inFrontLine(state, mage)).toBe(false);
    fighter.hp = 0;
    rogue.hp = 0;
    expect(inFrontLine(state, mage)).toBe(true);
    place(goblin, 5, 13, { facing: 2 });
    const struck = struckBy(state, world, goblin, 12);
    expect(new Set(struck)).toEqual(new Set([MAGE, CLERIC]));
  });

  it('a sweep catches the whole front row', () => {
    const { world, state } = party();
    benchCompanions(state);
    const chief = state.enemies[2];
    place(chief, 5, 13, { facing: 2, ai: 'telegraph', attackId: 'sweep', aiStart: 0, aiEnd: 20, targetX: 5, targetY: 14 });
    const events = run(state, world, 24);
    const hit = events.filter((e): e is Extract<GameEvent, { type: 'enemy.attack.hit' }> => e.type === 'enemy.attack.hit');
    expect(hit.map((e) => e.target).sort()).toEqual([HERO, ROGUE].sort());
  });

  it('a parry by the character in front turns a blow aside for everyone', () => {
    const { world, state, goblin, fighter, rogue } = party();
    benchCompanions(state);
    // Make sure the blow is aimed at the fighter by leaving him alone in front.
    rogue.row = 'back';
    place(goblin, 5, 13, { facing: 2, ai: 'telegraph', aiStart: 0, aiEnd: 30, targetX: 5, targetY: 14 });
    run(state, world, 24);
    const events = [...step(state, world, [{ type: 'block', actor: HERO, held: true }]), ...run(state, world, 10)];
    expect(types(events)).toContain('attack.parried');
    expect(fighter.hp).toBe(fighter.maxHp);
  });
});

describe('falling in battle', () => {
  it('when the driven character falls, the next one standing is taken over', () => {
    const { world, state, fighter, rogue, goblin } = party();
    benchCompanions(state);
    rogue.row = 'back';
    fighter.hp = 1;
    place(goblin, 5, 13, { facing: 2 });
    const events: GameEvent[] = [];
    for (let i = 0; i < 300 && fighter.hp > 0; i++) events.push(...step(state, world, []));
    expect(events).toContainEqual({ type: 'member.fell', actor: HERO });
    expect(events).toContainEqual({ type: 'party.control', actor: ROGUE });
    expect(state.status).toBe('playing');
    expect(activeMember(state)).toBe(rogue);
    expect(fighter.controller).toBe('ai');
  });

  it('the party is lost only when everyone has fallen', () => {
    const { world, state, goblin } = party();
    benchCompanions(state);
    place(goblin, 5, 13, { facing: 2 });
    world.def.enemies[0].attacks[0].damage = { min: 200, max: 200 };
    const events: GameEvent[] = [];
    for (let i = 0; i < 4000 && state.status === 'playing'; i++) events.push(...step(state, world, []));
    expect(types(events).filter((t) => t === 'member.fell')).toHaveLength(3);
    expect(types(events).filter((t) => t === 'party.died')).toHaveLength(1);
    expect(state.status).toBe('dead');
  });

  it('the fallen earn no experience and take no orders', () => {
    const { world, state, fighter, mage, goblin } = party();
    benchCompanions(state);
    mage.hp = 0;
    place(goblin, 5, 13, { ai: 'recover', aiEnd: 100000, hp: 1 });
    act(state, world, attack(), 10);
    expect(fighter.xp).toBe(40);
    expect(mage.xp).toBe(0);
    expect(types(step(state, world, [control(MAGE)]))).toEqual([]);
  });
});

describe('mana and casting', () => {
  it('a caster spends mana to cast a spell they know', () => {
    const { world, state, mage, goblin } = party();
    benchCompanions(state);
    place(goblin, 5, 12, { ai: 'recover', aiEnd: 100000 });
    step(state, world, [control(MAGE)]);
    const events = [...step(state, world, [cast(MAGE, 'spell_storm_bolt')]), ...run(state, world, 24)];
    expect(types(events)).toEqual(expect.arrayContaining(['spell.cast', 'spell.hit']));
    expect(mage.mana).toBe(22);
    const hit = events.find((e) => e.type === 'spell.hit');
    // 14 to 20, plus 3 for the mage's intelligence.
    expect(hit?.type === 'spell.hit' && hit.damage).toBeGreaterThanOrEqual(17);
  });

  it('is refused without the mana, the knowledge or a target', () => {
    const { world, state, mage, cleric, goblin } = party();
    benchCompanions(state);
    step(state, world, [control(MAGE)]);
    expect(act(state, world, cast(MAGE, 'spell_storm_bolt'), 3)).toContainEqual({ type: 'spell.refused', actor: MAGE, spellId: 'spell_storm_bolt', reason: 'no_target' });
    expect(act(state, world, cast(MAGE, 'spell_mend'), 3)).toContainEqual({ type: 'spell.refused', actor: MAGE, spellId: 'spell_mend', reason: 'unknown' });
    place(goblin, 5, 12, { ai: 'recover', aiEnd: 100000 });
    mage.mana = 3;
    expect(act(state, world, cast(MAGE, 'spell_storm_bolt'), 3)).toContainEqual({ type: 'spell.refused', actor: MAGE, spellId: 'spell_storm_bolt', reason: 'no_mana' });
    expect(mage.mana).toBe(3);
    step(state, world, [control(CLERIC)]);
    expect(act(state, world, cast(CLERIC, 'spell_mend'), 3)).toContainEqual({ type: 'spell.refused', actor: CLERIC, spellId: 'spell_mend', reason: 'no_target' });
    expect(cleric.mana).toBe(25);
  });

  it('mana returns slowly', () => {
    const { world, state, mage } = party();
    benchCompanions(state);
    mage.mana = 0;
    run(state, world, 450);
    expect(mage.mana).toBe(10);
    run(state, world, 5000);
    expect(mage.mana).toBe(30);
  });

  it('a healing spell mends whoever is hurt worst', () => {
    const { world, state, fighter, rogue, cleric } = party();
    benchCompanions(state);
    fighter.hp = 30;
    rogue.hp = 10;
    step(state, world, [control(CLERIC)]);
    const events = [...step(state, world, [cast(CLERIC, 'spell_mend')]), ...run(state, world, 30)];
    // 14, plus 2 for the cleric's wisdom.
    expect(events).toContainEqual({ type: 'spell.healed', actor: CLERIC, spellId: 'spell_mend', target: ROGUE, healed: 16 });
    expect(rogue.hp).toBe(26);
    expect(fighter.hp).toBe(30);
    expect(cleric.mana).toBe(18);
  });

  it('never heals past full health', () => {
    const { world, state, fighter } = party();
    benchCompanions(state);
    fighter.hp = fighter.maxHp - 5;
    step(state, world, [control(CLERIC)]);
    const events = [...step(state, world, [cast(CLERIC, 'spell_mend')]), ...run(state, world, 30)];
    expect(events).toContainEqual({ type: 'spell.healed', actor: CLERIC, spellId: 'spell_mend', target: HERO, healed: 5 });
    expect(fighter.hp).toBe(fighter.maxHp);
  });

  it('levels raise a caster\'s mana', () => {
    const { world, state, mage, goblin } = party();
    benchCompanions(state);
    place(goblin, 5, 13, { ai: 'recover', aiEnd: 100000, hp: 1 });
    mage.mana = 10;
    act(state, world, attack(), 10);
    expect(mage).toMatchObject({ level: 2, maxMana: 36, mana: 16 });
  });

  it('rejects a character who knows a spell that does not exist', () => {
    const data = minesForParty(minesData()) as any;
    data.characters[2].spells = ['spell_wish'];
    const result = validateWorld(data);
    expect(result.ok ? [] : result.issues.map((i) => i.code)).toContain('missing_reference');
  });
});

describe('party AI', () => {
  /** The player drives the mage so the other three are all on the AI. */
  function companions() {
    const p = party();
    step(p.state, p.world, [control(MAGE)]);
    p.mage.aiReadyAt = 10_000_000;
    return p;
  }
  const swingsBy = (events: GameEvent[], actor: string) => events.filter((e) => e.type === 'attack.swing' && e.actor === actor).length;

  it('does nothing when there is nothing to fight and nobody is hurt', () => {
    const { world, state } = companions();
    expect(types(run(state, world, 600))).toEqual([]);
  });

  it('the fighter engages whatever stands in front', () => {
    const { world, state, goblin } = companions();
    place(goblin, 5, 13, { ai: 'idle', hp: 100000, maxHp: 100000 });
    world.def.enemies[0].attacks[0].damage = { min: 0, max: 0 };
    const events = run(state, world, 600);
    expect(swingsBy(events, HERO)).toBeGreaterThanOrEqual(6);
    expect(events.some((e) => e.type === 'attack.hit' && e.actor === HERO)).toBe(true);
  });

  it('the rogue waits for an opening, then strikes harder', () => {
    const { world, state, goblin } = companions();
    state.party.members[0].aiReadyAt = 10_000_000;
    place(goblin, 5, 13, { ai: 'telegraph', aiStart: 0, aiEnd: 100000, targetX: 0, targetY: 0, hp: 100000, maxHp: 100000 });
    expect(swingsBy(run(state, world, 300), ROGUE)).toBe(0);
    Object.assign(goblin, { ai: 'recover', aiEnd: 100000 });
    const events = run(state, world, 300);
    expect(swingsBy(events, ROGUE)).toBeGreaterThanOrEqual(4);
    const hits = events.filter((e): e is Extract<GameEvent, { type: 'attack.hit' }> => e.type === 'attack.hit' && e.actor === ROGUE && !e.critical);
    // Dagger 2 to 4, plus 0 for strength, half again against an open enemy.
    for (const h of hits) expect([3, 5, 6]).toContain(h.damage);
  });

  it('the mage casts at an enemy ahead while the mana lasts', () => {
    const p = party();
    const { world, state, mage, goblin } = p;
    for (const m of state.party.members) if (m !== mage) m.aiReadyAt = 10_000_000;
    place(goblin, 5, 11, { ai: 'recover', aiEnd: 100000, hp: 100000, maxHp: 100000 });
    // 30 mana pays for three bolts at 8 each; after that she must wait for it to return.
    const events = run(state, world, 260);
    const casts = events.filter((e) => e.type === 'spell.cast' && e.actor === MAGE).length;
    expect(casts).toBe(3);
    expect(mage.mana).toBeLessThan(8);
    expect(types(events)).not.toContain('spell.refused');
  });

  it('the mage holds fire at an enemy that has not noticed the party', () => {
    const { world, state, mage, goblin } = party();
    for (const m of state.party.members) if (m !== mage) m.aiReadyAt = 10_000_000;
    Object.assign(goblin, { x: 5, y: 11, prevX: 5, prevY: 11, alerted: false, ai: 'recover', aiEnd: 100000 });
    expect(types(run(state, world, 300))).toEqual([]);
  });

  it('the cleric heals a companion who is badly hurt, and not one who is scratched', () => {
    const { world, state, fighter, cleric } = party();
    for (const m of state.party.members) if (m !== cleric) m.aiReadyAt = 10_000_000;
    fighter.hp = fighter.maxHp - 6;
    expect(types(run(state, world, 300))).toEqual([]);
    fighter.hp = 12;
    const events = run(state, world, 200);
    expect(events.some((e) => e.type === 'spell.healed' && e.actor === CLERIC && e.target === HERO)).toBe(true);
    expect(fighter.hp).toBeGreaterThan(12);
  });

  it('the cleric fights from the front row when nobody needs healing', () => {
    const { world, state, cleric, goblin } = party();
    for (const m of state.party.members) if (m !== cleric) m.aiReadyAt = 10_000_000;
    place(goblin, 5, 13, { ai: 'recover', aiEnd: 100000, hp: 100000, maxHp: 100000 });
    expect(swingsBy(run(state, world, 300), CLERIC)).toBe(0);
    step(state, world, [{ type: 'row', actor: CLERIC, row: 'front' }]);
    expect(swingsBy(run(state, world, 300), CLERIC)).toBeGreaterThanOrEqual(3);
  });

  it('never moves the party or opens doors by itself', () => {
    const { world, state } = party();
    const before = [state.party.x, state.party.y, state.party.facing];
    place(state.enemies[0], 5, 10, { ai: 'recover', aiEnd: 100000 });
    run(state, world, 900);
    expect([state.party.x, state.party.y, state.party.facing]).toEqual(before);
    expect(state.doorsOpen.door_tunnel_hall).toBe(false);
  });
});

describe('the whole adventure with a party', () => {
  function playThrough(seed: number) {
    const world = loadPartyMines();
    const state = createSession(world, seed);
    const use = (dir: number) => {
      face(state, world, dir);
      act(state, world, interact(), 4);
    };
    walkTo(state, world, 5, 9);
    face(state, world, 1);
    smash(state, world);
    walkTo(state, world, 8, 9);
    use(2);
    walkTo(state, world, 5, 7);
    use(0);
    fight(state, world, state.enemies[0]);
    fight(state, world, state.enemies[1]);
    if (state.status === 'playing') {
      walkTo(state, world, 8, 3);
      use(1);
      walkTo(state, world, 12, 3);
      walkTo(state, world, 5, 9);
      use(3);
      fight(state, world, state.enemies[2]);
    }
    return { world, state };
  }

  it('can be won, with everyone gaining experience', () => {
    const { state } = playThrough(7);
    expect(state.status).toBe('playing');
    expect(state.enemies.every((e) => e.ai === 'dead')).toBe(true);
    expect(state.quests.quest_clear_mines.completed).toBe(true);
    const standing = state.party.members.filter((m: PartyMember) => m.hp > 0);
    expect(standing.length).toBeGreaterThanOrEqual(3);
    for (const m of standing) expect(m.xp).toBe(230);
    for (const m of standing) expect(m.level).toBe(3);
  });

  it('plays out identically from the same seed', () => {
    expect(serializeSession(playThrough(13).state)).toBe(serializeSession(playThrough(13).state));
  });

  it('armour found goes to the character the player is driving first', () => {
    const { world, state, rogue } = party();
    benchCompanions(state);
    step(state, world, [control(ROGUE)]);
    walkTo2(state, world);
    expect(rogue.equipment.body).toBe('item_studded_jerkin');
  });
});

/** Break the cracked wall and open the chest, with whoever is being driven. */
function walkTo2(state: SessionState, world: CompiledWorld) {
  const actor = activeMember(state).id;
  const go = (command: Command, wait = 20) => {
    step(state, world, [command]);
    run(state, world, wait);
  };
  for (let i = 0; i < 5; i++) go({ type: 'move', actor, dir: 'forward' });
  go({ type: 'turn', actor, dir: 'right' }, 12);
  // The cracked wall takes three heavy blows.
  for (let i = 0; i < 3; i++) go({ type: 'attack', actor, kind: 'heavy' }, 80);
  for (let i = 0; i < 3; i++) go({ type: 'move', actor, dir: 'forward' });
  go({ type: 'turn', actor, dir: 'right' }, 12);
  go({ type: 'interact', actor }, 4);
  void turn;
}
