/**
 * The Dungeon Master's screen: the world's hidden state, read straight from
 * the simulation, and the first commands a Dungeon Master can give. Retro,
 * like everything else: a ledger in the same pixel font and stone frame.
 */
import { useHud } from '../game/store';

export const DM_SKIPS = [
  { key: '1', label: '1 hour', minutes: 60 },
  { key: '2', label: '8 hours', minutes: 480 },
  { key: '3', label: '1 day', minutes: 1440 },
] as const;

export function DmOverlay({ onSkip }: { onSkip: (minutes: number) => void }) {
  const dm = useHud((s) => s.dm);
  if (!dm) return null;
  const creatures = dm.creatures.slice(0, 6);
  return (
    <div className="overlay dm" onPointerDown={(e) => e.stopPropagation()}>
      <header>
        <span className="title">Dungeon Master</span>
        <span className="clock">{dm.clock}</span>
      </header>
      <h4>Creatures</h4>
      <table className="ledger">
        <tbody>
          {creatures.map((c) => (
            <tr key={c.id} className={c.state.replace(' ', '-')}>
              <td>{c.name}</td>
              <td>{c.place}</td>
              <td>{c.state}</td>
              <td className="num">
                {c.hp}/{c.maxHp}
              </td>
            </tr>
          ))}
          {dm.creatures.length > creatures.length && (
            <tr>
              <td colSpan={4}>and {dm.creatures.length - creatures.length} more</td>
            </tr>
          )}
        </tbody>
      </table>
      <h4>History</h4>
      <table className="ledger history">
        <tbody>
          {dm.history.slice(0, 6).map((h) => (
            <tr key={h.id}>
              <td className="when">{h.when}</td>
              <td>{h.text}</td>
              <td className="seen">{h.seen}</td>
            </tr>
          ))}
          {dm.history.length === 0 && (
            <tr>
              <td>Nothing has happened yet.</td>
            </tr>
          )}
        </tbody>
      </table>
      <footer>
        <span>Pass time:</span>
        {DM_SKIPS.map((s) => (
          <button key={s.key} className="btn" onClick={() => onSkip(s.minutes)}>
            <kbd>{s.key}</kbd> {s.label}
          </button>
        ))}
        <span className="close">F2 close</span>
      </footer>
    </div>
  );
}
