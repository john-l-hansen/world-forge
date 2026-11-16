/**
 * The player application's game loop. It owns a session and wires the
 * simulation to the renderer, audio and interface. The simulation advances
 * in fixed 60 Hz ticks no matter how fast the screen refreshes.
 */
import { AudioEngine } from '../audio/audio';
import { createSession, defenceOf, enemyAt, hasLineOfSight, isGuarding, partyIsBusy, step } from '../engine/sim';
import { EQUIP_SLOTS, type EquipSlot } from '../schema/world';
import { TICKS_PER_SECOND, type Command, type GameEvent, type SessionState } from '../engine/types';
import { DungeonRenderer } from '../renderer/renderer';
import { DIR_X, DIR_Y, roomAtCell, type CompiledWorld } from '../world/compile';
import { InputState, commandFor, type Action } from './input';
import { describeEvent } from './messages';
import { CLASSES, ATTRIBUTES } from '../engine/classes';
import { criticalChance, damageBonus, experienceForLevel, modifier } from '../engine/stats';
import { pushFloater, pushLog, useHud, type BeltItem, type QuestView, type SheetView } from './store';

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

  constructor(canvas: HTMLCanvasElement, readonly world: CompiledWorld, private seed = 1) {
    this.renderer = new DungeonRenderer(canvas, world);
    this.state = createSession(world, seed);
    this.resetHud('title');
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Leave the title screen. Called from a key press or click, so audio may start. */
  begin() {
    if (useHud.getState().screen !== 'title') return;
    this.audio.start();
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
    if (item) this.pending.push({ type: 'use', actor: this.state.party.members[0].id, itemId: item.id });
  }

  /** Click on something in the pack: drink it, or put it on. */
  useItem(itemId: string) {
    const item = this.world.def.items.find((i) => i.id === itemId);
    const actor = this.state.party.members[0].id;
    if (item?.category === 'consumable') this.pending.push({ type: 'use', actor, itemId });
    else if (item?.category === 'weapon' || item?.category === 'armour') this.pending.push({ type: 'equip', actor, itemId });
    // The sheet pauses the game, so apply the change now for it to show.
    if (useHud.getState().screen === 'sheet') this.applyWhilePaused();
  }

  /** Take something off and put it back in the pack. */
  unequip(slot: EquipSlot) {
    this.pending.push({ type: 'unequip', actor: this.state.party.members[0].id, slot });
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
    this.pending.push({ type: 'block', actor: this.state.party.members[0].id, held });
  }

  /** Open or close the quest journal. The game waits while it is open. */
  toggleJournal() {
    const screen = useHud.getState().screen;
    if (screen === 'playing') {
      this.input.clear();
      this.pending.push({ type: 'block', actor: this.state.party.members[0].id, held: false });
      useHud.setState({ screen: 'journal' });
    } else if (screen === 'journal') useHud.setState({ screen: 'playing' });
  }

  /** Open or close the character sheet. The game waits while it is open. */
  toggleSheet() {
    const screen = useHud.getState().screen;
    if (screen === 'playing') {
      this.input.clear();
      this.pending.push({ type: 'block', actor: this.state.party.members[0].id, held: false });
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
    const hero = this.world.def.characters.find((c) => c.id === this.state.party.members[0].id)!;
    const weapon = this.world.def.items.find((i) => i.id === hero.equipment.mainHand);
    useHud.setState({
      screen,
      heroName: hero.name,
      heroClass: hero.classId,
      weaponName: weapon?.name ?? 'Unarmed',
      log: [],
      floaters: [],
      target: null,
      belt: [],
      quest: null,
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
    const actor = this.state.party.members[0].id;
    const free = !partyIsBusy(this.state) && !this.state.buffered && this.state.hitStop === 0;
    // Guard changes and item use go straight in; at most one action joins them.
    const commands: Command[] = this.pending;
    this.pending = [];
    if (this.state.status === 'playing' && !commands.some((c) => c.type !== 'block')) {
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
    this.renderer.onEvent(event);
    this.audio.onEvent(event);
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
        pushFloater(`${event.damage}${event.critical ? '!' : ''}`, event.kind === 'heavy' || event.critical ? 'heavy' : 'dealt');
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
        useHud.setState((s) => ({ hurtPulse: s.hurtPulse + 1 }));
        break;
      case 'guard.broken':
        pushFloater(`-${event.damage}`, 'taken');
        useHud.setState((s) => ({ hurtPulse: s.hurtPulse + 1 }));
        break;
      case 'enemy.telegraph':
        if (!this.tipShown) {
          this.tipShown = true;
          pushLog('Step away, dodge with Space, or raise your guard (L) just as it lands to parry.', 'lore');
        }
        break;
      case 'enemy.attack.hit':
        pushFloater(`-${event.damage}`, 'taken');
        useHud.setState((s) => ({ hurtPulse: s.hurtPulse + 1 }));
        break;
      case 'item.used':
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

  /** Copy the few values the interface shows, only when they have changed. */
  private syncHud() {
    const s = this.state;
    const hud = useHud.getState();
    const member = s.party.members[0];
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
    let quest: QuestView | null = null;
    const questId = Object.keys(this.state.quests)[0];
    const questDef = def.quests.find((q) => q.id === questId);
    if (questDef) {
      const progress = this.state.quests[questId];
      quest = {
        title: questDef.title,
        description: questDef.description,
        completed: progress.completed,
        objectives: questDef.objectives.map((o) => ({ id: o.id, text: o.description, done: progress.done[o.id] === true, optional: o.optional })),
      };
    }
    // The character sheet and the level readout.
    const member = this.state.party.members[0];
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
      light: range(weapon?.category === 'weapon' ? weapon.weapon.light.damage : { min: 1, max: 2 }),
      heavy: range(weapon?.category === 'weapon' ? weapon.weapon.heavy.damage : { min: 2, max: 4 }),
      critical: `${criticalChance(member.attributes)}%`,
      weapon: weapon?.name ?? 'Unarmed',
      defence: defenceOf(this.world, member),
      equipment,
    };
    const xpProgress = Math.max(0, Math.min(1, (member.xp - levelStart) / Math.max(1, nextLevel - levelStart)));
    useHud.setState({ belt, quest, sheet, level: member.level, xpProgress, weaponName: weapon?.name ?? 'Unarmed' });
  }
}
