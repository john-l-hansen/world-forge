/**
 * The in-game interface: a classic framed viewport with the party, map,
 * compass, controls and message log around it. It reads the interface store
 * and sends actions to the game; it holds no game rules.
 */
import { Fragment, useEffect, useRef } from 'react';
import type { Game } from '../game/game';
import type { Action } from '../game/input';
import { useHud, type PartyView } from '../game/store';
import type { SlotSummary } from '../game/saves';
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

/** What was just picked up: its icon and name across the lower view, for a moment. */
export function PickupBanner() {
  const art = uiArt();
  const pickup = useHud((s) => s.pickup);
  if (!pickup) return null;
  const names = pickup.items.map((i) => i.name);
  return (
    // The key replays the animation for each new pickup.
    <div key={pickup.serial} className="pickup raised" role="status">
      <span className="icons">
        {pickup.items.slice(0, 4).map((item) => (
          <img key={item.itemId} src={art.items[item.icon]} alt="" />
        ))}
      </span>
      <span className="what">
        <b>{names.length > 1 ? names.join(', ') : names[0]}</b>
        <em>{pickup.note}</em>
      </span>
    </div>
  );
}

export function Floaters() {
  const floaters = useHud((s) => s.floaters);
  return (
    <>
      {floaters.map((f) => (
        <div key={f.id} className={`floater ${f.kind}${f.slot !== undefined ? ` s${f.slot}` : ''}`}>
          {f.text}
        </div>
      ))}
    </>
  );
}

/** The party. One character gets the full card; a company gets a cell each. */
export function PartyPanel({ game }: { game: Game }) {
  const party = useHud((s) => s.party);
  if (party.length <= 1) return <PartyCard game={game} />;
  return (
    <div className="party" role="group" aria-label="Party">
      {party.map((member) => (
        <PartyCell key={member.id} game={game} member={member} />
      ))}
    </div>
  );
}

function PartyCell({ game, member }: { game: Game; member: PartyView }) {
  const art = uiArt();
  const dead = member.hp <= 0;
  const ratio = member.hp / member.maxHp;
  const colour = ratio > 0.5 ? '#4f9a3a' : ratio > 0.25 ? '#c9952a' : '#b02a22';
  return (
    <button
      className={`cell raised${member.hand ? ' armed' : ''}${member.active ? ' active' : ''}${dead ? ' fallen' : ''}${member.row === 'back' ? ' back' : ''}${member.busy === 'cast' ? ' casting' : ''}`}
      data-member={member.id}
      aria-pressed={member.active}
      title={`${member.name}, ${member.className.toLowerCase()} level ${member.level}, ${member.row} row. Health ${member.hp}/${member.maxHp}, stamina ${member.stamina}/${member.maxStamina}${
        member.maxMana > 0 ? `, mana ${member.mana}/${member.maxMana}` : ''
      }.${member.active ? ' You are playing this character. Click for the character sheet.' : dead ? '' : ' Click to play this character.'}`}
      // Clicking the character you drive opens their sheet; clicking another takes them over.
      onPointerDown={() => (member.active ? game.toggleSheet() : game.takeControl(member.id))}
    >
      {/* The keys restart the flashes each time a blow or a healing lands. */}
      <span key={`${member.hurt}:${member.mended}`} className={`face${member.hurt ? ' hurt' : ''}${member.mended ? ' mended' : ''}${member.guarding ? ' guarding' : ''}`}>
        <i style={{ backgroundImage: `url(${art.portraits[member.portrait]})` }} />
        <b>{member.row === 'front' ? 'F' : 'B'}</b>
      </span>
      <span className="cell-body">
        <span className="name">{member.name}</span>
        <span className="bar" title="Health">
          <i style={{ width: `${Math.max(0, ratio) * 100}%`, background: colour }} />
        </span>
        <span className="bar stamina" title="Stamina">
          <i style={{ width: `${Math.max(0, member.stamina / member.maxStamina) * 100}%` }} />
        </span>
        {member.maxMana > 0 ? (
          <span className="bar mana" title="Mana">
            <i style={{ width: `${Math.max(0, member.mana / member.maxMana) * 100}%` }} />
          </span>
        ) : (
          <span className="bar none" />
        )}
      </span>
      {/* Their hand: flashes when a blow lands, greys while they recover, glows blue while they cast. */}
      {member.hand && (
        <span
          key={member.struck}
          className={`hand sunk${member.struck ? ' struck' : ''}${member.busy === 'attack' ? ' recovering' : ''}${member.busy === 'cast' ? ' casting' : ''}`}
          title={member.busy === 'cast' ? 'Casting' : member.busy === 'attack' ? 'Striking' : 'Ready'}
        >
          <img src={art.items[member.hand]} alt="" />
        </span>
      )}
    </button>
  );
}

