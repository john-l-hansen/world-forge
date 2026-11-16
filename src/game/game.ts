/**
 * The player application's game loop. It owns a session and wires the
 * simulation to the renderer, audio and interface. The simulation advances
 * in fixed 60 Hz ticks no matter how fast the screen refreshes.
 */
import { AudioEngine } from '../audio/audio';
import { createSession, enemyAt, hasLineOfSight, isGuarding, partyIsBusy, step } from '../engine/sim';
import { TICKS_PER_SECOND, type Command, type GameEvent, type SessionState } from '../engine/types';
import { DungeonRenderer } from '../renderer/renderer';
import { DIR_X, DIR_Y, roomAtCell, type CompiledWorld } from '../world/compile';
import { InputState, commandFor, type Action } from './input';
import { describeEvent } from './messages';
import { pushFloater, pushLog, useHud, type BeltItem, type QuestView } from './store';

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
    const item = this.world.def.items.find((i) => i.category === 'consumable' && this.state.inventory[i.id]);
    const fallback = this.world.def.items.find((i) => i.category === 'consumable');
    const itemId = item?.id ?? fallback?.id;
    if (itemId) this.pending.push({ type: 'use', actor: this.state.party.members[0].id, itemId });
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
    const weapon = this.world.def.items.find((i) => i.id === hero.equipment.mainHand)!;
    useHud.setState({
      screen,
      heroName: hero.name,
      heroClass: hero.classId,
      weaponName: weapon.name,
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
        pushFloater(String(event.damage), event.kind === 'heavy' ? 'heavy' : 'dealt');
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
      belt.push({ itemId: item.id, name: item.name, description: item.description, icon: item.visualAssetId, count, usable: item.category === 'consumable' });
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
    useHud.setState({ belt, quest });
  }
}
