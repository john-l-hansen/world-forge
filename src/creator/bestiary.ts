/**
 * The building blocks the creator assembles worlds from: enemies, weapons,
 * spells and treasures, as world data. Enemies are scaled by difficulty and
 * party size; everything else is used as written. The numbers are the ones
 * tuned in The Forgotten Mines and The Sunken Crypt.
 */
import type { CharacterDef, EnemyDef, ItemDef, SpellDef } from '../schema/world';
import type { Difficulty, PartyChoice } from './brief';
import type { EnemyKind, PlanCharacter } from './plan';

const ENEMIES: Record<EnemyKind, EnemyDef> = {
  goblin: {
    id: 'enemy_goblin', name: 'Goblin', description: 'Quick, mean and never as alone as it looks.', archetype: 'goblin', health: 24, defence: 0, moveTicks: 26,
    sightRange: 6, staggerTicks: 14, behaviour: 'melee_aggressive', visualAssetId: 'goblin', poise: 2, xp: 40,
    attacks: [{ id: 'chop', name: 'chop', damage: { min: 4, max: 7 }, telegraphTicks: 34, recoverTicks: 40, pattern: 'front', blockable: true, weight: 1 }],
  },
  goblin_chief: {
    id: 'enemy_goblin_chief', name: 'Goblin Chief', description: 'Twice the weight of his kin and three times as cruel.', archetype: 'goblin_chief', health: 60, defence: 1,
    moveTicks: 32, sightRange: 7, staggerTicks: 6, behaviour: 'melee_aggressive', visualAssetId: 'goblin_chief', poise: 4, xp: 150,
    attacks: [
      { id: 'cleave', name: 'cleave', damage: { min: 7, max: 11 }, telegraphTicks: 44, recoverTicks: 46, pattern: 'front', blockable: true, weight: 2 },
      { id: 'sweep', name: 'great sweep', damage: { min: 9, max: 13 }, telegraphTicks: 58, recoverTicks: 56, pattern: 'sweep', blockable: false, weight: 1 },
    ],
  },
  skeleton: {
    id: 'enemy_skeleton', name: 'Skeleton', description: 'Dry, quick and past caring.', archetype: 'skeleton', health: 20, defence: 0, moveTicks: 22, sightRange: 6,
    staggerTicks: 16, behaviour: 'melee_aggressive', visualAssetId: 'skeleton', poise: 2, xp: 30, alertText: 'Bones rattle upright in the dark!',
    attacks: [
      { id: 'slash', name: 'slash', damage: { min: 3, max: 6 }, telegraphTicks: 28, recoverTicks: 34, pattern: 'front', blockable: true, weight: 3 },
      { id: 'rake', name: 'raking cut', damage: { min: 4, max: 7 }, telegraphTicks: 40, recoverTicks: 44, pattern: 'sweep', blockable: true, weight: 1 },
    ],
  },
  warden: {
    id: 'enemy_warden', name: 'Warden', description: 'It was set to guard this place, and nobody told it to stop.', archetype: 'warden', health: 110, defence: 2, moveTicks: 34,
    sightRange: 7, staggerTicks: 6, behaviour: 'melee_aggressive', visualAssetId: 'warden', poise: 5, xp: 200, alertText: 'The Warden turns its hollow gaze on you.',
    attacks: [
      { id: 'crush', name: 'crush', damage: { min: 8, max: 12 }, telegraphTicks: 46, recoverTicks: 44, pattern: 'front', blockable: true, weight: 2 },
      { id: 'reap', name: 'reaping sweep', damage: { min: 10, max: 14 }, telegraphTicks: 60, recoverTicks: 56, pattern: 'sweep', blockable: false, weight: 1 },
    ],
  },
};

/** Health is scaled for difficulty and for how many are in the party; a boss more so. */
export function enemyFor(kind: EnemyKind, difficulty: Difficulty, party: PartyChoice, bossName?: string): EnemyDef {
  const base = ENEMIES[kind];
  const boss = kind === 'goblin_chief' || kind === 'warden';
  const hardness = { gentle: 0.8, classic: 1, brutal: 1.3 }[difficulty];
  const crowd = boss ? { fighter: 1, pair: 1.6, four: 2.4 }[party] : { fighter: 1, pair: 1.2, four: 1.4 }[party];
  const hit = { gentle: 0.8, classic: 1, brutal: 1.2 }[difficulty];
  const scaled = (n: number) => Math.max(1, Math.round(n * hit));
  const enemy: EnemyDef = {
    ...base,
    health: Math.round(base.health * hardness * crowd),
    attacks: base.attacks.map((a) => {
      const min = scaled(a.damage.min);
      return { ...a, damage: { min, max: Math.max(min, scaled(a.damage.max)) } };
    }),
  };
  if (boss && bossName) {
    // The boss gets its own name and its own entry, so it can be told apart from its kin.
    const named = bossName[0].toUpperCase() + bossName.slice(1);
    enemy.id = `${base.id}_boss`;
    enemy.name = named.replace(/^The /, '');
    enemy.alertText = kind === 'warden' ? `${named} turns its hollow gaze on you.` : undefined;
  }
  if (enemy.alertText === undefined) delete enemy.alertText;
  return enemy;
}

