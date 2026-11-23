import { useEffect, useRef, useState } from 'react';
import { Game } from '../game/game';
import { DEFAULT_KEYMAP } from '../game/input';
import { useHud } from '../game/store';
import type { CompiledWorld } from '../world/compile';
import type { SessionState } from '../engine/types';
import { latestSlot, type SlotId } from '../game/saves';
import { DM_SKIPS, DmOverlay } from './DmScreen';
import { uiArt } from './art';
import { ActionButtons, AutoMap, Belt, PickupBanner, DeathOverlay, Floaters, JournalOverlay, MessageLog, MovePad, ObjectivePlate, PartyPanel, SheetOverlay, SpellBar, TargetBar, TitleOverlay, VictoryOverlay, type TitleChoice } from './Hud';

const LOGICAL_W = 480;
const LOGICAL_H = 270;

function useWholeNumberScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () => setScale(Math.max(1, Math.floor(Math.min(window.innerWidth / LOGICAL_W, window.innerHeight / LOGICAL_H))));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return scale;
}

export interface GameScreenProps {
  world: CompiledWorld;
  /** The adventures on offer from the title screen, and which one this is. */
  choices: TitleChoice[];
  current: string;
  /** Go straight into the game: the player has just picked this adventure. */
  autoBegin: boolean;
  onChoose: (key: string) => void;
  /** Ask the player for a world file to load. */
  onOpenFile: () => void;
  /** Go to the world creator. */
  onCreate: () => void;
  /** This world was made in the creator, so the way back leads there. */
  created: boolean;
  /** Resume from this saved state instead of the world's start. */
  resume?: SessionState;
  /** The seed the saved session began with. */
  seed?: number;
  /** When the save was made, so the world can catch up on the time since. */
  savedAt?: number;
  /** Load a save slot, or the latest save when no slot is named. */
  onLoadSave: (slot?: SlotId) => void;
}

