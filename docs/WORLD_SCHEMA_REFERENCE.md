# World schema reference — version 0.9.0

What the engine actually reads today. The source of truth is `src/schema/world.ts`
(shapes) and `src/schema/validate.ts` (meaning). A world is one JSON object; see
`src/worlds/forgotten-mines.json` and `src/worlds/sunken-crypt.json` for two complete
examples. A world is loaded with `loadWorld` or `loadWorldText` in `src/world/load.ts`,
which migrate, validate and compile it. Nothing in a world file is ever executed.

## Top level

| Field | Contents |
| --- | --- |
| `schemaVersion` | `"0.9.0"`. Worlds from `0.1.0` onward are migrated on load, one version at a time. Anything else is rejected. |
| `world` | id, name, description, theme, difficulty, optional author and timestamps |
| `settings` | movement mode, start room, start cell, start facing, starting party (one to four characters; the first is the one the player drives at the start), starting quests |
| `regions` | id, name, room IDs, and an `environment` from the engine's list (`mine` or `crypt`), which chooses the tileset and ambience for the region's rooms. One world can mix environments |
| `rooms` | id, region, name, type, description, `layout` rectangle, connections, encounter IDs, object IDs |
| `doors` | id, name, `kind` (`archway`, `door`, `secret`, `breakable`), cell, optional `lock.keyItemId` (doors only), optional `toughness` (breakable walls only: the heavy blows it takes, 1 to 10, 3 if left out). A secret door looks like wall until searched; a breakable wall is visibly cracked and comes down under heavy blows. Both breathe a draft until opened |
| `enemies` | health, defence, `poise`, movement, sight range, a list of `attacks` (each `name` is a noun, shown as "rears back for a chop"), an optional `alertText` shown when it first notices the party, and `behaviour` and `visualAssetId` from engine-supported lists (`goblin`, `goblin_chief`, `skeleton`, `warden`) |
| `encounters` | room, enemy placements, `boss` flag, optional `intro` line |
| `objects` | `torch`, `prop` (`barrel`, `crate`, `rubble`, `sarcophagus`, `urn`, `bones`; blocking unless it says otherwise), `pickup` (an item on the floor) or `chest` (blocking, with contents) |
| `items` | `weapon`, `armour` (with a slot, a defence value, and for a shield an optional `block`: `damageShare`, the part of a blocked blow that lands, 0 to 1, and `staminaCost`; only the off hand's counts), `key`, `consumable` (heals, or casts a spell as a scroll) or `treasure` |
| `characters` | name, class, level, optional attributes, optional `row` (`front` or `back`; the class decides if left out), `spells` (IDs of spells the character can cast with mana), equipment (seven optional slots), portrait |
| `quests` | title, description, `kind` (`main` or `side`; main if left out), objectives (`collect_item`, `defeat_encounter`, `open_chest`, `reach_room`), completion text. The adventure is won when every main quest the party holds is done |
| `spells` | name, cast time, recovery, mana cost, and a `shape`: `bolt` (element fire, ice or lightning; range, damage, impact) or `heal` (element `life`; amount) |
| `npcs`, `factions` | reserved for later phases |

## Geometry

Rooms are rectangles of floor on one shared grid, with x growing east and y growing
south. Rooms must be separated by at least one wall cell. A door occupies exactly one
wall cell that touches both of the rooms it joins, and both rooms must list the
connection.

## Combat data

A weapon has two attacks, `light` and `heavy`. Each has `damage` (min and max),
`windupTicks`, `recoveryTicks`, `staminaCost` and `impact`. Time is in ticks, 60 to a
second.

An enemy attack has `damage`, `telegraphTicks` (the visible wind-up), `recoverTicks`,
a `pattern` and a `blockable` flag. The enemy picks between its attacks by `weight`.

| Pattern | Reach |
| --- | --- |
| `front` | the one cell the enemy aimed at |
| `sweep` | that cell and the cells to either side, so a sidestep does not escape |

A player's blow breaks an enemy's wind-up only if its `impact` is at least the enemy's
`poise`. With the usual light impact of 1 and heavy impact of 3: poise 2 means only
heavy blows interrupt, and poise 4 means nothing does.

## Characters

A character has a `classId` (fighter, rogue, mage or cleric), a `level` and, optionally,
five `attributes` from 3 to 20: strength, dexterity, constitution, intelligence and
wisdom. Left out, the class's usual starting attributes are used. Health, stamina, mana,
damage bonus and critical chance are worked out from these in `src/engine/stats.ts`;
they are not stored in the world.

`equipment` has seven optional slots: `mainHand` (a weapon), and `offHand`, `head`,
`body`, `hands`, `feet` and `accessory` (armour made for that slot). Enemies have an `xp`
value that every living party member earns when the enemy dies.

## Quest objectives

| Type | `targetId` is | Done when |
| --- | --- | --- |
| `collect_item` | an item | the party gains that item |
| `defeat_encounter` | an encounter | every enemy in it is dead |
| `open_chest` | a chest object | the chest is opened |
| `reach_room` | a room | the party enters it |

A quest is complete when every objective not marked `optional` is done.

## What validation checks

- Every ID is unique and every reference resolves.
- Rooms do not overlap; doors sit between their two rooms; connections are two-way.
- Enemies, props, chests and pickups sit inside their rooms and do not share cells.
- Torches have a wall to hang on.
- Locks are only on doors and name an item that is a key.
- Every room can be reached from the start, counting a locked door as open only once
  its key has been found in a room already reached.
- Quest objectives point at things that exist, quest items can actually be obtained,
  and every quest has at least one required objective.
- Behaviours, effects, objective types and asset IDs are from the engine's lists. World
  data never contains code.

## Runtime state is separate

Door states, opened chests, taken pickups, inventory, quest progress, health, stamina,
the guard, enemy state and the party's position live in the session (`src/engine/types.ts`), never in the world
definition.
