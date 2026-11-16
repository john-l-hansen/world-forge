import { useEffect, useRef, useState } from 'react';
import { Game } from '../game/game';
import { DEFAULT_KEYMAP } from '../game/input';
import { useHud } from '../game/store';
import type { CompiledWorld } from '../world/compile';
import { uiArt } from './art';
import { ActionButtons, AutoMap, Belt, DeathOverlay, Floaters, JournalOverlay, MessageLog, MovePad, ObjectivePlate, PartyCard, TargetBar, TitleOverlay, VictoryOverlay } from './Hud';

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

export function GameScreen({ world }: { world: CompiledWorld }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [game, setGame] = useState<Game | null>(null);
  const scale = useWholeNumberScale();
  const screen = useHud((s) => s.screen);
  const roomName = useHud((s) => s.roomName);
  const heroName = useHud((s) => s.heroName);
  const muted = useHud((s) => s.muted);
  const art = uiArt();

  useEffect(() => {
    const seed = Number(new URLSearchParams(window.location.search).get('seed')) || 1;
    const instance = new Game(canvasRef.current!, world, seed);
    setGame(instance);
    // A handle for browser tests and debugging. Not used by the game itself.
    (window as unknown as { __worldForge?: Game }).__worldForge = instance;
    return () => instance.dispose();
  }, [world]);

  useEffect(() => {
    if (!game) return;
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const current = useHud.getState().screen;
      if (current === 'title') {
        e.preventDefault();
        game.begin();
        return;
      }
      if (e.code === 'KeyM') {
        game.toggleMute();
        return;
      }
      if (current === 'dead') {
        if (e.code === 'KeyR') game.restart();
        return;
      }
      if (current === 'victory') {
        if (e.code === 'KeyR') game.restart();
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
      if (e.code === 'KeyH') {
        game.drink();
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
  }, [game]);

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
          {screen === 'title' && <TitleOverlay title={world.def.world.name} />}
          {screen === 'dead' && <DeathOverlay name={heroName} />}
          {screen === 'journal' && <JournalOverlay />}
          {screen === 'victory' && <VictoryOverlay world={world.def.world.name} />}
        </div>

        <div className="side">
          <PartyCard />
          <div className="plate raised">{roomName}</div>
          <ObjectivePlate />
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
