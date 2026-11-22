/**
 * The world creator: a short conversation with a designer, a few questions
 * with suggestions and defaults, then a generated world to inspect, play or
 * take away as a file. It talks to the generator and the validator only;
 * the engine never sees anything that did not validate.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CONCEPT_EXAMPLES, DEFAULT_BRIEF, readConcept, type AdventureBrief } from '../creator/brief';
import { generateWorld, type GenerationResult } from '../creator/generate';
import { slug } from '../creator/assemble';
import { serializeWorld } from '../schema/validate';
import type { WorldDefinition } from '../schema/world';
import { uiArt } from '../ui/art';
import { drawWorldMap } from './map';
import { QUESTIONS } from './questions';
import './creator.css';

const LOGICAL_W = 480;
const LOGICAL_H = 270;

/** What the creator remembers between visits, so going to play and back loses nothing. */
export interface CreatorMemory {
  brief: AdventureBrief;
  /** -1: the opening question. QUESTIONS.length: all asked. */
  step: number;
  seed: number;
  result: GenerationResult | null;
}

export const freshCreator = (): CreatorMemory => ({ brief: { ...DEFAULT_BRIEF }, step: -1, seed: 1, result: null });

/** A seed from the words, so the same description gives the same world. */
function seedOf(text: string) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % 100000;
}

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