export function GameScreen({ world, choices, current, autoBegin, onChoose, onOpenFile, onCreate, created, resume, seed: savedSeed, savedAt, onLoadSave }: GameScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [game, setGame] = useState<Game | null>(null);
  const scale = useWholeNumberScale();
  const screen = useHud((s) => s.screen);
  const roomName = useHud((s) => s.roomName);
  const heroName = useHud((s) => s.heroName);
  const muted = useHud((s) => s.muted);
  const art = uiArt();

  useEffect(() => {
    const seed = savedSeed ?? (Number(new URLSearchParams(window.location.search).get('seed')) || 1);
    const instance = new Game(canvasRef.current!, world, seed, { resume, created, savedAt });
    setGame(instance);
    // A handle for browser tests and debugging. Not used by the game itself.
    (window as unknown as { __worldForge?: Game }).__worldForge = instance;
    if (autoBegin) instance.begin();
    return () => instance.dispose();
    // autoBegin is read once, at the moment the game is created.
  }, [world]);

  /** Picking the adventure already on screen starts it; picking another loads that one. */
  const choose = (key: string) => {
    if (key === current) game?.begin();
    else onChoose(key);
  };

  // The key handler is set up once per game; it reaches the latest choice through this.
  const chooseRef = useRef(choose);
  chooseRef.current = choose;

  useEffect(() => {
    if (!game) return;
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const current = useHud.getState().screen;
      // F9 loads the last save from anywhere; F5 saves while playing.
      if (e.code === 'F9') {
        e.preventDefault();
        if (!e.repeat) onLoadSave();
        return;
      }
      if (e.code === 'F5') {
        e.preventDefault();
        if (!e.repeat && current === 'playing') game.save('quick');
        return;
      }
      if (current === 'title') {
        e.preventDefault();
        const picked = /^(Digit|Numpad)[1-9]$/.test(e.code) ? choices[Number(e.code.slice(-1)) - 1] : undefined;
        if (picked) chooseRef.current(picked.key);
        else if (e.code === 'KeyO') onOpenFile();
        else if (e.code === 'KeyN') onCreate();
        else if (e.code === 'KeyC' && latestSlot()) onLoadSave();
        else game.begin();
        return;
      }
      if (e.code === 'KeyM') {
        game.toggleMute();
        return;
      }
      if (e.code === 'KeyG' && current === 'playing') {
        game.toggleGore();
        return;
      }
      if (e.code === 'KeyV' && current === 'playing') {
        game.toggleNumbers();
        return;
      }
      if (current === 'dead') {
        if (e.code === 'KeyR') game.restart();
        else if (e.code === 'KeyL' && latestSlot()) onLoadSave();
        else if (e.code === 'KeyN' && created) onCreate();
        return;
      }
      if (current === 'victory') {
        if (e.code === 'KeyR') game.restart();
        else if (e.code === 'KeyN' && created) onCreate();
        else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape') {
          e.preventDefault();
          game.keepExploring();
        }
        return;
      }
      if (e.code === 'KeyB' || (current === 'journal' && e.code === 'Escape')) {
        game.toggleJournal();
        return;
      }
      if (current === 'journal') return;
      // F2: the Dungeon Master's screen, where the save allows one.
      if (e.code === 'F2' || (current === 'dm' && e.code === 'Escape')) {
        e.preventDefault();
        if (!e.repeat) game.toggleDm();
        return;
      }
      if (current === 'dm') {
        const skip = DM_SKIPS.find((s) => e.code === `Digit${s.key}` || e.code === `Numpad${s.key}`);
        if (skip && !e.repeat) game.dmSkip(skip.minutes);
        return;
      }
      if (e.code === 'KeyC' || (current === 'sheet' && e.code === 'Escape')) {
        game.toggleSheet();
        return;
      }
      // Tab moves to the next character, on the sheet as well as in play.
      if (e.code === 'Tab') {
        e.preventDefault();
        if (!e.repeat) game.switchCharacter(e.shiftKey ? -1 : 1);
        return;
      }
      if (current === 'sheet') return;
      if (/^(Digit|Numpad)[1-4]$/.test(e.code)) {
        if (!e.repeat) game.castSpell(Number(e.code.slice(-1)) - 1);
        return;
      }
      if (e.code === 'KeyH') {
        game.drink();
        return;
      }
      if (e.code === 'KeyR') {
        game.readScroll();
        return;
      }
      if (e.code === 'KeyL') {
        e.preventDefault();
        if (!e.repeat) game.setGuard(true);
        return;
      }
      const action = DEFAULT_KEYMAP[e.code];
      if (!action) return;
      e.preventDefault();
      if (!e.repeat) game.input.press(action);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'KeyL') game.setGuard(false);
      const action = DEFAULT_KEYMAP[e.code];
      if (action) game.input.release(action);
    };
    const blur = () => {
      game.input.clear();
      game.setGuard(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [game, choices, onOpenFile, onCreate, created, onLoadSave]);

  return (
    <div className="stage">
      <div className="screen" style={{ zoom: scale, backgroundImage: `url(${art.panel})` }}>
        <div
          className="viewport sunk"
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            if (!game) return;
            if (screen === 'title') game.begin();
            else if (screen !== 'playing') return;
            // Left click attacks (Shift for a heavy attack); right click holds the guard.
            else if (e.button === 2) game.setGuard(true);
            else if (e.button === 0) game.act(e.shiftKey ? 'heavy' : 'attack');
          }}
          onPointerUp={(e) => {
            if (game && e.button === 2) game.setGuard(false);
          }}
          onPointerLeave={() => game?.setGuard(false)}
        >
          <canvas ref={canvasRef} width={320} height={200} />
          {screen === 'playing' && <TargetBar />}
          {screen === 'playing' && <Floaters />}
          {screen === 'playing' && <PickupBanner />}
          {screen === 'title' && <TitleOverlay title={world.def.world.name} choices={choices} current={current} onChoose={choose} onOpenFile={onOpenFile} onCreate={onCreate} created={created} saved={latestSlot()} onContinue={() => onLoadSave()} />}
          {screen === 'dead' && <DeathOverlay name={heroName} created={created} canLoad={Boolean(latestSlot())} />}
          {screen === 'journal' && <JournalOverlay />}
          {screen === 'dm' && <DmOverlay onSkip={(minutes) => game?.dmSkip(minutes)} />}
          {screen === 'sheet' && game && <SheetOverlay game={game} />}
          {screen === 'victory' && <VictoryOverlay world={world.def.world.name} created={created} />}
        </div>

        <div className="side">
          {game && <PartyPanel game={game} />}
          <div className="plate raised">{roomName}</div>
          <ObjectivePlate />
          {game && <SpellBar game={game} />}
          {game && <AutoMap game={game} />}
          {game && <Belt game={game} />}
          <div className="actions">{game && <ActionButtons game={game} />}</div>
        </div>

        <div className="bottom">
          {game && <MovePad game={game} />}
          <MessageLog />
        </div>
        {muted && <div className="mute">Sound off</div>}
      </div>
    </div>
  );
}
