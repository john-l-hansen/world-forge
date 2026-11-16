/**
 * The player application's game loop. It owns a session and wires the
 * simulation to the renderer, audio and interface. The simulation advances
 * in fixed 60 Hz ticks no matter how fast the screen refreshes.
 */
import { AudioEngine } from '../audio/audio';
import { createSession, enemyAt, hasLineOfSight, partyIsBusy, step } from '../engine/sim';
import { TICKS_PER_SECOND, type GameEvent, type SessionState } from '../engine/types';
import { DungeonRenderer } from '../renderer/renderer';
import { DIR_X, DIR_Y, roomAtCell, type CompiledWorld } from '../world/compile';
import { InputState, commandFor, type Action } from './input';
import { describeEvent } from './messages';
import { pushFloater, pushLog, useHud } from './store';

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
    const room = roomAtCell(this.world, this.state.party.x, this.state.party.y);
    if (room) pushLog(`${room.name}. ${room.description}`, 'lore');
  }

  restart() {
    this.seed += 1;
    this.state = createSession(this.world, this.seed);
    this.input.clear();
    this.acc = 0;
    this.resetHud('playing');
    const room = roomAtCell(this.world, this.state.party.x, this.state.party.y);
    if (room) pushLog(`${room.name}. ${room.description}`, 'lore');
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
      cleared: false,
      hurtPulse: 0,
      mapVersion: 0,
    });
    this.syncHud();
  }

  private frame = (ms: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(250, this.lastMs ? ms - this.lastMs : 0);
    this.lastMs = ms;

    if (useHud.getState().screen !== 'title') {
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
    const action = this.state.status === 'playing' ? this.input.next(free) : null;
    const events = step(this.state, this.world, action ? [commandFor(action, actor)] : []);
    for (const event of events) this.handle(event);
    this.syncHud();
  }

  private handle(event: GameEvent) {
    this.renderer.onEvent(event);
    this.audio.onEvent(event);
    const line = describeEvent(event, this.state, this.world);
    if (line) pushLog(line.text, line.tone);

    switch (event.type) {
      case 'attack.hit':
        pushFloater(String(event.damage), 'dealt');
        break;
      case 'enemy.attack.hit':
        pushFloater(`-${event.damage}`, 'taken');
        useHud.setState((s) => ({ hurtPulse: s.hurtPulse + 1 }));
        break;
      case 'party.moved':
        useHud.setState((s) => ({ mapVersion: s.mapVersion + 1 }));
        break;
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
      target = { name: def.name, hp: seen.hp, maxHp: seen.maxHp, winding: seen.ai === 'telegraph' };
    }
    const sameTarget =
      (target === null && hud.target === null) ||
      (target !== null && hud.target !== null && target.name === hud.target.name && target.hp === hud.target.hp && target.winding === hud.target.winding);

    if (hud.hp !== member.hp || hud.maxHp !== member.maxHp || hud.facing !== s.party.facing || hud.roomName !== roomName || !sameTarget) {
      useHud.setState({ hp: member.hp, maxHp: member.maxHp, facing: s.party.facing, roomName, target });
    }
  }
}
