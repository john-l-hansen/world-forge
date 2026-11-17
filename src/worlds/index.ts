/**
 * The worlds this build of the player can load. Each is plain world data and
 * goes through the same validation before the engine sees it.
 */
import minesJson from './forgotten-mines.json';
import cryptJson from './sunken-crypt.json';

export interface WorldEntry {
  key: string;
  /** Shown on the title screen. */
  label: string;
  blurb: string;
  data: unknown;
}

/**
 * The Forgotten Mines for a party of four. Derived from the solo adventure so
 * the two cannot drift apart: the same rooms, doors, quest and treasure, with
 * three companions added and the enemies strengthened to match.
 */
export function minesForParty(base: unknown): unknown {
  const world = structuredClone(base) as any;
  world.world.id = 'world_forgotten_mines_party';
  world.world.description = 'An abandoned mine beneath the hills, and four who mean to clear it.';

  world.items.push(
    {
      id: 'item_dagger',
      name: 'Dagger',
      description: 'Short, quick and easily hidden.',
      category: 'weapon',
      weapon: {
        light: { damage: { min: 2, max: 4 }, windupTicks: 4, recoveryTicks: 14, staminaCost: 3, impact: 1 },
        heavy: { damage: { min: 5, max: 8 }, windupTicks: 12, recoveryTicks: 22, staminaCost: 10, impact: 2 },
      },
      visualAssetId: 'dagger',
    },
    {
      id: 'item_ash_staff',
      name: 'Ash staff',
      description: 'A walking staff, good for leaning on and little else.',
      category: 'weapon',
      weapon: {
        light: { damage: { min: 1, max: 3 }, windupTicks: 7, recoveryTicks: 20, staminaCost: 4, impact: 1 },
        heavy: { damage: { min: 3, max: 6 }, windupTicks: 16, recoveryTicks: 28, staminaCost: 12, impact: 2 },
      },
      visualAssetId: 'staff',
    },
    {
      id: 'item_mace',
      name: 'Flanged mace',
      description: 'Blunt, heavy and blessed.',
      category: 'weapon',
      weapon: {
        light: { damage: { min: 2, max: 5 }, windupTicks: 7, recoveryTicks: 22, staminaCost: 5, impact: 1 },
        heavy: { damage: { min: 6, max: 10 }, windupTicks: 18, recoveryTicks: 30, staminaCost: 14, impact: 3 },
      },
      visualAssetId: 'mace',
    },
  );

  world.spells.push({
    id: 'spell_mend',
    name: 'Mend',
    description: 'Closes the wounds of whoever is hurt worst.',
    shape: 'heal',
    element: 'life',
    amount: 14,
    castTicks: 24,
    recoveryTicks: 24,
    manaCost: 7,
  });

  world.characters.push(
    { id: 'char_rogue', name: 'Sela', classId: 'rogue', level: 1, row: 'front', equipment: { mainHand: 'item_dagger' }, portraitAssetId: 'rogue' },
    { id: 'char_mage', name: 'Ilvane', classId: 'mage', level: 1, row: 'back', spells: ['spell_storm_bolt'], equipment: { mainHand: 'item_ash_staff' }, portraitAssetId: 'mage' },
    { id: 'char_cleric', name: 'Maren', classId: 'cleric', level: 1, row: 'back', spells: ['spell_mend'], equipment: { mainHand: 'item_mace' }, portraitAssetId: 'cleric' },
  );
  world.settings.startingPartyIds = ['char_fighter', 'char_rogue', 'char_mage', 'char_cleric'];

  // Four blades against the mine: more goblins, and tougher ones.
  for (const enemy of world.enemies) {
    if (enemy.id === 'enemy_goblin') enemy.health = 34;
    if (enemy.id === 'enemy_goblin_chief') enemy.health = 150;
  }
  const patrol = world.encounters.find((e: any) => e.id === 'encounter_goblin_patrol');
  patrol.placements.push({ enemyId: 'enemy_goblin', cell: { x: 3, y: 2 }, facing: 'south' });
  return world;
}

export const WORLDS: WorldEntry[] = [
  { key: 'solo', label: 'Mines', blurb: 'The Forgotten Mines with Brannoc alone. The adventure as first built.', data: minesJson },
  { key: 'party', label: 'Mines: party', blurb: 'The Forgotten Mines with a party of four: fighter, rogue, mage and cleric against a stronger mine.', data: minesForParty(minesJson) },
  { key: 'crypt', label: 'Crypt', blurb: 'The Sunken Crypt. A different place: a rogue and a cleric, the dead, and two ways in.', data: cryptJson },
];
