/**
 * The player application's game loop. It owns a session and wires the
 * simulation to the renderer, audio and interface. The simulation advances
 * in fixed 60 Hz ticks no matter how fast the screen refreshes.
 */
import { AudioEngine, type Voice } from '../audio/audio';
import { activeMember, createSession, defenceOf, enemyAt, hasLineOfSight, isGuarding, partyIsBusy, step } from '../engine/sim';
import { EQUIP_SLOTS, type EquipSlot } from '../schema/world';
import { TICKS_PER_SECOND, type Command, type GameEvent, type SessionState } from '../engine/types';
import { DungeonRenderer } from '../renderer/renderer';
import { DIR_X, DIR_Y, roomAtCell, type CompiledWorld } from '../world/compile';
import { InputState, commandFor, type Action } from './input';
import { describeEvent } from './messages';
import { CLASSES, ATTRIBUTES } from '../engine/classes';
import { criticalChance, damageBonus, experienceForLevel, modifier } from '../engine/stats';
import { pushFloater, pushLog, useHud, type BeltItem, type PartyView, type QuestView, type SheetView, type SpellView } from './store';

const TICK_MS = 1000 / TICKS_PER_SECOND;

export class Game {
  state: SessionState;
  readonly input = new InputState();
  readonly audio = new AudioEngine();
  private renderer: DungeonRenderer;
  private raf = 0;
  private lastMs = 0;
  private acc = 0;
  private disposed = false;
  /** Commands that carry more than an action, such as which item to use. */
  private pending: Command[] = [];
  /** Counts sessions, so a delayed effect never lands on a restarted game. */
  private sessionNumber = 0;
  private tipShown = false;
  private lastBumpText = '';
  private lastBumpTick = -1000;
  /** Blows taken and healing received per character, for the party panel's flashes. */
  private hurt: Record<string, number> = {};
  private mended: Record<string, number> = {};
  private partySignature = '';

  /** The character the player is driving. */
  private get driven() {
    return activeMember(this.state);
  }

