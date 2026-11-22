/**
 * The local provider: a deterministic designer that turns a brief into a plan
 * from tables of names, words and simple rules about progression. The same
 * brief and seed always give the same plan, with no network and no key.
 */
import { makeRng } from '../engine/rng';
import type { Environment } from '../schema/world';
import type { AdventureBrief, Atmosphere } from './brief';
import type { AdventurePlan, EnemyKind, PlanCharacter, PlanEncounter, PlanLoot, PlanQuest, PlanRoom, PlanRoomType } from './plan';
import type { WorldProvider } from './provider';

type Rng = () => number;
const pick = <T,>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)];
const between = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));

const ROOM_COUNT: Record<AdventureBrief['scale'], [number, number]> = { small: [4, 5], medium: [10, 13], large: [20, 25] };

const PLACE: Record<Environment, Record<PlanRoomType, string[]>> = {
  mine: {
    entrance: ['Mine Entrance', 'The Old Adit', 'Collapsed Portal', 'Pithead'],
    corridor: ['Timbered Tunnel', 'Narrow Drift', 'Cart Track', 'Low Crawlway', 'Propped Gallery', 'Dripping Passage'],
    combat: ['Ore Hall', 'Guard Cave', 'Rubble Chamber', 'Smelting Floor', 'Goblin Den', 'Echoing Stope'],
    treasure: ['Storeroom', 'Tool Cache', 'Foreman\'s Office', 'Powder Store', 'Assay Room'],
    boss: ['The Deep Shaft', 'Chief\'s Hall', 'The Pit', 'Throne of Slag'],
    story: ['Flooded Working', 'Abandoned Camp', 'Old Chapel of the Delvers', 'Miners\' Memorial'],
    secret: ['Hidden Cache', 'Sealed Seam', 'Smugglers\' Hole'],
    safe: ['Pump Room', 'Rest Cave', 'Lamp Room'],
  },
  crypt: {
    entrance: ['The Broken Stair', 'Crypt Door', 'Grave Mouth', 'Sunken Porch'],
    corridor: ['Hall of the Dead', 'Niche Gallery', 'Bone Walk', 'Cold Passage', 'Processional Way', 'Lantern Walk'],
    combat: ['The Ossuary', 'Charnel Room', 'Hall of Effigies', 'Embalming Floor', 'Guardians\' Rest'],
    treasure: ['Embalmers\' Cell', 'Reliquary', 'Offering Room', 'Vestry', 'Treasury of Ash'],
    boss: ['The Warden\'s Vault', 'Tomb of the First', 'The Hollow Throne', 'Sanctum of Ash'],
    story: ['Chapel of Ash', 'Weeping Shrine', 'Hall of Names', 'Mourners\' Gallery'],
    secret: ['Walled Chamber', 'Forgotten Niche', 'Priest\'s Hole'],
    safe: ['Quiet Chapel', 'Candle Room', 'Shrine of Rest'],
  },
};

const DESCRIBE: Record<PlanRoomType, string[]> = {
  entrance: ['The way in. The air beyond is stale and still.', 'Daylight gives out a few steps in.', 'Old boot prints lead inward and do not come back.'],
  corridor: ['A narrow way, too quiet by half.', 'Water drips somewhere ahead.', 'The walls press close.'],
  combat: ['Something has made its home here.', 'Signs of a struggle, and of a nest.', 'Bones and scraps are kicked into the corners.'],
  treasure: ['Shelves and crates, mostly picked over.', 'Someone kept their valuables here.', 'Dust lies thick on everything worth having.'],
  boss: ['Whatever rules this place waits here.', 'The air is heavy, and something breathes in the dark.', 'Everything below leads here.'],
  story: ['Old marks on the walls tell part of a story.', 'People lived here once, or tried to.', 'A place of old prayers and older fears.'],
  secret: ['Hidden away, and forgotten by all but one.', 'Nobody was meant to find this.'],
  safe: ['A quiet corner. Nothing stirs.', 'For a moment, nothing here wants you dead.'],
};

const MOOD: Record<Atmosphere, { adj: string[]; aside: string[] }> = {
  dark_fantasy: { adj: ['Forgotten', 'Sunken', 'Cursed', 'Shadowed'], aside: ['Old blood stains the stone.', 'Something old is waking.'] },
  high_fantasy: { adj: ['Gilded', 'Ancient', 'Lost', 'Kingly'], aside: ['Carvings of heroes line the walls.', 'A legend begins here.'] },
  horror: { adj: ['Weeping', 'Hollow', 'Screaming', 'Pale'], aside: ['You feel watched.', 'Scratches cover the inside of the door.'] },
  mystery: { adj: ['Silent', 'Vanished', 'Sealed', 'Nameless'], aside: ['Someone left in a hurry.', 'A half-written note lies trampled in the dust.'] },
  grim: { adj: ['Drowned', 'Broken', 'Bitter', 'Last'], aside: ['Nobody came back from here.', 'It smells of smoke and old fear.'] },
  magical: { adj: ['Glimmering', 'Starlit', 'Singing', 'Shimmering'], aside: ['Faint light moves in the rock.', 'The air tingles.'] },
};