const WEAPONS: Record<PlanCharacter['classId'], ItemDef> = {
  fighter: {
    id: 'item_short_sword', name: 'Short sword', description: 'Notched, but it holds an edge.', category: 'weapon', visualAssetId: 'short_sword',
    weapon: { light: { damage: { min: 2, max: 5 }, windupTicks: 6, recoveryTicks: 20, staminaCost: 4, impact: 1 }, heavy: { damage: { min: 7, max: 11 }, windupTicks: 16, recoveryTicks: 30, staminaCost: 14, impact: 3 } },
  },
  rogue: {
    id: 'item_dagger', name: 'Dagger', description: 'Short, quick and easily hidden.', category: 'weapon', visualAssetId: 'dagger',
    weapon: { light: { damage: { min: 2, max: 4 }, windupTicks: 4, recoveryTicks: 14, staminaCost: 3, impact: 1 }, heavy: { damage: { min: 5, max: 8 }, windupTicks: 12, recoveryTicks: 22, staminaCost: 10, impact: 2 } },
  },
  mage: {
    id: 'item_ash_staff', name: 'Ash staff', description: 'A walking staff, good for leaning on and little else.', category: 'weapon', visualAssetId: 'staff',
    weapon: { light: { damage: { min: 1, max: 3 }, windupTicks: 7, recoveryTicks: 20, staminaCost: 4, impact: 1 }, heavy: { damage: { min: 3, max: 6 }, windupTicks: 16, recoveryTicks: 28, staminaCost: 12, impact: 2 } },
  },
  cleric: {
    id: 'item_mace', name: 'Flanged mace', description: 'Blunt, heavy and blessed.', category: 'weapon', visualAssetId: 'mace',
    weapon: { light: { damage: { min: 2, max: 5 }, windupTicks: 7, recoveryTicks: 22, staminaCost: 5, impact: 1 }, heavy: { damage: { min: 6, max: 10 }, windupTicks: 18, recoveryTicks: 30, staminaCost: 14, impact: 3 } },
  },
};

export const SPELLS = {
  storm: { id: 'spell_storm_bolt', name: 'Storm bolt', description: 'A fork of lightning that leaps to the nearest foe ahead.', element: 'lightning', shape: 'bolt', range: 5, damage: { min: 14, max: 20 }, impact: 3, castTicks: 18, recoveryTicks: 24, manaCost: 8 },
  ember: { id: 'spell_ember_bolt', name: 'Ember bolt', description: 'A lance of fire for the nearest foe ahead.', element: 'fire', shape: 'bolt', range: 4, damage: { min: 12, max: 18 }, impact: 3, castTicks: 18, recoveryTicks: 24, manaCost: 8 },
  mend: { id: 'spell_mend', name: 'Mend', description: 'Closes the wounds of whoever is hurt worst.', shape: 'heal', element: 'life', amount: 14, castTicks: 24, recoveryTicks: 24, manaCost: 7 },
} satisfies Record<string, SpellDef>;

export function weaponFor(classId: PlanCharacter['classId']): ItemDef {
  return WEAPONS[classId];
}

export function characterFor(c: PlanCharacter, id: string): CharacterDef {
  return {
    id,
    name: c.name,
    classId: c.classId,
    level: 1,
    spells: c.classId === 'mage' ? [SPELLS.storm.id] : c.classId === 'cleric' ? [SPELLS.mend.id] : [],
    equipment: { mainHand: WEAPONS[c.classId].id },
    portraitAssetId: c.classId,
  };
}

export const LOOT = {
  draught: (): ItemDef => ({ id: 'item_healing_draught', name: 'Healing draught', description: 'Bitter, but it closes wounds.', category: 'consumable', effect: { type: 'heal', amount: 20 }, visualAssetId: 'flask' }),
  scroll: (crypt: boolean): ItemDef =>
    crypt
      ? { id: 'item_ember_scroll', name: 'Scroll of embers', description: 'The ink is still warm. Read it at something you want burnt.', category: 'consumable', effect: { type: 'cast', spellId: SPELLS.ember.id }, visualAssetId: 'scroll' }
      : { id: 'item_storm_scroll', name: 'Scroll of storms', description: 'The ink crackles. Read it at something you want struck down.', category: 'consumable', effect: { type: 'cast', spellId: SPELLS.storm.id }, visualAssetId: 'scroll' },
  shield: (): ItemDef => ({ id: 'item_wooden_shield', name: 'Wooden shield', description: 'Battered oak with an iron rim. Blocked blows barely land, and cost less breath.', category: 'armour', slot: 'offHand', defence: 1, block: { damageShare: 0.12, staminaCost: 5 }, visualAssetId: 'shield' }),
  jerkin: (): ItemDef => ({ id: 'item_studded_jerkin', name: 'Studded jerkin', description: 'Boiled leather set with iron studs.', category: 'armour', slot: 'body', defence: 2, visualAssetId: 'jerkin' }),
  helm: (): ItemDef => ({ id: 'item_iron_helm', name: 'Iron helm', description: 'Dented, but it turns a blow.', category: 'armour', slot: 'head', defence: 1, visualAssetId: 'helm' }),
  gold: (): ItemDef => ({ id: 'item_gold_pouch', name: 'Pouch of gold', description: 'Somebody\'s savings, never collected.', category: 'treasure', value: 120, visualAssetId: 'coins' }),
  key: (crypt: boolean): ItemDef =>
    crypt
      ? { id: 'item_inner_key', name: 'Bronze sigil', description: 'A seal the size of a palm. It fits a plate on an inner door.', category: 'key', visualAssetId: 'key' }
      : { id: 'item_inner_key', name: 'Iron key', description: 'Heavy and cold. It opens an inner door.', category: 'key', visualAssetId: 'key' },
  relic: (name: string): ItemDef => ({ id: 'item_relic', name, description: 'What you came for.', category: 'treasure', value: 500, visualAssetId: 'coins' }),
};
