/**
 * Character classes. These are engine data: plain numbers that the stat
 * formulas in stats.ts read. A world picks a class for each character by ID.
 */
export type Attribute = 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom';
export const ATTRIBUTES: readonly Attribute[] = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom'];
export type Attributes = Record<Attribute, number>;
export type ClassId = 'fighter' | 'rogue' | 'mage' | 'cleric';

export interface ClassDef {
  id: ClassId;
  name: string;
  role: string;
  baseHealth: number;
  healthPerLevel: number;
  baseStamina: number;
  staminaPerLevel: number;
  /** Zero for classes that do not cast. */
  baseMana: number;
  manaPerLevel: number;
  /** Rises by one at every level, and feeds mana for casters. */
  primary: Attribute;
  /** Typical starting attributes, used when a world does not give its own. */
  defaults: Attributes;
  /** Where the class stands unless a world says otherwise. */
  row: 'front' | 'back';
  /** Extra damage, as a multiplier, against an enemy that is reeling or recovering. */
  opportunist: number;
  /** Ticks a companion of this class waits between actions when the party AI plays it. */
  aiPace: number;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  fighter: {
    id: 'fighter',
    name: 'Fighter',
    role: 'High health, strong melee attacks, defensive abilities.',
    baseHealth: 26,
    healthPerLevel: 6,
    baseStamina: 28,
    staminaPerLevel: 2,
    baseMana: 0,
    manaPerLevel: 0,
    primary: 'strength',
    defaults: { strength: 14, dexterity: 12, constitution: 14, intelligence: 9, wisdom: 10 },
    row: 'front',
    opportunist: 1,
    aiPace: 55,
  },
  rogue: {
    id: 'rogue',
    name: 'Rogue',
    role: 'High mobility, precision attacks, advantageous positioning.',
    baseHealth: 20,
    healthPerLevel: 4,
    baseStamina: 30,
    staminaPerLevel: 3,
    baseMana: 0,
    manaPerLevel: 0,
    primary: 'dexterity',
    defaults: { strength: 11, dexterity: 16, constitution: 11, intelligence: 12, wisdom: 10 },
    row: 'front',
    opportunist: 1.5,
    aiPace: 40,
  },
  mage: {
    id: 'mage',
    name: 'Mage',
    role: 'Ranged magic, area effects, lower physical defence.',
    baseHealth: 14,
    healthPerLevel: 3,
    baseStamina: 20,
    staminaPerLevel: 1,
    baseMana: 14,
    manaPerLevel: 5,
    primary: 'intelligence',
    defaults: { strength: 8, dexterity: 12, constitution: 10, intelligence: 16, wisdom: 13 },
    row: 'back',
    opportunist: 1,
    aiPace: 75,
  },
  cleric: {
    id: 'cleric',
    name: 'Cleric',
    role: 'Healing, defensive magic, support abilities.',
    baseHealth: 20,
    healthPerLevel: 4,
    baseStamina: 22,
    staminaPerLevel: 2,
    baseMana: 10,
    manaPerLevel: 4,
    primary: 'wisdom',
    defaults: { strength: 12, dexterity: 10, constitution: 13, intelligence: 10, wisdom: 15 },
    row: 'front',
    opportunist: 1,
    aiPace: 60,
  },
};
