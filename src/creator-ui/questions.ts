/**
 * The creator's questions: few, in order, each with suggestions and a default
 * read from the person's own description. Plain data, so the conversation can
 * be reordered or reworded without touching the screen.
 */
import type { AdventureBrief } from '../creator/brief';

export interface Choice<K extends keyof AdventureBrief> {
  value: AdventureBrief[K];
  label: string;
  hint?: string;
}

export interface Question<K extends keyof AdventureBrief = keyof AdventureBrief> {
  key: K;
  /** What the designer asks. */
  ask: string;
  /** How an answer reads once given, in the conversation. */
  answered: (brief: AdventureBrief) => string;
  choices: Choice<K>[];
}

const q = <K extends keyof AdventureBrief>(question: Question<K>) => question as unknown as Question;

export const QUESTIONS: Question[] = [
  q({
    key: 'setting',
    ask: 'Where does it happen?',
    answered: (b) => ({ mine: 'In old mines.', crypt: 'In a crypt.', both: 'In old mines, with a tomb beneath.' })[b.setting],
    choices: [
      { value: 'mine', label: 'Old mines', hint: 'Timbered tunnels and rough stone' },
      { value: 'crypt', label: 'A crypt', hint: 'Dressed stone, niches, bronze doors' },
      { value: 'both', label: 'Mines over a tomb', hint: 'The miners dug too deep' },
    ],
  }),
  q({
    key: 'inhabitants',
    ask: 'Who lives there now?',
    answered: (b) => ({ goblins: 'Goblins hold it.', undead: 'The dead walk there.', mixed: 'Goblins above, the dead below.' })[b.inhabitants],
    choices: [
      { value: 'goblins', label: 'Goblins', hint: 'Quick, mean, led by a chief' },
      { value: 'undead', label: 'The dead', hint: 'Skeletons and their warden' },
      { value: 'mixed', label: 'Both', hint: 'Goblins in the mines, the dead in the crypt' },
    ],
  }),
  q({
    key: 'atmosphere',
    ask: 'What should it feel like?',
    answered: (b) => `${({ dark_fantasy: 'Dark fantasy', high_fantasy: 'High fantasy', horror: 'Horror', mystery: 'Mystery', grim: 'A grim adventure', magical: 'Magical exploration' })[b.atmosphere]}.`,
    choices: [
      { value: 'dark_fantasy', label: 'Dark fantasy' },
      { value: 'horror', label: 'Horror' },
      { value: 'mystery', label: 'Mystery' },
      { value: 'grim', label: 'Grim' },
      { value: 'high_fantasy', label: 'High fantasy' },
      { value: 'magical', label: 'Magical' },
    ],
  }),
  q({
    key: 'scale',
    ask: 'How big a place?',
    answered: (b) => ({ small: 'Small: an evening\'s delve.', medium: 'Medium: a proper dungeon.', large: 'Large: a sprawling labyrinth.' })[b.scale],
    choices: [
      { value: 'small', label: 'Small', hint: '4 to 6 rooms' },
      { value: 'medium', label: 'Medium', hint: '10 to 15 rooms' },
      { value: 'large', label: 'Large', hint: '20 to 27 rooms' },
    ],
  }),
  q({
    key: 'objective',
    ask: 'What are the heroes there to do?',
    answered: (b) => (b.objective === 'relic' ? `Bring out ${b.relicName ? `the ${b.relicName}` : 'a treasure'}.` : 'Put an end to whoever rules there.'),
    choices: [
      { value: 'relic', label: 'Bring out a treasure', hint: 'Behind the boss, in a chest' },
      { value: 'slay', label: 'Slay their master', hint: 'Find the key, end the boss' },
    ],
  }),
  q({
    key: 'party',
    ask: 'Who goes in?',
    answered: (b) => ({ fighter: 'A lone fighter.', pair: 'A rogue and a cleric.', four: 'A party of four.' })[b.party],
    choices: [
      { value: 'fighter', label: 'A lone fighter', hint: 'The classic way' },
      { value: 'pair', label: 'Rogue and cleric', hint: 'Two, one who heals' },
      { value: 'four', label: 'A party of four', hint: 'Fighter, rogue, mage, cleric' },
    ],
  }),
  q({
    key: 'difficulty',
    ask: 'How hard should it be?',
    answered: (b) => ({ gentle: 'Gentle.', classic: 'Classic.', brutal: 'Brutal.' })[b.difficulty],
    choices: [
      { value: 'gentle', label: 'Gentle', hint: 'Room to learn' },
      { value: 'classic', label: 'Classic', hint: 'As the old games were' },
      { value: 'brutal', label: 'Brutal', hint: 'Every blow counts' },
    ],
  }),
];