export function CreatorScreen({
  memory,
  onChange,
  onPlay,
  onLeave,
}: {
  memory: CreatorMemory;
  onChange: (memory: CreatorMemory) => void;
  onPlay: (world: WorldDefinition) => void;
  onLeave: () => void;
}) {
  const scale = useWholeNumberScale();
  const art = uiArt();
  const { brief, step, result } = memory;
  const [draft, setDraft] = useState(brief.concept);
  const [busy, setBusy] = useState(false);
  /** What was read from the description, to show the person what was understood. */
  const [understood, setUnderstood] = useState<string[]>([]);
  const talk = useRef<HTMLDivElement>(null);
  const set = (patch: Partial<CreatorMemory>) => onChange({ ...memory, ...patch });

  // Keep the newest part of the conversation in view.
  useEffect(() => {
    talk.current?.scrollTo({ top: talk.current.scrollHeight });
  }, [step, result, busy]);

  const generate = async (b: AdventureBrief, seed: number) => {
    setBusy(true);
    const r = await generateWorld(b, seed);
    setBusy(false);
    onChange({ ...memory, brief: b, step: QUESTIONS.length, seed: r.ok ? r.seed : seed, result: r });
  };

  const beginWith = (text: string) => {
    const read = readConcept(text);
    const b: AdventureBrief = { ...DEFAULT_BRIEF, ...read, concept: text };
    setUnderstood(describeReading(read));
    onChange({ ...memory, brief: b, step: 0, seed: seedOf(text), result: null });
  };

  const answer = (patch: Partial<AdventureBrief>) => {
    const b = { ...brief, ...patch };
    const next = step + 1;
    if (next >= QUESTIONS.length) void generate(b, memory.seed);
    else set({ brief: b, step: next });
  };

  // Number keys pick a suggestion; Enter keeps the one already marked.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'INPUT') return;
      if (step >= 0 && step < QUESTIONS.length) {
        const question = QUESTIONS[step];
        const n = Number(e.key);
        if (n >= 1 && n <= question.choices.length) answer({ [question.key]: question.choices[n - 1].value } as Partial<AdventureBrief>);
        else if (e.key === 'Enter') answer({});
      } else if (result?.ok && e.key.toLowerCase() === 'p') onPlay(result.world);
      if (e.key === 'Escape') onLeave();
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  });

  const download = () => {
    if (!result?.ok) return;
    const blob = new Blob([serializeWorld(result.world)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${slug(result.world.world.name)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="stage">
      <div className="screen creator" style={{ zoom: scale, backgroundImage: `url(${art.panel})` }}>
        <div className="talk sunk" ref={talk}>
          <p className="designer">
            <b>Designer</b> What kind of adventure would you like to create? Tell me in a sentence or two, or start from one of these.
          </p>
          {step === -1 ? (
            <div className="concept">
              <textarea
                value={draft}
                maxLength={400}
                placeholder="Goblins have taken an old mine..."
                aria-label="Describe your adventure"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    beginWith(draft);
                  }
                }}
              />
              <div className="examples">
                {CONCEPT_EXAMPLES.map((ex) => (
                  <button key={ex} className="example" onClick={() => setDraft(ex)}>
                    {ex}
                  </button>
                ))}
              </div>
              <div className="row">
                <button className="btn go" onClick={() => beginWith(draft)}>
                  {draft.trim() ? 'Continue' : 'Surprise me'} <kbd>Enter</kbd>
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="you">{brief.concept.trim() || 'Surprise me.'}</p>
              {understood.length > 0 && (
                <p className="designer">
                  <b>Designer</b> I read that as: {understood.join(', ')}. I have marked those below; change any you like.
                </p>
              )}
              {QUESTIONS.slice(0, Math.max(0, step)).map((question) => (
                <div key={question.key}>
                  <p className="designer">
                    <b>Designer</b> {question.ask}
                  </p>
                  <p className="you">{question.answered(brief)}</p>
                </div>
              ))}
              {step >= 0 && step < QUESTIONS.length && (
                <div className="asking">
                  <p className="designer">
                    <b>Designer</b> {QUESTIONS[step].ask}
                  </p>
                  <div className="options">
                    {QUESTIONS[step].choices.map((choice, i) => {
                      const current = brief[QUESTIONS[step].key] === choice.value;
                      return (
                        <button
                          key={String(choice.value)}
                          className={`option${current ? ' current' : ''}`}
                          onClick={() => answer({ [QUESTIONS[step].key]: choice.value } as Partial<AdventureBrief>)}
                        >
                          <kbd>{i + 1}</kbd>
                          <span>
                            {choice.label}
                            {choice.hint && <em>{choice.hint}</em>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="row">
                    <button className="btn" onClick={() => answer({})}>
                      Keep the marked one <kbd>Enter</kbd>
                    </button>
                    <button className="btn" onClick={() => void generate(brief, memory.seed)} title="Keep everything marked and draw up the world now">
                      Decide the rest
                    </button>
                  </div>
                </div>
              )}
              {busy && (
                <p className="designer">
                  <b>Designer</b> Drawing it up...
                </p>
              )}
              {result && !busy && <Outcome result={result} />}
            </>
          )}
        </div>
        <Side
          memory={memory}
          busy={busy}
          onExtras={(patch) => set({ brief: { ...brief, ...patch } })}
          onRegenerate={() => void generate(brief, memory.seed + 101)}
          onRebuild={() => void generate(brief, memory.seed)}
          onPlay={() => result?.ok && onPlay(result.world)}
          onDownload={download}
          onRestart={() => {
            setDraft(brief.concept);
            setUnderstood([]);
            set({ step: -1, result: null });
          }}
          onLeave={onLeave}
        />
      </div>
    </div>
  );
}

/** What the designer says once the world is drawn up: a summary, and how validation went. */
function Outcome({ result }: { result: GenerationResult }) {
  if (!result.ok) {
    return (
      <div className="outcome bad">
        <p className="designer">
          <b>Designer</b> I could not make that one work. After {result.attempts.length} tries, this is what stood in the way:
        </p>
        <ul>
          {result.attempts.slice(-3).map((a) => (
            <li key={a.seed}>{a.problem}</li>
          ))}
        </ul>
        <p className="designer">Try a smaller place, or another layout.</p>
      </div>
    );
  }
  const { world, plan } = result;
  const fights = world.encounters.reduce((n, e) => n + e.placements.length, 0);
  const retries = result.attempts.length - 1;
  return (
    <div className="outcome">
      <p className="designer">
        <b>Designer</b> Here is <span className="name">{world.world.name}</span>: {plan.summary}
      </p>
      <p className="designer">
        {world.rooms.length} rooms, {fights} enemies, {world.quests.length === 1 ? 'one quest' : `${world.quests.length} quests`}
        {world.doors.some((d) => d.kind === 'breakable') ? ', and a cracked wall somewhere' : ''}.
      </p>
      <p className="valid">
        Checked: valid, and ready to play.{retries > 0 ? ` (${retries === 1 ? 'One layout' : `${retries} layouts`} did not fit and ${retries === 1 ? 'was' : 'were'} redrawn.)` : ''}
      </p>
    </div>
  );
}

function Side({
  memory,
  busy,
  onExtras,
  onRegenerate,
  onRebuild,
  onPlay,
  onDownload,
  onRestart,
  onLeave,
}: {
  memory: CreatorMemory;
  busy: boolean;
  onExtras: (patch: Partial<AdventureBrief>) => void;
  onRegenerate: () => void;
  onRebuild: () => void;
  onPlay: () => void;
  onDownload: () => void;
  onRestart: () => void;
  onLeave: () => void;
}) {
  const { brief, result } = memory;
  const canvas = useRef<HTMLCanvasElement>(null);
  const world = result?.ok ? result.world : null;
  useEffect(() => {
    if (world && canvas.current) drawWorldMap(canvas.current, world, 180, 110);
  }, [world]);
  const asked = memory.step >= QUESTIONS.length;
  const extrasChanged = useMemo(() => result?.ok && (result.plan.brief.secrets !== brief.secrets || result.plan.brief.sideQuest !== brief.sideQuest), [result, brief]);

  return (
    <div className="side">
      <div className="plate title raised">{world ? world.world.name : 'A new adventure'}</div>
      <div className="mapbox sunk">
        {world ? (
          <canvas ref={canvas} className="worldmap" aria-label={`Map of ${world.world.name}`} />
        ) : (
          <p className="empty">{busy ? 'Drawing it up...' : 'The map appears here once the world is drawn up.'}</p>
        )}
      </div>
      {world && (
        <div className="legend">
          <span><i style={{ background: '#8fbf5a' }} />you</span>
          <span><i style={{ background: '#c83a2a' }} />foe</span>
          <span><i style={{ background: '#f0d878' }} />chest</span>
          <span><i style={{ background: '#d8553a' }} />locked</span>
          <span><i style={{ background: '#d07a2a' }} />crack</span>
        </div>
      )}
      <div className="extras">
        <label>
          <input type="checkbox" checked={brief.secrets} onChange={(e) => onExtras({ secrets: e.target.checked })} /> A hidden room behind a cracked wall
        </label>
        <label>
          <input type="checkbox" checked={brief.sideQuest} onChange={(e) => onExtras({ sideQuest: e.target.checked })} /> A side quest
        </label>
        {brief.objective === 'relic' && (
          <label className="relic">
            Treasure
            <input
              type="text"
              value={brief.relicName ?? ''}
              maxLength={32}
              placeholder="decide for me"
              aria-label="The treasure's name"
              onChange={(e) => onExtras({ relicName: e.target.value.trim() ? e.target.value : undefined })}
            />
          </label>
        )}
      </div>
      <div className="actions">
        {world && (
          <button className="btn play" onClick={onPlay}>
            Play <kbd>P</kbd>
          </button>
        )}
        {asked && (
          <button className="btn" onClick={extrasChanged ? onRebuild : onRegenerate} disabled={busy}>
            {extrasChanged ? 'Apply changes' : 'Another layout'}
          </button>
        )}
        {world && (
          <button className="btn" onClick={onDownload} title="Save this world as a file you can open again from the title screen">
            Download
          </button>
        )}
        <button className="btn" onClick={onRestart}>
          Start over
        </button>
        <button className="btn" onClick={onLeave}>
          Back <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  );
}

/** Say what was read from the description, in a few words each. */
function describeReading(read: Partial<AdventureBrief>): string[] {
  const out: string[] = [];
  if (read.title) out.push(`a title, "${read.title}"`);
  if (read.setting) out.push({ mine: 'old mines', crypt: 'a crypt', both: 'mines over a tomb' }[read.setting]);
  if (read.inhabitants) out.push({ goblins: 'goblins', undead: 'the dead', mixed: 'goblins and the dead' }[read.inhabitants]);
  if (read.atmosphere) out.push(read.atmosphere.replace('_', ' '));
  if (read.scale) out.push(`${read.scale} size`);
  if (read.difficulty) out.push(read.difficulty);
  if (read.party) out.push({ fighter: 'a lone fighter', pair: 'a pair', four: 'a party of four' }[read.party]);
  if (read.relicName) out.push(`the ${read.relicName}`);
  else if (read.objective) out.push(read.objective === 'relic' ? 'a treasure to bring out' : 'a master to slay');
  return out;
}
