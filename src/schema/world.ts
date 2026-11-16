/**
 * World schema — the contract shared by the engine, the future editor and the
 * future AI creator. World definitions are plain serializable data. They never
 * contain code and never contain runtime state (see engine/state.ts for that).
 */
import { z } from 'zod';

export const SCHEMA_VERSION = '0.1.0';

const id = z.string().regex(/^[a-z][a-z0-9_]*$/, 'ids are lower_snake_case');
const cell = z.object({ x: z.number().int().min(1), y: z.number().int().min(1) });
const ticks = z.number().int().min(1).max(600);
const damageRange = z
  .object({ min: z.number().int().min(0), max: z.number().int().min(0) })
  .refine((d) => d.max >= d.min, 'max must be >= min');

export const FacingSchema = z.enum(['north', 'east', 'south', 'west']);

export const RoomTypeSchema = z.enum([
  'entrance',
  'corridor',
  'combat',
  'treasure',
  'puzzle',
  'boss',
  'safe',
  'story',
  'secret',
  'exit',
]);

export const WorldMetaSchema = z.object({
  id,
  name: z.string().min(1),
  description: z.string().default(''),
  theme: z.string().min(1),
  difficulty: z.enum(['gentle', 'classic', 'brutal']).default('classic'),
  author: z.string().optional(),
  createdAt: z.string().optional(),
  modifiedAt: z.string().optional(),
});

export const SettingsSchema = z.object({
  movementMode: z.literal('grid'),
  startRoomId: id,
  /** Absolute cell on the region grid. Must be inside the start room. */
  startCell: cell,
  startFacing: FacingSchema,
  startingPartyIds: z.array(id).min(1).max(4),
});

export const RegionSchema = z.object({
  id,
  name: z.string().min(1),
  description: z.string().default(''),
  roomIds: z.array(id).min(1),
  /** Selects the tileset, palette and ambience the renderer and audio use. */
  environment: z.enum(['mine']),
});

export const RoomSchema = z.object({
  id,
  regionId: id,
  name: z.string().min(1),
  type: RoomTypeSchema,
  description: z.string().default(''),
  /** Rectangle of floor cells on the region grid (absolute coordinates). */
  layout: z.object({
    x: z.number().int().min(1),
    y: z.number().int().min(1),
    width: z.number().int().min(1).max(32),
    height: z.number().int().min(1).max(32),
  }),
  connections: z.array(z.object({ targetRoomId: id, doorId: id })),
  encounterIds: z.array(id).default([]),
  objectIds: z.array(id).default([]),
});

export const DoorSchema = z.object({
  id,
  name: z.string().default('Door'),
  /** An archway is always passable. A door starts closed and opens on interact. */
  kind: z.enum(['archway', 'door']),
  /** The single wall cell this opening occupies, between the two rooms. */
  cell,
});

export const EnemySchema = z.object({
  id,
  name: z.string().min(1),
  description: z.string().default(''),
  archetype: z.enum(['goblin']),
  health: z.number().int().min(1),
  damage: damageRange,
  defence: z.number().int().min(0).default(0),
  /** Ticks to cross one cell (60 ticks = 1 second). */
  moveTicks: ticks,
  /** How far, in cells, the enemy notices the party with a clear line of sight. */
  sightRange: z.number().int().min(1).max(20),
  attack: z.object({
    /** The visible wind-up before the blow lands. The player can step away. */
    telegraphTicks: ticks,
    recoverTicks: ticks,
  }),
  staggerTicks: ticks,
  /** Names an engine-supported behaviour. Never code. */
  behaviour: z.enum(['melee_aggressive']),
  visualAssetId: z.enum(['goblin']),
});

export const EncounterSchema = z.object({
  id,
  name: z.string().min(1),
  roomId: id,
  placements: z
    .array(z.object({ enemyId: id, cell, facing: FacingSchema }))
    .min(1),
});

export const ObjectSchema = z.discriminatedUnion('type', [
  z.object({
    id,
    type: z.literal('torch'),
    name: z.string().default('Torch'),
    roomId: id,
    cell,
    /** Which wall of the cell the torch hangs on. */
    wall: FacingSchema,
    radius: z.number().min(1).max(8).default(4),
  }),
  z.object({
    id,
    type: z.literal('prop'),
    name: z.string().min(1),
    roomId: id,
    cell,
    visualAssetId: z.enum(['barrel', 'crate', 'rubble']),
    blocking: z.boolean().default(true),
  }),
]);

export const ItemSchema = z.object({
  id,
  name: z.string().min(1),
  description: z.string().default(''),
  category: z.enum(['weapon']),
  weapon: z.object({
    damage: damageRange,
    /** Ticks between pressing attack and the blow landing. */
    windupTicks: ticks,
    /** Ticks after the blow before another action. */
    recoveryTicks: ticks,
  }),
  visualAssetId: z.enum(['short_sword']),
});

export const CharacterSchema = z.object({
  id,
  name: z.string().min(1),
  classId: z.enum(['fighter', 'rogue', 'mage', 'cleric']),
  maxHealth: z.number().int().min(1),
  equipment: z.object({ mainHand: id }),
  portraitAssetId: z.enum(['fighter']),
});

export const WorldSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  world: WorldMetaSchema,
  settings: SettingsSchema,
  regions: z.array(RegionSchema).min(1),
  rooms: z.array(RoomSchema).min(1),
  doors: z.array(DoorSchema).default([]),
  enemies: z.array(EnemySchema).default([]),
  encounters: z.array(EncounterSchema).default([]),
  objects: z.array(ObjectSchema).default([]),
  items: z.array(ItemSchema).default([]),
  characters: z.array(CharacterSchema).min(1),
  // Reserved for later phases. Present so worlds stay forward-shaped.
  npcs: z.array(z.object({ id }).passthrough()).default([]),
  quests: z.array(z.object({ id }).passthrough()).default([]),
  factions: z.array(z.object({ id }).passthrough()).default([]),
});

export type Facing = z.infer<typeof FacingSchema>;
export type WorldDefinition = z.infer<typeof WorldSchema>;
export type RoomDef = z.infer<typeof RoomSchema>;
export type DoorDef = z.infer<typeof DoorSchema>;
export type EnemyDef = z.infer<typeof EnemySchema>;
export type EncounterDef = z.infer<typeof EncounterSchema>;
export type ObjectDef = z.infer<typeof ObjectSchema>;
export type ItemDef = z.infer<typeof ItemSchema>;
export type CharacterDef = z.infer<typeof CharacterSchema>;
export type Cell = z.infer<typeof cell>;
