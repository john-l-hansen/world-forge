/**
 * The in-game interface: a classic framed viewport with the party, map,
 * compass, controls and message log around it. It reads the interface store
 * and sends actions to the game; it holds no game rules.
 */
import { useEffect, useRef } from 'react';
import type { Game } from '../game/game';
import type { Action } from '../game/input';
import { useHud } from '../game/store';
import { TILE_DOORWAY, TILE_WALL } from '../world/compile';
import { uiArt, type IconKind } from './art';

const FACING_LETTER = ['N', 'E', 'S', 'W'];

export function TargetBar() {
  const target = useHud((s) => s.target);
  if (!target) return null;
  return (
    <div className={`target${target.winding ? ' winding' : ''}`}>
      <span className="target-name">{target.name}</span>
      <div className="bar">
        <i style={{ width: `${(target.hp / target.maxHp) * 100}%` }} />
      </div>
    </div>
  );
}

export function Floaters() {
  const floaters = useHud((s) => s.floaters);
  return (
    <>
      {floaters.map((f) => (
        <div key={f.id} className={`floater ${f.kind}`}>
          {f.text}
        </div>
      ))}
    </>
  );
}

export function PartyCard() {
  const art = uiArt();
  const name = useHud((s) => s.heroName);
  const cls = useHud((s) => s.heroClass);
  const weapon = useHud((s) => s.weaponName);
  const hp = useHud((s) => s.hp);
  const maxHp = useHud((s) => s.maxHp);
  const hurtPulse = useHud((s) => s.hurtPulse);
  const ratio = hp / maxHp;
  const colour = ratio > 0.5 ? '#4f9a3a' : ratio > 0.25 ? '#c9952a' : '#b02a22';
  return (
    <div className="card raised">
      {/* The key restarts the flash animation each time damage lands. */}
      <div key={hurtPulse} className={`portrait${hurtPulse ? ' hurt' : ''}`}>
        <img src={art.portrait} alt={name} />
      </div>
      <div className="card-body">
        <div>
          <div className="name">{name}</div>
          <div className="class">{cls}</div>
        </div>
        <div>
          <div className="hp-row">
            <span>HP</span>
            <div className="bar">
              <i style={{ width: `${Math.max(0, ratio) * 100}%`, background: colour }} />
            </div>
          </div>
          <div className="hp-row">
            <span style={{ color: colour }}>
              {hp}/{maxHp}
            </span>
          </div>
        </div>
        <div className="weapon">
          <img src={art.sword} alt="" />
          {weapon}
        </div>
      </div>
    </div>
  );
}

export function AutoMap({ game }: { game: Game }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const version = useHud((s) => s.mapVersion);
  const facing = useHud((s) => s.facing);
  const screen = useHud((s) => s.screen);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const W = 140;
    const H = Math.max(40, Math.round(canvas.parentElement!.clientHeight - 4));
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const { world, state } = game;
    const cell = Math.max(4, Math.min(8, Math.floor(Math.min(W / world.width, H / world.height))));
    ctx.fillStyle = '#0b0a0c';
    ctx.fillRect(0, 0, W, H);
    // Centre the map, or follow the party when the map is larger than the panel.
    const mapW = world.width * cell;
    const mapH = world.height * cell;
    const ox = mapW <= W ? Math.floor((W - mapW) / 2) : Math.round(Math.min(0, Math.max(W - mapW, W / 2 - state.party.x * cell)));
    const oy = mapH <= H ? Math.floor((H - mapH) / 2) : Math.round(Math.min(0, Math.max(H - mapH, H / 2 - state.party.y * cell)));

    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const i = y * world.width + x;
        if (!state.explored[i]) continue;
        const tile = world.tiles[i];
        const px = ox + x * cell;
        const py = oy + y * cell;
        if (tile === TILE_WALL) {
          ctx.fillStyle = '#3a312a';
          ctx.fillRect(px, py, cell, cell);
        } else {
          ctx.fillStyle = '#7d6d58';
          ctx.fillRect(px, py, cell, cell);
          ctx.fillStyle = '#655746';
          ctx.fillRect(px + cell - 1, py, 1, cell);
          ctx.fillRect(px, py + cell - 1, cell, 1);
          if (tile === TILE_DOORWAY) {
            const door = world.doorAt.get(i)!;
            if (door.def.kind === 'door') {
              ctx.fillStyle = state.doorsOpen[door.def.id] ? '#5e4010' : '#cfa436';
              if (door.axis === 'ns') ctx.fillRect(px, py + 2, cell, 2);
              else ctx.fillRect(px + 2, py, 2, cell);
            }
          }
          if (world.blocked[i]) {
            ctx.fillStyle = '#473016';
            ctx.fillRect(px + 1, py + 1, cell - 3, cell - 3);
          }
        }
      }
    }
    for (const enemy of state.enemies) {
      if (enemy.ai === 'dead' || !enemy.alerted || !state.explored[enemy.y * world.width + enemy.x]) continue;
      ctx.fillStyle = '#d8553a';
      ctx.fillRect(ox + enemy.x * cell + 1, oy + enemy.y * cell + 1, cell - 3, cell - 3);
    }
    // The party: a small arrowhead pointing the way it faces.
    const cx = ox + state.party.x * cell + Math.floor((cell - 1) / 2);
    const cy = oy + state.party.y * cell + Math.floor((cell - 1) / 2);
    ctx.fillStyle = '#f0d878';
    ctx.fillRect(cx - 1, cy - 1, 3, 3);
    ctx.fillStyle = '#0b0a0c';
    const tail = [[0, 1], [-1, 0], [0, -1], [1, 0]][state.party.facing];
    ctx.fillRect(cx + tail[0], cy + tail[1], 1, 1);
    ctx.fillStyle = '#ffffff';
    const tip = [[0, -2], [2, 0], [0, 2], [-2, 0]][state.party.facing];
    ctx.fillRect(cx + tip[0], cy + tip[1], 1, 1);
  }, [game, version, facing, screen]);

  return (
    <div className="map sunk">
      <canvas ref={ref} />
    </div>
  );
}

