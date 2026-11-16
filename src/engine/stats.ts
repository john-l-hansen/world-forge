/**
 * Every stat formula in one place. Pure functions of class, level and
 * attributes, so they are easy to test and to tune.
 */
import { CLASSES, type Attributes, type ClassId } from './classes';

/** The familiar tabletop modifier: 10 gives 0, 12 gives +1, 14 gives +2. */
export function modifier(attribute: number): number {
  return Math.floor((attribute - 10) / 2);
}

export function maxHealth(classId: ClassId, level: number, a: Attributes): number {
  const c = CLASSES[classId];
  return c.baseHealth + a.constitution + (level - 1) * (c.healthPerLevel + Math.max(0, modifier(a.constitution)));
}

export function maxStamina(classId: ClassId, level: number, a: Attributes): number {
  const c = CLASSES[classId];
  return c.baseStamina + a.dexterity + (level - 1) * c.staminaPerLevel;
}

export function maxMana(classId: ClassId, level: number, a: Attributes): number {
  const c = CLASSES[classId];
  if (c.baseMana === 0) return 0;
  return c.baseMana + a[c.primary] + (level - 1) * c.manaPerLevel;
}

/** Added to every weapon blow. */
export function damageBonus(a: Attributes): number {
  return modifier(a.strength);
}

/** Per cent chance that a blow is a critical hit. */
export function criticalChance(a: Attributes): number {
  return Math.max(0, Math.min(40, 2 + modifier(a.dexterity) * 3));
}

export const CRITICAL_MULTIPLIER = 1.5;

/** Total experience needed to reach a level: 40, 120, 240, 400, ... */
export function experienceForLevel(level: number): number {
  return (40 * (level - 1) * level) / 2;
}

export const MAX_LEVEL = 20;

/** The level a character with this much experience has earned. */
export function levelForExperience(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= experienceForLevel(level + 1)) level++;
  return level;
}
