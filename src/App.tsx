import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CreatorScreen, freshCreator, type CreatorMemory } from './creator-ui/CreatorScreen';
import { GameScreen } from './ui/GameScreen';
import { loadWorld, loadWorldText, type LoadResult } from './world/load';
import { looksLikeSave, readSaveText, type ReadSaveResult } from './engine/save';
import type { SessionState } from './engine/types';
import { latestSlot, readSlot, type SlotId } from './game/saves';
import { pushLog } from './game/store';
import { WORLDS } from './worlds';

/** The adventure named in the address (#party), or the first on the list. */
function keyFromAddress(): string {
  const wanted = window.location.hash.replace(/^#/, '');
  return WORLDS.some((w) => w.key === wanted) ? wanted : WORLDS[0].key;
}

/** A world opened from a file on the player's computer, or made in the creator. */
interface OpenedFile {
  name: string;
  /** Counts files opened, so opening the same file twice starts it afresh. */
  serial: number;
  result: LoadResult;
  /** Made in the creator: going back from it returns there. */
  created?: boolean;
  /** Opened from a save: the game resumes from this state. */
  session?: SessionState;
  seed?: number;
  savedAt?: number;
}

/** A save that passed its checks, as an opened world. */
function fromSave(name: string, serial: number, read: Extract<ReadSaveResult, { ok: true }>): OpenedFile {
  return { name, serial, result: { ok: true, world: read.world }, created: read.save.created, session: read.session, seed: read.save.seed, savedAt: read.save.savedAt };
}

/** Whether the text is a save rather than a world file. Text that is not JSON is neither; the world loader reports it. */
function isSaveText(text: string): boolean {
  try {
    return looksLikeSave(JSON.parse(text));
  } catch {
    return false;
  }
}

/**
 * The player app. Every world, bundled or opened from a file, goes through the
 * same loader. An invalid world is reported, never played.
 */
export function App() {
  const [selection, setSelection] = useState(() => ({ key: keyFromAddress(), chosen: false }));
  const [opened, setOpened] = useState<OpenedFile | null>(null);
  // The creator, and what it remembers while the person goes off to play.
  const [creating, setCreating] = useState(() => window.location.hash === '#create');
  const [creator, setCreator] = useState<CreatorMemory>(freshCreator);
  // A link to #create opens the creator, even on a page already open.
  useEffect(() => {
    const onHash = () => window.location.hash === '#create' && setCreating(true);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
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
  const openCreator = useCallback(() => setCreating(true), []);

  /** Read a world file as text and load it. The text is data: it is parsed and checked, never run. */
  const readFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    // A save file holds its own world; it is checked the same way and resumes where it was left.
    if (isSaveText(text)) {
      const read = readSaveText(text);
      setOpened((previous) => {
        const serial = (previous?.serial ?? 0) + 1;
        return read.ok ? fromSave(file.name, serial, read) : { name: file.name, serial, result: { ok: false, issues: read.issues } };
      });
      return;
    }
    setOpened((previous) => ({ name: file.name, serial: (previous?.serial ?? 0) + 1, result: loadWorldText(text) }));
  }, []);

  /** Load the game in a save slot, or the most recent one. A save that fails its checks is reported, never played. */
  const loadSlot = useCallback((slot?: SlotId) => {
    const which = slot ?? latestSlot()?.slot;
    const read = which ? readSlot(which) : null;
    if (!read) {
      pushLog('There is no saved game.', 'warn');
      return;
    }
    if (!read.ok) {
      pushLog(`The saved game could not be loaded: ${read.issues[0]?.message ?? 'it is damaged.'}`, 'warn');
      return;
    }
    setOpened((previous) => fromSave(read.save.label, (previous?.serial ?? 0) + 1, read));
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

  if (creating) {
    return (
      <CreatorScreen
        memory={creator}
        onChange={setCreator}
        onPlay={(world) => {
          // The generated world goes through the same loader as any other.
          setOpened((previous) => ({ name: world.world.name, serial: (previous?.serial ?? 0) + 1, result: loadWorld(world), created: true }));
          setCreating(false);
        }}
        onLeave={() => setCreating(false)}
      />
    );
  }

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
        // A made world opens on its own title, as a reveal; a file or a save goes straight in.
        autoBegin={opened ? Boolean(opened.session) || !opened.created : selection.chosen}
        resume={opened?.session}
        seed={opened?.seed}
        savedAt={opened?.savedAt}
        onLoadSave={loadSlot}
        created={Boolean(opened?.created)}
        onChoose={choose}
        onOpenFile={openFile}
        onCreate={openCreator}
      />
    </>
  );
}
