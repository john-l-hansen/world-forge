import { useCallback, useMemo, useRef, useState } from 'react';
import { GameScreen } from './ui/GameScreen';
import { loadWorld, loadWorldText, type LoadResult } from './world/load';
import { WORLDS } from './worlds';

/** The adventure named in the address (#party), or the first on the list. */
function keyFromAddress(): string {
  const wanted = window.location.hash.replace(/^#/, '');
  return WORLDS.some((w) => w.key === wanted) ? wanted : WORLDS[0].key;
}

/** A world opened from a file on the player's computer. */
interface OpenedFile {
  name: string;
  /** Counts files opened, so opening the same file twice starts it afresh. */
  serial: number;
  result: LoadResult;
}

/**
 * The player app. Every world, bundled or opened from a file, goes through the
 * same loader. An invalid world is reported, never played.
 */
export function App() {
  const [selection, setSelection] = useState(() => ({ key: keyFromAddress(), chosen: false }));
  const [opened, setOpened] = useState<OpenedFile | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const entry = WORLDS.find((w) => w.key === selection.key) ?? WORLDS[0];

  const bundled = useMemo(() => loadWorld(entry.data), [entry]);
  const loaded = opened ? opened.result : bundled;

  const choose = useCallback((key: string) => {
    // Keep the choice in the address so a reload, or a shared link, opens the same adventure.
    // Some embedded pages may not rewrite their address; the choice still takes effect.
    try {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${key}`);
    } catch {
      /* the address stays as it was */
    }
    setOpened(null);
    setSelection({ key, chosen: true });
  }, []);

  const openFile = useCallback(() => picker.current?.click(), []);

  /** Read a world file as text and load it. The text is data: it is parsed and checked, never run. */
  const readFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setOpened((previous) => ({ name: file.name, serial: (previous?.serial ?? 0) + 1, result: loadWorldText(text) }));
  }, []);

  const input = (
    <input
      ref={picker}
      className="world-file"
      type="file"
      accept=".json,application/json"
      aria-label="Open a world file"
      onChange={(e) => {
        void readFile(e.target.files?.[0]);
        e.target.value = '';
      }}
    />
  );

  if (!loaded.ok) {
    return (
      <div className="fatal">
        {input}
        <h1>{opened ? `${opened.name} cannot be played` : 'This world cannot be played yet'}</h1>
        <p>The world data failed validation, so the engine did not load it.</p>
        <ul>
          {loaded.issues.slice(0, 30).map((issue, i) => (
            <li key={i}>
              <code>{issue.code}</code> {issue.message}
            </li>
          ))}
        </ul>
        {loaded.issues.length > 30 && <p>And {loaded.issues.length - 30} more.</p>}
        {opened && (
          <p>
            <button onClick={() => setOpened(null)}>Back to the adventures</button> <button onClick={openFile}>Open another file</button>
          </p>
        )}
      </div>
    );
  }
  return (
    <>
      {input}
      <GameScreen
        key={opened ? `file:${opened.serial}` : entry.key}
        world={loaded.world}
        choices={WORLDS}
        current={opened ? '' : entry.key}
        autoBegin={opened ? true : selection.chosen}
        onChoose={choose}
        onOpenFile={openFile}
      />
    </>
  );
}