export function Compass() {
  const facing = useHud((s) => s.facing);
  return (
    <div className="compass raised">
      <b>{FACING_LETTER[facing]}</b>
      <span>Facing</span>
    </div>
  );
}

function PadButton({ game, action, icon, label }: { game: Game; action: Action; icon: IconKind; label: string }) {
  const art = uiArt();
  return (
    <button
      className="btn"
      title={label}
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        game.act(action);
      }}
    >
      <img src={art.icons[icon]} alt="" />
    </button>
  );
}

export function MovePad({ game }: { game: Game }) {
  return (
    <div className="pad">
      <PadButton game={game} action="turnLeft" icon="turnLeft" label="Turn left (Q)" />
      <PadButton game={game} action="forward" icon="forward" label="Forward (W)" />
      <PadButton game={game} action="turnRight" icon="turnRight" label="Turn right (E)" />
      <PadButton game={game} action="strafeLeft" icon="strafeLeft" label="Step left (A)" />
      <PadButton game={game} action="back" icon="back" label="Back (S)" />
      <PadButton game={game} action="strafeRight" icon="strafeRight" label="Step right (D)" />
    </div>
  );
}

export function ActionButtons({ game }: { game: Game }) {
  return (
    <div className="buttons">
      <button className="btn" onPointerDown={() => game.act('attack')}>
        Attack <kbd>Space</kbd>
      </button>
      <button className="btn" onPointerDown={() => game.act('interact')}>
        Use <kbd>F</kbd>
      </button>
    </div>
  );
}

export function MessageLog() {
  const log = useHud((s) => s.log);
  return (
    <div className="log sunk" role="log" aria-live="polite">
      {log.slice(-6).map((line) => (
        <p key={line.id} className={line.tone}>
          {line.text}
        </p>
      ))}
    </div>
  );
}

export function TitleOverlay({ title }: { title: string }) {
  return (
    <div className="overlay">
      <h2>World Forge presents</h2>
      <h1>{title}</h1>
      <dl className="keys">
        <dt>W A S D</dt>
        <dd>Step</dd>
        <dt>Q E</dt>
        <dd>Turn</dd>
        <dt>Space / Click</dt>
        <dd>Attack</dd>
        <dt>F / Enter</dt>
        <dd>Open doors</dd>
        <dt>M</dt>
        <dd>Sound on / off</dd>
      </dl>
      <div className="blink">Press any key or click to enter</div>
    </div>
  );
}

export function DeathOverlay({ name }: { name: string }) {
  return (
    <div className="overlay dead">
      <h1>{name} has fallen</h1>
      <div className="blink">Press R to try again</div>
    </div>
  );
}
