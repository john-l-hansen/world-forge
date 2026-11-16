import { useMemo } from 'react';
import { validateWorld } from './schema/validate';
import { compileWorld } from './world/compile';
import { GameScreen } from './ui/GameScreen';
import minesJson from './worlds/forgotten-mines.json';

/**
 * The player app. It loads a world definition, validates it, and only then
 * hands it to the engine. An invalid world is reported, never played.
 */
export function App() {
  const loaded = useMemo(() => {
    const result = validateWorld(minesJson);
    return result.ok ? { ok: true as const, world: compileWorld(result.world) } : result;
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
  return <GameScreen world={loaded.world} />;
}
