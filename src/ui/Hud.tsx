/**
 * The in-game interface: a classic framed viewport with the party, map,
 * compass, controls and message log around it. It reads the interface store
 * and sends actions to the game; it holds no game rules.
 */
import { Fragment, useEffect, useRef } from 'react';
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
    <div className={`target${target.winding ? ' winding' : ''}${target.danger ? ' danger' : ''}${target.boss ? ' boss' : ''}`}>
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
  const stamina = useHud((s) => s.stamina);
  const maxStamina = useHud((s) => s.maxStamina);
  const guarding = useHud((s) => s.guarding);
  const hurtPulse = useHud((s) => s.hurtPulse);
  const ratio = hp / maxHp;
  const colour = ratio > 0.5 ? '#4f9a3a' : ratio > 0.25 ? '#c9952a' : '#b02a22';
  const wind = stamina / maxStamina;
  return (
    <div className="card raised">
      {/* The key restarts the flash animation each time damage lands. */}
      <div key={hurtPulse} className={`portrait${hurtPulse ? ' hurt' : ''}${guarding ? ' guarding' : ''}`}>
        <img src={art.portrait} alt={name} />
      </div>
      <div className="card-body">
        <div className="title-row">
          <span className="name">{name}</span>
          <span className="class">{cls}</span>
        </div>
        <div className="hp-row" title="Health">
          <span>HP</span>
          <div className="bar">
            <i style={{ width: `${Math.max(0, ratio) * 100}%`, background: colour }} />
          </div>
          <span className="num" style={{ color: colour }}>
            {hp}/{maxHp}
          </span>
        </div>
        <div className="hp-row" title="Stamina: spent by attacks, blocks and dodges">
          <span>ST</span>
          <div className="bar stamina">
            <i style={{ width: `${Math.max(0, wind) * 100}%`, background: wind < 0.25 ? '#8a6a1c' : '#d8b23a' }} />
          </div>
          <span className="num">{stamina}</span>
        </div>
        <div className="weapon">
          <img src={art.sword} alt="" />
          {guarding ? 'Guard up' : weapon}
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
    // A fixed, readable cell size. Larger maps scroll to follow the party.
    const cell = 7;
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
        const doorHere = tile === TILE_DOORWAY ? world.doorAt.get(i)! : null;
        // A secret door is drawn as wall until it has been found.
        const hidden = doorHere?.def.kind === 'secret' && !state.doorsOpen[doorHere.def.id];
        if (tile === TILE_WALL || hidden) {
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
              const locked = door.def.lock && !state.doorsUnlocked[door.def.id];
              ctx.fillStyle = state.doorsOpen[door.def.id] ? '#5e4010' : locked ? '#d8553a' : '#cfa436';
              if (door.axis === 'ns') ctx.fillRect(px, py + 2, cell, 2);
              else ctx.fillRect(px + 2, py, 2, cell);
            }
          }
          if (world.blocked[i]) {
            const chest = world.chestAt.get(i);
            ctx.fillStyle = chest ? (state.chestsOpened[chest.id] ? '#9a701c' : '#f0d878') : '#473016';
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
      <Compass />
    </div>
  );
}

export function ObjectivePlate() {
  const quest = useHud((s) => s.quest);
  if (!quest) return <div className="plate objective raised" />;
  const next = quest.objectives.find((o) => !o.done && !o.optional);
  return (
    <div className={`plate objective raised${quest.completed ? ' done' : ''}`} title={quest.title}>
      {quest.completed ? 'Quest complete' : next ? next.text : quest.title}
    </div>
  );
}

/** What the party carries. A draught can be drunk by clicking it. */
export function Belt({ game }: { game: Game }) {
  const art = uiArt();
  const belt = useHud((s) => s.belt);
  const slots = [...belt, ...new Array<null>(Math.max(0, 6 - belt.length)).fill(null)].slice(0, 6);
  return (
    <div className="belt">
      {slots.map((item, i) =>
        item ? (
          <button
            key={item.itemId}
            className={`slot sunk${item.usable ? ' usable' : ''}`}
            title={`${item.name}. ${item.description}${item.usable ? ' (H to drink)' : ''}`}
            aria-label={item.name}
            onPointerDown={() => item.usable && game.drink()}
          >
            <img src={art.items[item.icon]} alt="" />
            {item.count > 1 && <span className="count">{item.count}</span>}
            {item.usable && <kbd>H</kbd>}
          </button>
        ) : (
          <div key={i} className="slot sunk" />
        ),
      )}
    </div>
  );
}