  constructor(canvas: HTMLCanvasElement, readonly world: CompiledWorld, private seed = 1) {
    this.renderer = new DungeonRenderer(canvas, world);
    this.state = createSession(world, seed);
    this.resetHud('title');
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Whether an enemy sounds like a living thing or like dry bone. */
  private voiceOf(enemyId: string): Voice {
    const defId = this.state.enemies.find((e) => e.id === enemyId)?.defId;
    const visual = this.world.def.enemies.find((d) => d.id === defId)?.visualAssetId;
    return visual === 'skeleton' || visual === 'warden' ? 'bones' : 'beast';
  }

  /** Leave the title screen. Called from a key press or click, so audio may start. */
  begin() {
    if (useHud.getState().screen !== 'title') return;
    // The place the party starts in sets the ambience.
    const { x, y } = this.world.start;
    this.audio.start(this.world.environments[this.world.envAt[y * this.world.width + x]]);
    this.input.clear();
    useHud.setState({ screen: 'playing' });
    this.announceStart();
  }

  restart() {
    this.seed += 1;
    this.sessionNumber += 1;
    this.state = createSession(this.world, this.seed);
    this.input.clear();
    this.pending = [];
    this.lastBumpTick = -1000;
    this.hurt = {};
    this.mended = {};
    this.acc = 0;
    this.resetHud('playing');
    this.announceStart();
  }

  private announceStart() {
    for (const questId of Object.keys(this.state.quests)) {
      const quest = this.world.def.quests.find((q) => q.id === questId);
      if (quest) pushLog(`Quest: ${quest.title}. ${quest.description}`.trim(), 'quest');
    }
    const room = roomAtCell(this.world, this.state.party.x, this.state.party.y);
    if (room) pushLog(`${room.name}. ${room.description}`, 'lore');
  }

  /** Drink the first healing item the party carries. */
  drink() {
    this.useFirst('heal');
  }

  /** Read the first spell scroll the party carries. */
  readScroll() {
    this.useFirst('cast');
  }

  private useFirst(effect: 'heal' | 'cast') {
    const matches = this.world.def.items.filter((i) => i.category === 'consumable' && i.effect.type === effect);
    // With none in the pack, still send the request so the game can say so.
    const item = matches.find((i) => this.state.inventory[i.id]) ?? matches[0];
    if (item) this.pending.push({ type: 'use', actor: this.driven.id, itemId: item.id });
  }

  /** Click on something in the pack: drink it, or put it on. */
  useItem(itemId: string) {
    const item = this.world.def.items.find((i) => i.id === itemId);
    const actor = this.driven.id;
    if (item?.category === 'consumable') this.pending.push({ type: 'use', actor, itemId });
    else if (item?.category === 'weapon' || item?.category === 'armour') this.pending.push({ type: 'equip', actor, itemId });
    // The sheet pauses the game, so apply the change now for it to show.
    if (useHud.getState().screen === 'sheet') this.applyWhilePaused();
  }

  /** Take something off and put it back in the pack. */
  unequip(slot: EquipSlot) {
    this.pending.push({ type: 'unequip', actor: this.driven.id, slot });
    if (useHud.getState().screen === 'sheet') this.applyWhilePaused();
  }

  /** Changing equipment on the character sheet takes effect at once. */
  private applyWhilePaused() {
    this.tick();
    this.syncPack();
  }

  /** Raise or lower the guard. A guard raised just before a blow lands is a parry. */
  setGuard(held: boolean) {
    if (useHud.getState().screen !== 'playing' && held) return;
    this.pending.push({ type: 'block', actor: this.driven.id, held });
  }

  /** Take over another character. Whoever was being driven goes to the party AI. */
  takeControl(memberId: string) {
    const screen = useHud.getState().screen;
    if (screen !== 'playing' && screen !== 'sheet') return;
    const member = this.state.party.members.find((m) => m.id === memberId);
    if (!member || member.hp <= 0 || member.id === this.driven.id) return;
    this.input.clear();
    this.pending.push({ type: 'control', actor: member.id });
    if (screen === 'sheet') this.applyWhilePaused();
  }

  /** Step to the next character still standing, or the one before. */
  switchCharacter(direction: 1 | -1 = 1) {
    const members = this.state.party.members;
    const from = members.indexOf(this.driven);
    for (let i = 1; i < members.length; i++) {
      const next = members[(from + i * direction + members.length * 4) % members.length];
      if (next.hp > 0) {
        this.takeControl(next.id);
        return;
      }
    }
  }

  /** Cast the driven character's nth known spell. */
  castSpell(index: number) {
    const spellId = this.driven.spells[index];
    if (spellId) this.pending.push({ type: 'cast', actor: this.driven.id, spellId });
  }

  /** Send the driven character to the other row. */
  toggleRow() {
    const member = this.driven;
    this.pending.push({ type: 'row', actor: member.id, row: member.row === 'front' ? 'back' : 'front' });
    if (useHud.getState().screen === 'sheet') this.applyWhilePaused();
  }

  /** Open or close the quest journal. The game waits while it is open. */
  toggleJournal() {
    const screen = useHud.getState().screen;
    if (screen === 'playing') {
      this.input.clear();
      this.pending.push({ type: 'block', actor: this.driven.id, held: false });
      useHud.setState({ screen: 'journal' });
    } else if (screen === 'journal') useHud.setState({ screen: 'playing' });
  }

  /** Open or close the character sheet. The game waits while it is open. */
  toggleSheet() {
    const screen = useHud.getState().screen;
    if (screen === 'playing') {
      this.input.clear();
      this.pending.push({ type: 'block', actor: this.driven.id, held: false });
      this.syncPack();
      useHud.setState({ screen: 'sheet' });
    } else if (screen === 'sheet') useHud.setState({ screen: 'playing' });
  }

  /** Carry on exploring after the victory screen. */
  keepExploring() {
    if (useHud.getState().screen === 'victory') useHud.setState({ screen: 'playing' });
  }

  act(action: Action) {
    this.input.tap(action);
  }

  toggleMute() {
    const muted = !this.audio.muted;
    this.audio.setMuted(muted);
    useHud.setState({ muted });
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.audio.stop();
    this.renderer.dispose();
  }

  private resetHud(screen: 'title' | 'playing') {
    this.partySignature = '';
    useHud.setState({
      screen,
      log: [],
      floaters: [],
      target: null,
      belt: [],
      quest: null,
      quests: [],
      cleared: false,
      hurtPulse: 0,
      mapVersion: 0,
    });
    this.syncHud();
    this.syncPack();
  }

  private frame = (ms: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(250, this.lastMs ? ms - this.lastMs : 0);
    this.lastMs = ms;

    if (useHud.getState().screen === 'playing') {
      this.acc += dt;
      while (this.acc >= TICK_MS) {
        this.acc -= TICK_MS;
        this.tick();
      }
    }
    this.renderer.render(this.state, this.acc / TICK_MS, ms / 1000);
  };

  /** Advance the simulation by exactly one tick. */
  tick() {
    const actor = this.driven.id;
    const free = !partyIsBusy(this.state) && !this.state.buffered && this.state.hitStop === 0;
    // Guard changes and item use go straight in; at most one action joins them.
    const commands: Command[] = this.pending;
    this.pending = [];
    if (this.state.status === 'playing' && !commands.some((c) => c.type !== 'block' && c.type !== 'row')) {
      const action = this.input.next(free);
      if (action) {
        const command = commandFor(action, actor);
        // A dodge goes the way the player is steering, or straight back.
        commands.push(command.type === 'dodge' ? { ...command, dir: this.input.heldMove() ?? 'back' } : command);
      }
    }
    const events = step(this.state, this.world, commands);
    for (const event of events) this.handle(event);
    this.syncHud();
  }

  private handle(event: GameEvent) {
    const driven = this.driven.id;
    this.renderer.onEvent(event, driven);
    this.audio.onEvent(event, driven, 'enemyId' in event ? this.voiceOf(event.enemyId) : undefined);
    const line = describeEvent(event, this.state, this.world);
    // Walking into something repeatedly should not flood the log.
    const nagging = event.type === 'party.bumped' || event.type === 'stamina.low';
    const repeatedBump = nagging && line?.text === this.lastBumpText && this.state.tick - this.lastBumpTick < 240;
    if (line && !repeatedBump) pushLog(line.text, line.tone);
    if (nagging && line && !repeatedBump) {
      this.lastBumpText = line.text;
      this.lastBumpTick = this.state.tick;
    }

    switch (event.type) {
      case 'attack.hit':
        if (event.actor === driven) pushFloater(`${event.damage}${event.critical ? '!' : ''}`, event.kind === 'heavy' || event.critical ? 'heavy' : 'dealt');
        else pushFloater(String(event.damage), 'ally', 800, this.state.party.members.findIndex((m) => m.id === event.actor));
        break;
      case 'spell.healed': {
        this.mended[event.target] = (this.mended[event.target] ?? 0) + 1;
        const name = this.world.def.characters.find((c) => c.id === event.target)?.name ?? '';
        pushFloater(event.target === driven ? `+${event.healed}` : `+${event.healed} ${name}`, 'healed');
        break;
      }
      case 'party.control':
      case 'member.row':
        this.syncPack();
        break;
      case 'member.fell':
        pushFloater(`${this.world.def.characters.find((c) => c.id === event.actor)?.name ?? 'A companion'} falls!`, 'taken', 1400);
        break;
      case 'spell.hit':
        pushFloater(String(event.damage), 'spell');
        break;
      case 'spell.cast':
        this.syncPack();
        break;
      case 'level.up':
        pushFloater('Level up!', 'level', 1600);
        this.syncPack();
        break;
      case 'xp.gained':
        this.syncPack();
        break;
      case 'attack.parried':
        pushFloater('Parry!', 'parry');
        break;
      case 'attack.blocked':
        pushFloater(`-${event.damage}`, 'block');
        this.tookBlow(event.target);
        break;
      case 'guard.broken':
        pushFloater(`-${event.damage}`, 'taken');
        this.tookBlow(event.target);
        break;
      case 'enemy.telegraph':
        if (!this.tipShown) {
          this.tipShown = true;
          pushLog('Step away, dodge with Space, or raise your guard (L) just as it lands to parry.', 'lore');
        }
        break;
      case 'enemy.attack.hit':
        // A companion's wound shows on their portrait; only your own fills the view.
        if (event.target === driven) pushFloater(`-${event.damage}`, 'taken');
        this.tookBlow(event.target);
        break;
      case 'item.used':
        this.mended[event.actor] = (this.mended[event.actor] ?? 0) + 1;
        pushFloater(`+${event.healed}`, 'healed');
        this.syncPack();
        break;
      case 'item.gained':
      case 'item.equipped':
      case 'item.unequipped':
      case 'quest.objective':
        this.syncPack();
        break;
      case 'quest.completed': {
        this.syncPack();
        // The adventure is won when every main quest the party holds is done.
        const held = Object.keys(this.state.quests).map((id) => this.world.def.quests.find((q) => q.id === id)!);
        const mains = held.filter((q) => q.kind === 'main');
        if (mains.length === 0 || !mains.every((q) => this.state.quests[q.id].completed)) break;
        // Let the last blow, the death and the fanfare play out first.
        const session = this.sessionNumber;
        setTimeout(() => {
          if (!this.disposed && session === this.sessionNumber && useHud.getState().screen === 'playing') {
            this.input.clear();
            useHud.setState({ screen: 'victory' });
          }
        }, 1800);
        break;
      }
      case 'party.moved':
        useHud.setState((s) => ({ mapVersion: s.mapVersion + 1 }));
        break;
      case 'secret.found':
      case 'door.unlocked':
      case 'chest.opened':
      case 'door.opened':
      case 'door.closed':
      case 'enemy.moved':
      case 'enemy.died':
      case 'enemy.alerted':
        useHud.setState((s) => ({ mapVersion: s.mapVersion + 1 }));
        break;
      case 'encounter.cleared':
        useHud.setState({ cleared: true });
        break;
      case 'party.died':
        useHud.setState({ screen: 'dead' });
        break;
    }
  }

  private tookBlow(memberId: string) {
    this.hurt[memberId] = (this.hurt[memberId] ?? 0) + 1;
    if (memberId === this.driven.id) useHud.setState((s) => ({ hurtPulse: s.hurtPulse + 1 }));
  }

  /** The party panel and the driven character's spells, only when something changed. */
  private syncParty() {
    const def = this.world.def;
    const driven = this.driven;
    const party: PartyView[] = this.state.party.members.map((m) => {
      const character = def.characters.find((c) => c.id === m.id)!;
      const acting = m.action.kind !== 'idle' && this.state.tick < m.action.end;
      return {
        id: m.id,
        name: character.name,
        className: CLASSES[m.classId].name,
        portrait: character.portraitAssetId,
        level: m.level,
        hp: m.hp,
        maxHp: m.maxHp,
        stamina: m.stamina,
        maxStamina: m.maxStamina,
        mana: m.mana,
        maxMana: m.maxMana,
        row: m.row,
        active: m === driven,
        guarding: isGuarding(m),
        busy: acting ? (m.action.kind === 'cast' ? 'cast' : 'attack') : null,
        hurt: this.hurt[m.id] ?? 0,
        mended: this.mended[m.id] ?? 0,
      };
    });
    const spells: SpellView[] = driven.spells.flatMap((id) => {
      const spell = def.spells.find((sp) => sp.id === id);
      return spell ? [{ id, name: spell.name, description: spell.description, cost: spell.manaCost, ready: driven.mana >= spell.manaCost }] : [];
    });
    const signature = JSON.stringify([party, spells]);
    if (signature !== this.partySignature) {
      this.partySignature = signature;
      useHud.setState({ party, spells });
    }
  }

  /** Copy the few values the interface shows, only when they have changed. */
  private syncHud() {
    const s = this.state;
    const hud = useHud.getState();
    const member = this.driven;
    this.syncParty();
    const room = roomAtCell(this.world, s.party.x, s.party.y);
    const roomName = room ? room.name : hud.roomName;

    let target: typeof hud.target = null;
    const front = enemyAt(s, s.party.x + DIR_X[s.party.facing], s.party.y + DIR_Y[s.party.facing]);
    const seen =
      front ??
      s.enemies.find(
        (e) => e.ai !== 'dead' && e.alerted && Math.abs(e.x - s.party.x) + Math.abs(e.y - s.party.y) <= 6 && hasLineOfSight(s, this.world, s.party.x, s.party.y, e.x, e.y),
      );
    if (seen) {
      const def = this.world.def.enemies.find((d) => d.id === seen.defId)!;
      const encounter = this.world.def.encounters.find((e) => e.id === seen.id.split('#')[0]);
      const boss = encounter?.boss === true;
      const winding = seen.ai === 'telegraph';
      const danger = winding && def.attacks.find((a) => a.id === seen.attackId)?.blockable === false;
      target = { name: boss ? encounter.name : def.name, hp: seen.hp, maxHp: seen.maxHp, winding, danger, boss };
    }
    const sameTarget =
      (target === null && hud.target === null) ||
      (target !== null && hud.target !== null && target.name === hud.target.name && target.hp === hud.target.hp && target.winding === hud.target.winding && target.danger === hud.target.danger);

    const guarding = isGuarding(member);
    if (
      hud.hp !== member.hp ||
      hud.maxHp !== member.maxHp ||
      hud.stamina !== member.stamina ||
      hud.maxStamina !== member.maxStamina ||
      hud.guarding !== guarding ||
      hud.facing !== s.party.facing ||
      hud.roomName !== roomName ||
      !sameTarget
    ) {
      useHud.setState({ hp: member.hp, maxHp: member.maxHp, stamina: member.stamina, maxStamina: member.maxStamina, guarding, facing: s.party.facing, roomName, target });
    }
  }

  /** Copy the inventory and quest progress to the interface. */
  private syncPack() {
    const def = this.world.def;
    const belt: BeltItem[] = [];
    for (const item of def.items) {
      const count = this.state.inventory[item.id];
      if (!count) continue;
      const action =
        item.category === 'consumable' ? (item.effect.type === 'cast' ? 'read' : 'drink') : item.category === 'weapon' || item.category === 'armour' ? 'equip' : null;
      belt.push({ itemId: item.id, name: item.name, description: item.description, icon: item.visualAssetId, count, action });
    }
    const quests: QuestView[] = [];
    for (const questId of Object.keys(this.state.quests)) {
      const questDef = def.quests.find((q) => q.id === questId);
      if (!questDef) continue;
      const progress = this.state.quests[questId];
      quests.push({
        id: questId,
        main: questDef.kind === 'main',
        title: questDef.title,
        description: questDef.description,
        completed: progress.completed,
        objectives: questDef.objectives.map((o) => ({ id: o.id, text: o.description, done: progress.done[o.id] === true, optional: o.optional })),
      });
    }
    // Main quests first, otherwise in the order they were taken up.
    quests.sort((a, b) => Number(b.main) - Number(a.main));
    const quest = quests[0] ?? null;
    // The character sheet and the level readout, for whoever is being driven.
    const member = this.driven;
    const character = def.characters.find((c) => c.id === member.id)!;
    const cls = CLASSES[member.classId];
    const weapon = def.items.find((i) => i.id === member.equipment.mainHand);
    const slotLabel: Record<EquipSlot, string> = { mainHand: 'Main hand', offHand: 'Off hand', head: 'Head', body: 'Body', hands: 'Hands', feet: 'Feet', accessory: 'Accessory' };
    const equipment: SheetView['equipment'] = [];
    for (const slot of EQUIP_SLOTS) {
      const item = def.items.find((i) => i.id === member.equipment[slot]);
      if (!item) continue;
      const detail = item.category === 'armour' ? `Defence ${item.defence}` : item.category === 'weapon' ? 'Weapon' : '';
      equipment.push({ slot, label: slotLabel[slot], itemId: item.id, name: item.name, detail });
    }
    const bonus = damageBonus(member.attributes);
    const range = (d: { min: number; max: number }) => `${d.min + bonus}-${d.max + bonus}`;
    const levelStart = experienceForLevel(member.level);
    const nextLevel = experienceForLevel(member.level + 1);
    const label: Record<string, string> = { strength: 'Strength', dexterity: 'Dexterity', constitution: 'Constitution', intelligence: 'Intelligence', wisdom: 'Wisdom' };
    const sheet: SheetView = {
      name: character.name,
      className: cls.name,
      role: cls.role,
      level: member.level,
      xp: member.xp,
      levelStart,
      nextLevel,
      attributes: ATTRIBUTES.map((a) => ({ label: label[a], value: member.attributes[a], modifier: modifier(member.attributes[a]), primary: a === cls.primary })),
      health: `${member.hp}/${member.maxHp}`,
      stamina: `${member.stamina}/${member.maxStamina}`,
      mana: member.maxMana > 0 ? `${member.mana}/${member.maxMana}` : '',
      row: member.row,
      canChangeRow: this.state.party.members.length > 1,
      spells: member.spells.flatMap((id) => def.spells.find((sp) => sp.id === id)?.name ?? []),
      light: range(weapon?.category === 'weapon' ? weapon.weapon.light.damage : { min: 1, max: 2 }),
      heavy: range(weapon?.category === 'weapon' ? weapon.weapon.heavy.damage : { min: 2, max: 4 }),
      critical: `${criticalChance(member.attributes)}%`,
      weapon: weapon?.name ?? 'Unarmed',
      defence: defenceOf(this.world, member),
      equipment,
    };
    const xpProgress = Math.max(0, Math.min(1, (member.xp - levelStart) / Math.max(1, nextLevel - levelStart)));
    useHud.setState({ belt, quest, quests, sheet, level: member.level, xpProgress, heroName: character.name, heroClass: member.classId, weaponName: weapon?.name ?? 'Unarmed' });
  }
}