const TITLE_PLACE: Record<AdventureBrief['setting'], string[]> = {
  mine: ['Mines', 'Delve', 'Warren', 'Workings', 'Deeps'],
  crypt: ['Crypt', 'Tomb', 'Catacombs', 'Barrow', 'Vaults'],
  both: ['Deeps', 'Undercroft', 'Delve', 'Tomb'],
};
const RELICS = ['Ember Crown', 'Ashen Chalice', 'Moonsilver Lantern', 'Heartstone', 'Iron Reliquary', 'Bell of Ruin', 'Delver\'s Seal'];
const CHIEFS = ['Gnarl', 'Skrag', 'Murkfang', 'Grubbin', 'Rotgut', 'Vrask'];
const WARDENS = ['the Warden of Ash', 'the Hollow King', 'the Bone Abbot', 'the Pale Keeper', 'the Grave Lord'];
const HEROES: Record<PlanCharacter['classId'], string[]> = {
  fighter: ['Brannoc', 'Hild', 'Tor', 'Ysolde', 'Garrow'],
  rogue: ['Sela', 'Wren', 'Corvin', 'Nim', 'Rook'],
  mage: ['Ilvane', 'Oswin', 'Thessaly', 'Mirelle'],
  cleric: ['Maren', 'Hale', 'Aldric', 'Sister Vey'],
};

function environmentOf(brief: AdventureBrief, depth: number, maxDepth: number): Environment {
  if (brief.setting === 'both') return depth <= Math.floor(maxDepth / 2) ? 'mine' : 'crypt';
  return brief.setting;
}

function enemyFor(brief: AdventureBrief, environment: Environment, boss: boolean): EnemyKind {
  const dead = brief.inhabitants === 'undead' || (brief.inhabitants === 'mixed' && environment === 'crypt');
  if (boss) return dead ? 'warden' : 'goblin_chief';
  return dead ? 'skeleton' : 'goblin';
}

function size(rng: Rng, type: PlanRoomType): [number, number] {
  switch (type) {
    case 'corridor':
      return rng() < 0.5 ? [1, between(rng, 3, 4)] : [between(rng, 3, 4), 1];
    case 'entrance':
      return [between(rng, 3, 4), between(rng, 2, 3)];
    case 'combat':
      return [between(rng, 3, 5), between(rng, 3, 4)];
    case 'boss':
      return [between(rng, 4, 5), between(rng, 4, 5)];
    case 'secret':
      return [2, between(rng, 2, 3)];
    default:
      return [between(rng, 3, 4), between(rng, 2, 3)];
  }
}