export function JournalOverlay() {
  const quest = useHud((s) => s.quest);
  return (
    <div className="overlay journal">
      <h2>Journal</h2>
      {quest ? (
        <>
          <h3>{quest.title}</h3>
          <p>{quest.description}</p>
          <ul>
            {quest.objectives.map((o) => (
              <li key={o.id} className={o.done ? 'done' : ''}>
                <span className="tick">{o.done ? 'X' : '-'}</span>
                {o.text}
                {o.optional && <em> (optional)</em>}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>No quests yet.</p>
      )}
      <div className="blink">Press B to close</div>
    </div>
  );
}

export function VictoryOverlay({ world }: { world: string }) {
  const quest = useHud((s) => s.quest);
  const hp = useHud((s) => s.hp);
  const maxHp = useHud((s) => s.maxHp);
  const belt = useHud((s) => s.belt);
  const bonus = quest?.objectives.filter((o) => o.optional) ?? [];
  const gold = belt.filter((b) => b.icon === 'coins').length > 0;
  return (
    <div className="overlay victory">
      <h2>Quest complete</h2>
      <h1>{quest?.title ?? world}</h1>
      <dl className="keys">
        <dt>Health left</dt>
        <dd>
          {hp} of {maxHp}
        </dd>
        {bonus.map((o) => (
          <Fragment key={o.id}>
            <dt>{o.text}</dt>
            <dd>{o.done ? 'Found' : 'Not found'}</dd>
          </Fragment>
        ))}
        <dt>Gold</dt>
        <dd>{gold ? 'Carried out' : 'Left behind'}</dd>
      </dl>
      <div className="blink">Enter to keep exploring - R to play again</div>
    </div>
  );
}

/** Which way the party faces, shown in the corner of the map. */
export function Compass() {
  const facing = useHud((s) => s.facing);
  return (
    <div className="compass" title="Facing">
      {FACING_LETTER[facing]}
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
  const guarding = useHud((s) => s.guarding);
  return (
    <div className="buttons">
      <button className="btn" title="Light attack: quick, cheap" onPointerDown={() => game.act('attack')}>
        Attack <kbd>J</kbd>
      </button>
      <button className="btn" title="Heavy attack: slow, hits hard, can break a wind-up" onPointerDown={() => game.act('heavy')}>
        Heavy <kbd>K</kbd>
      </button>
      <button
        className={`btn${guarding ? ' held' : ''}`}
        title="Hold to block. Raise it just as a blow lands to parry."
        onPointerDown={() => game.setGuard(true)}
        onPointerUp={() => game.setGuard(false)}
        onPointerLeave={() => game.setGuard(false)}
      >
        Block <kbd>L</kbd>
      </button>
      <button className="btn" title="Dodge: a quick step, back unless you are steering" onPointerDown={() => game.act('dodge')}>
        Dodge <kbd>Space</kbd>
      </button>
      <button className="btn" title="Open, unlock, search" onPointerDown={() => game.act('interact')}>
        Use <kbd>F</kbd>
      </button>
      <button className="btn" title="Quest journal" onPointerDown={() => game.toggleJournal()}>
        Journal <kbd>B</kbd>
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
      <dl className="keys wide">
        <dt>W A S D</dt>
        <dd>Step</dd>
        <dt>Q E</dt>
        <dd>Turn</dd>
        <dt>J / Click</dt>
        <dd>Attack</dd>
        <dt>K / Shift-click</dt>
        <dd>Heavy attack</dd>
        <dt>L / Right-click</dt>
        <dd>Block, parry</dd>
        <dt>Space</dt>
        <dd>Dodge</dd>
        <dt>F / Enter</dt>
        <dd>Open, search</dd>
        <dt>H</dt>
        <dd>Drink</dd>
        <dt>B</dt>
        <dd>Journal</dd>
        <dt>M</dt>
        <dd>Sound</dd>
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