/** The driven character's spells, each on a number key. */
export function SpellBar({ game }: { game: Game }) {
  const spells = useHud((s) => s.spells);
  if (spells.length === 0) return null;
  return (
    <div className="spells">
      {spells.slice(0, 4).map((spell, i) => (
        <button
          key={spell.id}
          className={`btn${spell.ready ? '' : ' spent'}`}
          title={`${spell.name}. ${spell.description} Costs ${spell.cost} mana.${spell.ready ? '' : ' Not enough mana yet.'}`}
          onPointerDown={() => game.castSpell(i)}
        >
          <kbd>{i + 1}</kbd> {spell.name} <em>{spell.cost}</em>
        </button>
      ))}
    </div>
  );
}

export function PartyCard({ game }: { game: Game }) {
  const art = uiArt();
  const name = useHud((s) => s.heroName);
  const cls = useHud((s) => s.heroClass);
  const hp = useHud((s) => s.hp);
  const maxHp = useHud((s) => s.maxHp);
  const stamina = useHud((s) => s.stamina);
  const maxStamina = useHud((s) => s.maxStamina);
  const guarding = useHud((s) => s.guarding);
  const level = useHud((s) => s.level);
  const xpProgress = useHud((s) => s.xpProgress);
  const hurtPulse = useHud((s) => s.hurtPulse);
  const ratio = hp / maxHp;
  const colour = ratio > 0.5 ? '#4f9a3a' : ratio > 0.25 ? '#c9952a' : '#b02a22';
  const wind = stamina / maxStamina;
  return (
    <div className="card raised">
      {/* The key restarts the flash animation each time damage lands. */}
      <button
        key={hurtPulse}
        className={`portrait${hurtPulse ? ' hurt' : ''}${guarding ? ' guarding' : ''}`}
        title={`${name}: open the character sheet (C)`}
        onPointerDown={() => game.toggleSheet()}
      >
        <img src={art.portrait} alt={name} />
      </button>
      <div className="card-body">
        <div className="title-row">
          <span className="name">{name}</span>
          <span className="class" title={cls}>
            Lv {level}
          </span>
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
        <div className="hp-row" title="Experience towards the next level">
          <span>XP</span>
          <div className="bar xp">
            <i style={{ width: `${xpProgress * 100}%` }} />
          </div>
          <span className="num guard">{guarding ? 'Guard' : ''}</span>
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
        // A secret door or a breakable wall is drawn as wall until it has been opened.
        const hidden = (doorHere?.def.kind === 'secret' || doorHere?.def.kind === 'breakable') && !state.doorsOpen[doorHere.def.id];
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
  const quests = useHud((s) => s.quests);
  if (quests.length === 0) return <div className="plate objective raised" />;
  // The next thing to do: the first open quest, main quests first.
  const quest = quests.find((q) => !q.completed) ?? quests[0];
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
  const fresh = useHud((s) => s.beltFresh);
  const slots = [...belt, ...new Array<null>(Math.max(0, 6 - belt.length)).fill(null)].slice(0, 6);
  return (
    <div className="belt">
      {slots.map((item, i) =>
        item ? (
          <button
            // A fresh item gets a new key, which replays its flash.
            key={fresh.itemIds.includes(item.itemId) ? `${item.itemId}:${fresh.serial}` : item.itemId}
            className={`slot sunk${item.action ? ' usable' : ''}${fresh.itemIds.includes(item.itemId) ? ' fresh' : ''}`}
            title={`${item.name}. ${item.description}${
              item.action === 'drink' ? ' (click or H to drink)' : item.action === 'read' ? ' (click or R to read)' : item.action === 'equip' ? ' (click to equip)' : ''
            }`}
            aria-label={item.name}
            onPointerDown={() => item.action && game.useItem(item.itemId)}
          >
            <img src={art.items[item.icon]} alt="" />
            {item.count > 1 && <span className="count">{item.count}</span>}
            {item.action === 'drink' && <kbd>H</kbd>}
            {item.action === 'read' && <kbd>R</kbd>}
          </button>
        ) : (
          <div key={i} className="slot sunk" />
        ),
      )}
    </div>
  );
}

export function JournalOverlay() {
  const quests = useHud((s) => s.quests);
  // One quest gets the whole page; several are set out more tightly.
  const many = quests.length > 1;
  return (
    <div className={`overlay journal${many ? ' many' : ''}`}>
      <h2>Journal</h2>
      {quests.length === 0 && <p>No quests yet.</p>}
      {quests.map((quest) => (
        <Fragment key={quest.id}>
          <h3 className={quest.completed ? 'done' : ''}>
            {quest.title}
            {!quest.main && <em> (side quest)</em>}
          </h3>
          {!many && <p>{quest.description}</p>}
          <ul>
            {quest.objectives.map((o) => (
              <li key={o.id} className={o.done ? 'done' : ''}>
                <span className="tick">{o.done ? 'X' : '-'}</span>
                {o.text}
                {o.optional && <em> (optional)</em>}
              </li>
            ))}
          </ul>
        </Fragment>
      ))}
      <div className="blink">Press B to close</div>
    </div>
  );
}

export function SheetOverlay({ game }: { game: Game }) {
  const sheet = useHud((s) => s.sheet);
  if (!sheet) return null;
  const sign = (n: number) => (n >= 0 ? `+${n}` : String(n));
  return (
    <div className="overlay sheet">
      <h3>{sheet.name}</h3>
      <h2>
        {sheet.className}, level {sheet.level}. {sheet.role}
      </h2>
      <div className="columns">
        <dl className="keys">
          {sheet.attributes.map((a) => (
            <Fragment key={a.label}>
              <dt className={a.primary ? 'primary' : ''}>{a.label}</dt>
              <dd>
                {a.value} <em>{sign(a.modifier)}</em>
              </dd>
            </Fragment>
          ))}
        </dl>
        <dl className="keys">
          <dt>Health</dt>
          <dd>{sheet.health}</dd>
          <dt>Stamina</dt>
          <dd>{sheet.stamina}</dd>
          {sheet.mana && (
            <>
              <dt>Mana</dt>
              <dd>{sheet.mana}</dd>
            </>
          )}
          <dt>{sheet.weapon}</dt>
          <dd>{sheet.light}</dd>
          <dt>Heavy blow</dt>
          <dd>{sheet.heavy}</dd>
          <dt>Critical</dt>
          <dd>{sheet.critical}</dd>
          <dt>Defence</dt>
          <dd>{sheet.defence}</dd>
          <dt>Block</dt>
          <dd>{sheet.block}</dd>
        </dl>
      </div>
      {sheet.spells.length > 0 && <h2>Knows {sheet.spells.join(', ')}.</h2>}
      <div className="worn">
        {sheet.canChangeRow && (
          <button
            className="btn row"
            title={
              sheet.row === 'front'
                ? 'Front row: strikes with weapons and takes the blows from ahead. Click to fall back.'
                : 'Back row: out of reach of blows from ahead, and of its own weapons. Click to step forward.'
            }
            onPointerDown={(ev) => {
              ev.stopPropagation();
              game.toggleRow();
            }}
          >
            {sheet.row === 'front' ? 'Front row' : 'Back row'}
          </button>
        )}
        {sheet.equipment.length === 0 && <span>Nothing worn or held.</span>}
        {sheet.equipment.map((e) => (
          <button
            key={e.slot}
            className="btn"
            title={`${e.label}: ${e.name}. ${e.detail}. Click to take off.`}
            onPointerDown={(ev) => {
              ev.stopPropagation();
              game.unequip(e.slot as Parameters<Game['unequip']>[0]);
            }}
          >
            {e.name}
          </button>
        ))}
      </div>
      <h2>
        Experience {sheet.xp}. Level {sheet.level + 1} at {sheet.nextLevel}.
      </h2>
      <div className="blink">{sheet.canChangeRow ? 'Tab for the next character - C to close' : 'Click an item to take it off - C to close'}</div>
    </div>
  );
}

export function VictoryOverlay({ world, created }: { world: string; created: boolean }) {
  const quest = useHud((s) => s.quest);
  const hp = useHud((s) => s.hp);
  const maxHp = useHud((s) => s.maxHp);
  const belt = useHud((s) => s.belt);
  const party = useHud((s) => s.party);
  const standing = party.filter((m) => m.hp > 0).length;
  const quests = useHud((s) => s.quests);
  const bonus = quest?.objectives.filter((o) => o.optional) ?? [];
  const side = quests.filter((q) => !q.main);
  const gold = belt.filter((b) => b.icon === 'coins').length > 0;
  return (
    <div className="overlay victory">
      <h2>Quest complete</h2>
      <h1>{quest?.title ?? world}</h1>
      <dl className="keys">
        {party.length > 1 ? (
          <>
            <dt>Still standing</dt>
            <dd>
              {standing} of {party.length}
            </dd>
          </>
        ) : (
          <>
            <dt>Health left</dt>
            <dd>
              {hp} of {maxHp}
            </dd>
          </>
        )}
        {bonus.map((o) => (
          <Fragment key={o.id}>
            <dt>{o.text}</dt>
            <dd>{o.done ? 'Found' : 'Not found'}</dd>
          </Fragment>
        ))}
        {side.map((q) => (
          <Fragment key={q.id}>
            <dt>{q.title}</dt>
            <dd>{q.completed ? 'Done' : 'Not done'}</dd>
          </Fragment>
        ))}
        <dt>Gold</dt>
        <dd>{gold ? 'Carried out' : 'Left behind'}</dd>
      </dl>
      <div className="blink">Enter to keep exploring - R to play again{created ? ' - N for the creator' : ''}</div>
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
      <button className="btn wide" title="Quest journal" onPointerDown={() => game.toggleJournal()}>
        Journal <kbd>B</kbd>
      </button>
      <button className="btn" title="Character sheet: attributes, what is worn and held" onPointerDown={() => game.toggleSheet()}>
        Sheet <kbd>C</kbd>
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

export interface TitleChoice {
  key: string;
  label: string;
  blurb: string;
}

export function TitleOverlay({
  title,
  choices,
  current,
  onChoose,
  onOpenFile,
  onCreate,
  created,
  saved,
  onContinue,
}: {
  title: string;
  choices: TitleChoice[];
  current: string;
  onChoose: (key: string) => void;
  onOpenFile: () => void;
  onCreate: () => void;
  created: boolean;
  /** The latest save, offered as Continue. */
  saved: SlotSummary | null;
  onContinue: () => void;
}) {
  return (
    <div className="overlay title">
      <h2>World Forge presents</h2>
      <h1>{title}</h1>
      {choices.length > 1 && (
        <div className="choices">
          {saved && (
            <button
              className="btn wide continue"
              title={`Continue ${saved.label}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onContinue();
              }}
            >
              <kbd>C</kbd> Continue: {saved.label}
            </button>
          )}
          {choices.map((choice, i) => (
            <button
              key={choice.key}
              className={`btn${choice.key === current ? ' chosen' : ''}`}
              title={choice.blurb}
              onPointerDown={(e) => {
                e.stopPropagation();
                onChoose(choice.key);
              }}
            >
              <kbd>{i + 1}</kbd> {choice.label}
            </button>
          ))}
          <button
            className="btn"
            title="Open a world file (.json) from this computer. It is checked before it is played."
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onOpenFile();
            }}
          >
            <kbd>O</kbd> Open file
          </button>
          <button
            className="btn create"
            title="Make a new adventure by describing it"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onCreate();
            }}
          >
            <kbd>N</kbd> {created ? 'Back to creator' : 'Create'}
          </button>
        </div>
      )}
      <dl className="keys wide">
        <dt>W A S D</dt>
        <dd>Step</dd>
        <dt>Q E</dt>
        <dd>Turn</dd>
        <dt>J / Click</dt>
        <dd>Attack</dd>
        <dt>K / Shift-click</dt>
        <dd>Heavy attack</dd>
        <dt>Space</dt>
        <dd>Dodge</dd>
        <dt>L / Right-click</dt>
        <dd>Block, parry</dd>
        <dt>F / Enter</dt>
        <dd>Open, search</dd>
        <dt>H / R</dt>
        <dd>Drink, read</dd>
        <dt>B / C</dt>
        <dd>Journal, sheet</dd>
        <dt>M</dt>
        <dd>Sound</dd>
        <dt>Tab</dt>
        <dd>Next character</dd>
        <dt>1 - 4</dt>
        <dd>Cast a spell</dd>
        <dt>F5 / F9</dt>
        <dd>Save, load</dd>
      </dl>
      <div className="blink">{choices.length > 1 ? `Press 1 to ${choices.length} to choose - any other key to enter` : 'Press any key or click to enter'}</div>
    </div>
  );
}

export function DeathOverlay({ name, created, canLoad }: { name: string; created: boolean; canLoad: boolean }) {
  const company = useHud((s) => s.party.length > 1);
  return (
    <div className="overlay dead">
      <h1>{company ? 'The party has fallen' : `${name} has fallen`}</h1>
      <div className="blink">
        Press R to begin again{canLoad ? ' - L to load the last save' : ''}
        {created ? ' - N for the creator' : ''}
      </div>
    </div>
  );
}
