/**
 * A plan is the design intent for a world: which rooms there are, what each
 * is for, how they hang together, who lives where and what the quests ask.
 * A provider (the local generator now, an AI later) writes a plan. It holds
 * no geometry: the layout builder places rooms and doors from it.
 */
import type { Environment } from '../schema/world';
import type { AdventureBrief } from './brief';

export type PlanRoomType = 'entrance' | 'corridor' | 'combat' | 'treasure' | 'boss' | 'story' | 'secret' | 'safe';
/** How a room is reached from its parent. */
export type PlanVia = 'archway' | 'door' | 'locked' | 'breakable';
export type EnemyKind = 'goblin' | 'goblin_chief' | 'skeleton' | 'warden';

export interface PlanRoom {
  key: string;
  name: string;
  type: PlanRoomType;
  description: string;
  environment: Environment;
  width: number;
  height: number;
  /** The room this one opens off. The entrance has none. */
  parent?: string;
  via: PlanVia;
}

export interface PlanEncounter {
  key: string;
  name: string;
  roomKey: string;
  enemy: EnemyKind;
  count: number;
  boss?: boolean;
  intro?: string;
}

/** Something to pick up or find in a chest, by role. */
export interface PlanLoot {
  key: string;
  roomKey: string;
  kind: 'key' | 'relic' | 'draught' | 'scroll' | 'shield' | 'jerkin' | 'helm' | 'gold';
  /** In a chest (with others of the same chest key), or lying on the floor. */
  chest?: string;
  chestName?: string;
}

export interface PlanQuest {
  key: string;
  kind: 'main' | 'side';
  title: string;
  description: string;
  completionText: string;
  objectives: { key: string; text: string; type: 'collect_item' | 'defeat_encounter' | 'open_chest' | 'reach_room'; target: string; optional?: boolean }[];
}

export interface PlanCharacter {
  key: string;
  name: string;
  classId: 'fighter' | 'rogue' | 'mage' | 'cleric';
}

export interface AdventurePlan {
  title: string;
  description: string;
  /** One line on what the person asked for and how the plan answers it. */
  summary: string;
  brief: AdventureBrief;
  rooms: PlanRoom[];
  /** How many extra openings to make between neighbouring rooms, for loops, where the layout allows. */
  loops: number;
  encounters: PlanEncounter[];
  loot: PlanLoot[];
  quests: PlanQuest[];
  party: PlanCharacter[];
  relicName: string;
  bossName: string;
}