export function planAdventure(brief: AdventureBrief, seed: number): AdventurePlan {
  const rng = makeRng(seed * 7919 + 17);
  const mood = MOOD[brief.atmosphere];
  const total = between(rng, ...ROOM_COUNT[brief.scale]);
  const used = new Set<string>();
  const nameFor = (environment: Environment, type: PlanRoomType) => {
    const choices = PLACE[environment][type].filter((n) => !used.has(n));
    let name = choices.length ? pick(rng, choices) : `${pick(rng, mood.adj)} ${pick(rng, PLACE[environment][type])}`;
    while (used.has(name)) name = `${pick(rng, mood.adj)} ${name}`;
    used.add(name);
    return name;
  };

  // The spine runs from the entrance to the room before the boss; branches hang off it.
  const spineLength = Math.max(2, Math.round((total - 1) * (brief.scale === 'small' ? 0.6 : 0.45)));
  const rooms: PlanRoom[] = [];
  const depth = new Map<string, number>();
  const add = (type: PlanRoomType, parent: string | undefined, via: PlanRoom['via'], d: number): PlanRoom => {
    const environment = environmentOf(brief, d, spineLength + 1);
    const [width, height] = size(rng, type);
    const room: PlanRoom = {
      key: `r${rooms.length}`,
      name: nameFor(environment, type),
      type,
      description: `${pick(rng, DESCRIBE[type])}${rng() < 0.4 ? ` ${pick(rng, mood.aside)}` : ''}`,
      environment,
      width,
      height,
      parent,
      via,
    };
    rooms.push(room);
    depth.set(room.key, d);
    return room;
  };

  const entrance = add('entrance', undefined, 'archway', 0);
  const spine: PlanRoom[] = [entrance];
  for (let i = 1; i < spineLength; i++) {
    const type: PlanRoomType = i % 2 === 1 ? 'corridor' : 'combat';
    spine.push(add(type, spine[i - 1].key, i === 1 ? 'archway' : rng() < 0.55 ? 'door' : 'archway', i));
  }
  // At least one fight before the boss.
  if (!spine.some((r) => r.type === 'combat')) spine.push(add('combat', spine[spine.length - 1].key, 'door', spine.length));
  const branchTypes: PlanRoomType[] = ['treasure', 'combat', 'story', 'combat', 'safe', 'treasure', 'corridor'];
  const branches: PlanRoom[] = [];
  /** How far a branch room is from the spine: 1 for one opening straight off it. */
  const level = new Map<string, number>();
  const branchCount = Math.max(1, total - spine.length - 1);
  for (let i = 0; i < branchCount; i++) {
    // Hang off the spine, or now and then off another branch, two deep at most.
    const anchors = [...spine.slice(0, -1), ...branches.filter((b) => (level.get(b.key) ?? 0) < 2)];
    const parent = pick(rng, anchors.length ? anchors : spine);
    const type = i === 0 ? 'treasure' : branchTypes[i % branchTypes.length];
    const branch = add(type, parent.key, rng() < 0.6 ? 'door' : 'archway', (depth.get(parent.key) ?? 0) + 1);
    level.set(branch.key, (level.get(parent.key) ?? 0) + 1);
    branches.push(branch);
  }
  const boss = add('boss', spine[spine.length - 1].key, 'locked', spine.length);
  const secret = brief.secrets ? add('secret', pick(rng, [...spine.slice(0, -1), ...branches]).key, 'breakable', 1) : null;

  // Loops: in bigger worlds, a second way between two rooms makes the place feel built, not grown.
  const loops = brief.scale === 'small' ? 0 : brief.scale === 'medium' ? 1 : 3;

  // Who lives where.
  const encounters: PlanEncounter[] = [];
  const toughness = brief.difficulty === 'brutal' ? 1 : 0;
  for (const room of rooms) {
    if (room.type !== 'combat') continue;
    const d = depth.get(room.key) ?? 1;
    const enemy = enemyFor(brief, room.environment, false);
    encounters.push({
      key: `e${encounters.length}`,
      name: `${room.name} ${enemy === 'goblin' ? 'goblins' : 'dead'}`,
      roomKey: room.key,
      enemy,
      count: Math.min(3, 1 + Math.floor(d / 3) + toughness + (brief.party === 'four' ? 1 : 0) + (rng() < 0.3 ? 1 : 0)),
    });
  }
  const bossEnemy = enemyFor(brief, boss.environment, true);
  const bossName = bossEnemy === 'warden' ? pick(rng, WARDENS) : pick(rng, CHIEFS);
  const relicName = brief.relicName ?? pick(rng, RELICS);
  const intro =
    bossEnemy === 'warden'
      ? pick(rng, [`Who wakes ${bossName.replace(/^the /, 'the ')}?`, 'You should not have come down here, little warm thing.', 'The dead keep what is theirs.'])
      : pick(rng, [`${bossName} smells you, thief. Come closer.`, `So. Another fool for ${bossName}'s pot.`, 'This is my hall. You will die in it.']);
  encounters.push({ key: 'boss', name: `${bossName[0].toUpperCase()}${bossName.slice(1)}`, roomKey: boss.key, enemy: bossEnemy, count: 1, boss: true, intro });

  // What lies about to be found.
  const loot: PlanLoot[] = [];
  const beforeBoss = [...spine, ...branches];
  const keyRoom = branches.length ? branches.reduce((a, b) => ((depth.get(b.key) ?? 0) > (depth.get(a.key) ?? 0) ? b : a)) : spine[spine.length - 1];
  loot.push({ key: 'key', roomKey: keyRoom.key, kind: 'key' });
  const bossChest = 'chest_boss';
  if (brief.objective === 'relic') loot.push({ key: 'relic', roomKey: boss.key, kind: 'relic', chest: bossChest, chestName: `${bossEnemy === 'warden' ? 'Reliquary' : 'War chest'}` });
  loot.push({ key: 'boss_gold', roomKey: boss.key, kind: 'gold', chest: bossChest, chestName: bossEnemy === 'warden' ? 'Reliquary' : 'War chest' });
  const draughts = { gentle: 4, classic: 3, brutal: 2 }[brief.difficulty] + (brief.scale === 'medium' ? 1 : brief.scale === 'large' ? 3 : 0);
  // Loot lies in rooms with space for it: not the entrance, not a one-cell corridor.
  const stash = beforeBoss.filter((r) => r.type !== 'entrance' && r.type !== 'corridor');
  for (let i = 0; i < draughts; i++) loot.push({ key: `draught${i}`, roomKey: pick(rng, stash).key, kind: 'draught' });
  loot.push({ key: 'scroll', roomKey: pick(rng, stash).key, kind: 'scroll' });
  if (brief.party !== 'pair') loot.push({ key: 'shield', roomKey: pick(rng, stash).key, kind: 'shield' });
  if (secret) {
    for (const kind of ['draught', 'gold', 'jerkin'] as const) loot.push({ key: `secret_${kind}`, roomKey: secret.key, kind, chest: 'chest_secret', chestName: 'Hidden chest' });
  } else {
    loot.push({ key: 'helm', roomKey: pick(rng, stash).key, kind: 'helm' });
  }

  // The quests.
  const quests: PlanQuest[] = [];
  const bossTitle = `${bossName[0].toUpperCase()}${bossName.slice(1)}`;
  if (brief.objective === 'relic') {
    quests.push({
      key: 'main',
      kind: 'main',
      title: `The ${relicName}`,
      description: `The ${relicName} lies in ${boss.name}, guarded by ${bossName}. Find a way in, and bring it out.`,
      completionText: `${bossTitle} is beaten, and the ${relicName} is yours.`,
      objectives: [
        { key: 'enter', text: `Get into ${boss.name}`, type: 'reach_room', target: boss.key },
        { key: 'boss', text: `Defeat ${bossName}`, type: 'defeat_encounter', target: 'boss' },
        { key: 'relic', text: `Take the ${relicName}`, type: 'collect_item', target: 'relic' },
      ],
    });
  } else {
    quests.push({
      key: 'main',
      kind: 'main',
      title: `The End of ${bossTitle}`,
      description: `${bossTitle} rules from ${boss.name}, behind a locked door. Find the key and put an end to it.`,
      completionText: `${bossTitle} will trouble nobody again.`,
      objectives: [
        { key: 'key', text: 'Find the key to the inner door', type: 'collect_item', target: 'key' },
        { key: 'boss', text: `Defeat ${bossName}`, type: 'defeat_encounter', target: 'boss' },
      ],
    });
  }
  if (brief.sideQuest) {
    const sideFight = encounters.find((e) => !e.boss && rooms.find((r) => r.key === e.roomKey && branches.includes(r)));
    if (secret) {
      quests.push({
        key: 'side',
        kind: 'side',
        title: 'What Was Hidden',
        description: 'Somewhere a wall hides a chest that someone did not want found. A draft gives it away.',
        completionText: 'Whoever hid it will not miss it now.',
        objectives: [{ key: 'chest', text: 'Find the hidden chest', type: 'open_chest', target: 'chest_secret' }],
      });
    } else if (sideFight) {
      quests.push({
        key: 'side',
        kind: 'side',
        title: `Clear ${rooms.find((r) => r.key === sideFight.roomKey)!.name}`,
        description: 'It lies off the main way, and whatever lairs there will not leave on its own.',
        completionText: 'It is quiet there now.',
        objectives: [{ key: 'clear', text: `Clear ${rooms.find((r) => r.key === sideFight.roomKey)!.name}`, type: 'defeat_encounter', target: sideFight.key }],
      });
    }
  }

  // The party.
  const classes: PlanCharacter['classId'][] = brief.party === 'fighter' ? ['fighter'] : brief.party === 'pair' ? ['rogue', 'cleric'] : ['fighter', 'rogue', 'mage', 'cleric'];
  const party = classes.map((classId, i) => ({ key: `c${i}`, classId, name: pick(rng, HEROES[classId]) }));

  const title = brief.title ?? `The ${pick(rng, mood.adj)} ${pick(rng, TITLE_PLACE[brief.setting])}`;
  const enemyWords = brief.inhabitants === 'mixed' ? 'goblins and the restless dead' : brief.inhabitants === 'undead' ? 'the restless dead' : 'goblins';
  const partyWords = brief.party === 'fighter' ? 'a lone fighter' : brief.party === 'pair' ? 'a rogue and a cleric' : 'a party of four';
  return {
    title,
    description: brief.concept.trim() || `A ${brief.scale} delve into ${brief.setting === 'both' ? 'old mines and the tomb beneath them' : brief.setting === 'crypt' ? 'a crypt' : 'an old mine'}, held by ${enemyWords}.`,
    summary: `${rooms.length} rooms held by ${enemyWords}, for ${partyWords}, ${brief.objective === 'relic' ? `to bring out the ${relicName}` : `to put an end to ${bossName}`}.`,
    brief,
    rooms,
    loops,
    encounters,
    loot,
    quests,
    party,
    relicName,
    bossName,
  };
}

export const localProvider: WorldProvider = {
  id: 'local',
  label: 'Local generator (no AI, works offline)',
  plan: async (brief, seed) => planAdventure(brief, seed),
};
