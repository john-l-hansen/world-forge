import { useCallback, useMemo, useState } from 'react';
import { validateWorld } from './schema/validate';
import { compileWorld } from './world/compile';
import { GameScreen } from './ui/GameScreen';
import { WORLDS } from './worlds';

/** The adventure named in the address (#party), or the first on the list. */
function keyFromAddress(): string {
  const wanted = window.location.hash.replace(/^#/, '');
  return WORLDS.some((w) => w.key === wanted) ? wanted : WORLDS[0].key;
}

/**
 * The player app. It loads a world definition, validates it, and only then
 * hands it to the engine. An invalid world is reported, never played.
 */
export function App() {
  const [selection, setSelection] = useState(() => ({ key: keyFromAddress(), chosen: false }));
  const entry = WORLDS.find((w) => w.key === selection.key) ?? WORLDS[0];

  const loaded = useMemo(() => {
    const result = validateWorld(entry.data);
    return result.ok ? { ok: true as const, world: compileWorld(result.world) } : result;
  }, [entry]);

  const choose = useCallback((key: string) => {
    // Keep the choice in the address so a reload, or a shared link, opens the same adventure.
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${key}`);
    setSelection({ key, chosen: true });
  }, []);

  if (!loaded.ok) {
    return (
      <div className="fatal">
        <h1>This world cannot be played yet</h1>
        <p>The world data failed validation, so the engine did not load it.</p>
        <ul>
          {loaded.issues.map((issue, i) => (
            <li key={i}>
              <code>{issue.code}</code> {issue.message}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return <GameScreen key={entry.key} world={loaded.world} choices={WORLDS} current={entry.key} autoBegin={selection.chosen} onChoose={choose} />;
}
