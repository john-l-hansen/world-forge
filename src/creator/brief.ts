/**
 * What the person wants, in the creator's terms. Everything has a sensible
 * default, so a world can be made from a single sentence or from nothing.
 */
export type Setting = 'mine' | 'crypt' | 'both';
export type Atmosphere = 'dark_fantasy' | 'high_fantasy' | 'horror' | 'mystery' | 'grim' | 'magical';
export type Scale = 'small' | 'medium' | 'large';
export type Inhabitants = 'goblins' | 'undead' | 'mixed';
export type Objective = 'relic' | 'slay';
export type PartyChoice = 'fighter' | 'pair' | 'four';
export type Difficulty = 'gentle' | 'classic' | 'brutal';

export interface AdventureBrief {
  /** The person's own words, kept as written. */
  concept: string;
  /** A title they gave, if any. Otherwise one is made. */
  title?: string;
  setting: Setting;
  atmosphere: Atmosphere;
  scale: Scale;
  inhabitants: Inhabitants;
  objective: Objective;
  /** The treasure to bring out, for a relic objective. Otherwise one is made. */
  relicName?: string;
  difficulty: Difficulty;
  party: PartyChoice;
  /** A hidden room behind a cracked wall. */
  secrets: boolean;
  /** A side quest beside the main one. */
  sideQuest: boolean;
}

export const DEFAULT_BRIEF: AdventureBrief = {
  concept: '',
  setting: 'mine',
  atmosphere: 'dark_fantasy',
  scale: 'small',
  inhabitants: 'goblins',
  objective: 'relic',
  difficulty: 'classic',
  party: 'fighter',
  secrets: true,
  sideQuest: true,
};

/** Examples the creator offers for the first question. */
export const CONCEPT_EXAMPLES = [
  'Goblins have taken an old dwarven mine. Recover the Ember Crown from their chief.',
  'A crypt beneath a ruined chapel, where the dead will not stay buried.',
  'Miners broke into a forgotten tomb, and something followed them back up.',
  'A short, brutal raid on a goblin warren for a party of four.',
];

const has = (text: string, words: string[]) => words.some((w) => new RegExp(`\\b${w}`, 'i').test(text));

/**
 * Read what can be read from the person's description. Only what the words
 * clearly say is taken; anything else is left to the questions and defaults.
 * Plain keyword reading: deterministic, and never runs anything it is given.
 */
export function readConcept(text: string): Partial<AdventureBrief> {
  const out: Partial<AdventureBrief> = {};
  const mine = has(text, ['mine', 'mines', 'dwar', 'ore', 'tunnel', 'shaft', 'cave', 'warren', 'quarr']);
  const crypt = has(text, ['crypt', 'tomb', 'grave', 'catacomb', 'ossuar', 'mausoleum', 'barrow', 'chapel', 'burial']);
  if (mine && crypt) out.setting = 'both';
  else if (crypt) out.setting = 'crypt';
  else if (mine) out.setting = 'mine';

  const goblins = has(text, ['goblin', 'orc', 'kobold', 'raider', 'bandit']);
  const undead = has(text, ['undead', 'skelet', 'dead', 'ghost', 'lich', 'wight', 'bones', 'zombie', 'haunt']);
  if (goblins && undead) out.inhabitants = 'mixed';
  else if (undead) out.inhabitants = 'undead';
  else if (goblins) out.inhabitants = 'goblins';
  // A crypt with nobody named in it is full of the dead; a mine, of goblins.
  if (!out.inhabitants && out.setting === 'crypt') out.inhabitants = 'undead';

  if (has(text, ['horror', 'dread', 'terror', 'nightmare', 'creep'])) out.atmosphere = 'horror';
  else if (has(text, ['myster', 'riddle', 'secret', 'vanish', 'missing'])) out.atmosphere = 'mystery';
  else if (has(text, ['grim', 'brutal', 'bleak', 'desperate'])) out.atmosphere = 'grim';
  else if (has(text, ['magic', 'arcane', 'enchant', 'wonder'])) out.atmosphere = 'magical';
  else if (has(text, ['heroic', 'bright', 'legend', 'noble'])) out.atmosphere = 'high_fantasy';
  else if (has(text, ['dark', 'cursed', 'ancient', 'forgotten'])) out.atmosphere = 'dark_fantasy';

  if (has(text, ['small', 'short', 'quick', 'tiny', 'raid'])) out.scale = 'small';
  else if (has(text, ['huge', 'large', 'sprawling', 'vast', 'big', 'epic'])) out.scale = 'large';
  else if (has(text, ['medium', 'evening', 'longer'])) out.scale = 'medium';

  if (has(text, ['brutal', 'hard', 'deadly', 'punishing'])) out.difficulty = 'brutal';
  else if (has(text, ['gentle', 'easy', 'relaxed', 'beginner'])) out.difficulty = 'gentle';

  if (has(text, ['party of four', 'four heroes', 'four adventurers', 'party'])) out.party = 'four';
  else if (has(text, ['pair', 'two heroes', 'duo', 'companion'])) out.party = 'pair';
  else if (has(text, ['alone', 'lone', 'solo', 'single'])) out.party = 'fighter';

  if (has(text, ['slay', 'kill', 'destroy', 'defeat', 'put an end', 'lay to rest'])) out.objective = 'slay';
  if (has(text, ['recover', 'retrieve', 'steal', 'find', 'bring back', 'treasure', 'relic', 'crown', 'chalice'])) out.objective = 'relic';

  // A named treasure: the capitalised words after "recover the", "find the" and the like.
  const relic = text.match(/\b(?:[Rr]ecover|[Rr]etrieve|[Ss]teal|[Ff]ind|[Bb]ring back|[Tt]ake)\s+(?:the\s+)?((?:[A-Z][\w'-]*)(?:\s+(?:of\s+)?[A-Z][\w'-]*)*)/);
  if (relic) out.relicName = relic[1].trim();
  // A title in quotation marks, or after "called" or "named".
  const titled = text.match(/["“]([^"”]{3,48})["”]/) ?? text.match(/\b(?:called|named)\s+((?:The\s+)?(?:[A-Z][\w'-]*)(?:\s+(?:of\s+)?[A-Z][\w'-]*)*)/);
  if (titled) out.title = titled[1].trim();
  return out;
}
