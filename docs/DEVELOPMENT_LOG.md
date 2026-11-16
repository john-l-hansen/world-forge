# Development log — World Forge

## Milestone 4 — Phase 3, part 1: attributes, levels and experience (2026-11-15)

### What was implemented

- **World schema 0.4.0.** A character has a `level` and five `attributes` (strength,
  dexterity, constitution, intelligence, wisdom). Fixed health and stamina numbers are
  gone: they are derived. Enemies have an `xp` value. `0.3.0` worlds are migrated.
- **Classes** (`src/engine/classes.ts`). Fighter, rogue, mage and cleric as plain data:
  base health, stamina and mana, growth per level, a primary attribute and default
  starting attributes.
- **Stat formulas** (`src/engine/stats.ts`). One file of pure functions: attribute
  modifier, maximum health, stamina and mana, damage bonus from strength, critical
  chance from dexterity, and the experience curve (40, 120, 240, 400, ...).
- **Critical hits.** A chance from dexterity (5% for the fighter) to hit half again as
  hard, rolled from the session's seed.
- **Experience and levels.** Every living party member earns an enemy's experience when
  it dies. A level raises the class's primary attribute by one and adds health and
  stamina, which arrive filled. The goblin takes the fighter to level 2 and the chief to
  level 3.
- **Interface.** Level and an experience bar on the party card, a character sheet (C)
  with attributes, modifiers, damage ranges and critical chance, "Critical!" and
  "Level up!" call-outs, and a level-up fanfare.

### Decisions made

- **Classes are engine data, not world data**, for now. A world picks a class by ID and
  may override the starting attributes.
- **The fighter's numbers were kept the same at level 1** (40 health, 40 stamina, 4 to 7
  damage) by moving 2 points of damage from the sword to his strength bonus.
- **Levels are automatic**: no points to spend yet. GAMEPLAY_DESIGN asks for no
  complicated skill trees at first.

### Tests executed

- `npm run typecheck` and `npm run build` — pass.
- `npm test` — 112 unit tests pass. New: 15 in `tests/progression.test.ts` (formulas for
  all four classes, derived stats in a session, starting above level 1, experience,
  multiple levels from one kill, the dead earning nothing, and critical-hit frequency
  and damage over 400 blows).
- `npm run test:browser` — 64 checks pass in headless Chrome, including the level-up
  after the goblin, the character sheet, and finishing the adventure at level 3.

### Known limitations

- Mana is calculated but nothing uses it yet: there are no spells.
- Only the fighter is playable. The other three classes exist as numbers only.
- Levelling makes the chief easier than before; balance has not been revisited.

### Recommended next milestone

Equipment and armour, then spells and mana, then a second party member with basic AI.

## Milestone 3 — Phase 2: Combat (2026-11-15)

Combat now has a light and a heavy attack, stamina, blocking, parrying, dodging, and
enemies with more than one attack.

### What was implemented

- **World schema 0.3.0.** A weapon has a `light` and a `heavy` attack, each with damage,
  wind-up, recovery, stamina cost and impact. Characters have `maxStamina`. Enemies have
  `poise` and a weighted list of `attacks`, each with its own damage, timings, a `front`
  or `sweep` pattern and a `blockable` flag. `0.2.0` worlds are migrated on load.
- **Stamina.** Attacks, blocked blows and dodges spend it. It returns at 12 a second
  after a half-second rest, but not while swinging or holding the guard up. A character
  too tired to act gets a clear refusal instead of a weak swing.
- **Heavy attack.** Slower and costlier, roughly twice the damage, longer hit-stop, and
  it staggers for twice as long. If its impact meets the enemy's poise it breaks a
  wind-up: it interrupts a goblin but not the chief.
- **Block.** Holding the guard up while facing the attacker cuts a blow to 30% and
  costs 10 stamina. With too little stamina the guard is broken and the blow does 70%.
- **Parry.** A guard raised within 9 ticks (0.15 s) before the blow lands turns it aside
  for no damage and no stamina, and leaves the enemy reeling for a full second, long
  enough for a heavy attack.
- **Dodge.** A quick step (7 ticks against 14 for a walk), backward or in the direction
  being steered, for 10 stamina. The party cannot be hit for 12 ticks from its start,
  so a well-timed dodge passes through a blow even if it stays in reach.
- **Enemy attacks.** The goblin has one, a chop. The chief has two: a blockable cleave
  and an unblockable great sweep that also hits the cells to either side, so a sidestep
  fails and the answer is to back off or dodge. The enemy glows red and its name
  flashes while it winds up an attack that cannot be blocked.
- **Presentation.** A stamina bar, a guard indicator, six action buttons, heavy-swing
  and guard poses for the sword, a parry spark, a low lunge on a dodge, new floating
  numbers and new sounds for every outcome. A one-time tip explains the three answers
  to a wind-up the first time one happens.

### Controls

| Action | Keys |
| --- | --- |
| Light attack | J, or left click |
| Heavy attack | K, or Shift + left click |
| Block and parry | hold L, or hold right click |
| Dodge | Space (back, or the way you are steering) |
| Journal | B (was J) |

This follows GAMEPLAY_DESIGN: left mouse attacks, right mouse blocks, Space dodges.
Attack moved off Space, as flagged in milestone 1.

### Decisions made

- **A parry is a well-timed block, not a separate button.** One guard input, with
  timing deciding the result.
- **Dodge is a fast grid step with a short window of safety.** It keeps grid movement
  intact while still rewarding timing.
- **Poise against impact** decides interruption, with plain numbers in world data, so
  creators can make an enemy that shrugs off heavy blows without new code.
- **The guard only works to the front.** With one character this is simple; party
  positioning will build on it.

### Tests executed

- `npm run typecheck` — passes.
- `npm test` — 97 unit tests pass. New: 25 in `tests/combat.test.ts` covering stamina,
  heavy attacks, interruption and poise, block, parry, guard break, facing, dodge and
  its safety window, sweep reach, unblockable attacks, attack choice and determinism.
  The full-adventure regression test still passes.
- `npm run build` — production build succeeds.
- `npm run test:browser` — 59 checks pass in headless Chrome, and passed on four runs
  in a row. New checks: heavy and light stamina costs, stamina recovery, dodge back and
  sideways, raising and lowering the guard, blocking a goblin's blow, and a timed parry.
  (The commit message for this work says 64 checks; 59 is the correct count.)

### Known limitations

- **Feel is untested by a person.** Every number here (parry window, dodge safety,
  stamina costs, wind-up lengths) is a first guess that passes tests. Whether combat is
  satisfying, which is the point of Phase 2, needs someone to play it.
- The scripted test player still wins by stepping away from every wind-up, so the
  adventure test does not exercise block, parry or dodge. Those are covered by the
  staged duels in `tests/combat.test.ts` and by the browser playthrough.
- Both of the chief's attacks use the same wind-up pose; only the red glow, the
  flashing name and the log tell them apart.
- Directional attacks (horizontal, vertical, thrust) are not in. GAMEPLAY_DESIGN lists
  them as "eventually".
- Sound still has not been listened to. Tested in headless Chrome only.
- Controls cannot yet be rebound in the interface.

### Recommended next milestone

Play it and tune the numbers. Then Phase 3: character attributes and classes,
equipment, experience and levels, spells, and a second party member with basic AI.

## Milestone 2 — The Forgotten Mines, complete (2026-11-15)

The golden reference adventure is now whole: five connected rooms, one entrance, one
goblin patrol, one locked door, one key, one secret room, one treasure chest, one boss
encounter and one quest. It can be played from the title screen to a victory screen.

### What was implemented

- **World schema 0.2.0.** Door locks, secret doors, floor pickups, chests, item
  categories (weapon, key, consumable, treasure), boss encounters with a spoken
  introduction, and quests with four objective types. `0.1.0` worlds are migrated on
  load; unknown versions are still rejected. See `docs/WORLD_SCHEMA_REFERENCE.md`.
- **Validation.** Locks must name a key item; chests and pickups must hold real items;
  quest objectives must point at things that exist and can be obtained; and every room
  must be reachable counting a locked door as open only once its key has been found.
  A key shut behind its own door is caught before the world can be played.
- **Simulation.** A shared party inventory, picking items up by walking over them,
  chests, locked doors that need their key, secret doors that feel like wall until
  searched, a healing draught, encounter introductions, and quest tracking driven by
  the simulation's own events. Session state version is now 2.
- **Content.** The shaft door is locked. The key lies in the storeroom, past the goblin
  patrol. A secret door in the tunnel hides a cache with a chest (a healing draught and
  a pouch of gold). Behind the shaft door waits the boss, a goblin chief with more
  health, a heavier blow and a slower, more readable wind-up.
- **Art.** The goblin chief (horned helm, plate, war paint, taller), a banded chest with
  open and closed frames, a glinting key, a locked-door texture and a cracked-stone
  texture whose seam is the only hint of the secret door. All drawn in code.
- **Interface.** An objective tracker, a six-slot belt for carried items (click the
  draught or press H to drink), a quest journal (J), a named boss health bar, heal and
  damage numbers, and a victory screen. The automap shows locked doors in red, hides
  the secret door until found, and marks the chest.
- **Audio.** Lock rattle, unlock, secret door rumble, chest, item pickup, drinking,
  boss sting, objective chime and a quest fanfare.

### Decisions made

- **The secret room is a sixth room.** "Five connected rooms" are the five reachable
  by ordinary doors; the hidden cache is the one secret room on top of them.
- **Items are picked up by walking over them.** A modern convenience in place of
  clicking small objects on the floor.
- **The inventory is shared by the party**, not per character. Per-character equipment
  arrives with the RPG systems in Phase 3.
- **The journal and victory screens pause the simulation.** This will need rethinking
  for co-op, where one player cannot pause another.
- **The boss uses the same behaviour as the goblin with different numbers.** A
  distinct boss pattern belongs with Phase 2 combat.

### Tests executed

- `npm run typecheck` — passes.
- `npm test` — 72 unit tests pass. New: 22 tests in `tests/adventure.test.ts`, including
  a scripted player that completes the whole adventure, the same run replayed from the
  same seed, a save and reload mid-adventure, and ten validation cases for locks, keys,
  chests, quests and migration.
- `npm run build` — production build succeeds.
- `npm run test:browser` — 48 checks pass in headless Chrome against the production
  build, playing the full quest through the real keyboard handlers: locked door, secret
  door, chest, belt, journal, goblin patrol, key, draught, unlock, boss introduction,
  boss fight, victory screen, then a defeat and a restart.

### Known limitations

- The scripted test player dodges every wind-up and finishes unhurt, so the tests show
  the adventure can be won, not that its difficulty is right for a person. Balance
  needs human play.
- Sound still has not been listened to.
- Tested in headless Chrome only.
- The secret door's seam may be too easy or too hard to spot; this needs a human eye.
- Still one attack and no block, parry, dodge or stamina (Phase 2).
- No save/load interface yet, though saving and resuming a session is tested.

### Recommended next milestone

Phase 2 combat: heavy attack, stamina, block, parry, dodge, hit reactions, and a boss
pattern that uses them.

## Milestone 1 — Phase 0 and Phase 1: The Forgotten Mines (2026-11-15)

### What was implemented

A playable, browser-based retro first-person dungeon crawler that loads its
adventure from validated world data.

- **Foundation.** Vite, React, TypeScript (strict), Three.js, Zustand, Zod, Vitest, Git.
- **World schema v0.1.0** (`src/schema`). Zod shapes plus a validator that checks unique
  IDs, references, room geometry, two-way connections, door placement, enemy and object
  placement, the start position and reachability. Unknown schema versions are rejected.
- **World engine** (`src/world`). Compiles a world definition into a tile grid, doors,
  props, enemy spawns and baked torchlight.
- **Simulation** (`src/engine`). Fixed 60 Hz steps, driven only by commands, with seeded
  randomness and fully serializable session state. Grid movement, quarter turns, strafing,
  collision, doors, a one-slot input buffer, light attacks with wind-up and recovery,
  hit-stop, and a goblin with sight, pathfinding, a telegraphed attack that can be
  side-stepped, stagger, recovery and death.
- **Renderer** (`src/renderer`). Three.js scene drawn to a 320×200 target and presented
  unfiltered. Vertex-baked torchlight, a light the party carries, distance darkening,
  banded and dithered shading, reduced colour depth, sliding doors, billboard sprites,
  a held sword with a swing animation, hit flash, damage flash and death fade.
- **Original art** (`src/art`). Every texture, sprite, portrait and icon is drawn in code
  from a fixed mine palette. No external art assets.
- **Audio** (`src/audio`). All sounds synthesized with the Web Audio API: footsteps,
  bumps, swing, hit, clang, goblin snarl, wind-up, death, doors, a victory sting, a defeat
  sting and a mine ambience with water drips.
- **Interface** (`src/ui`). A 480×270 logical screen scaled by whole numbers: framed
  viewport, party card with portrait and health, room name, automap, compass, movement
  pad, action buttons, message log, enemy health bar, damage numbers, title and defeat
  screens.
- **The Forgotten Mines** (`src/worlds/forgotten-mines.json`). Five connected rooms, two
  doors, two archways, one goblin patrol, torches and props.

### Structure

```
src/schema     world definition types and validation      (no dependencies on the rest)
src/world      world definition -> compiled grid           (depends on schema)
src/engine     the simulation                              (depends on schema, world)
src/art        generated pixel art                         (pure data)
src/renderer   Three.js presentation                       (reads engine state, never writes it)
src/audio      synthesized sound                           (listens to engine events)
src/game       game loop, input, messages, interface store (the player app's glue)
src/ui         React interface
```

`schema`, `world`, `engine` and `art` have no React, Three.js or browser dependencies and
run in Node. This is a single package for now; the folders match the package boundaries
in ENGINE_ARCHITECTURE.md and can be split out when a second app (the creator) needs them.

### Decisions made

- **World data from day one.** The roadmap places the schema in Phase 4, but the Mines
  load from a validated world file now, so the dungeon is not hard-coded.
- **Co-op groundwork.** Co-op play is planned for after the RPG systems. To keep that an
  added phase and not a rewrite: all input reaches the simulation as commands that name
  the acting character; the simulation is deterministic; session state is serializable;
  party members each carry a controller field.
- **Whole-screen pixel grid.** The interface is laid out on a 480×270 grid at the same
  pixel scale as the 320×200 viewport, so the frame and the view read as one screen.
- **Attack is on Space and left click for now.** GAMEPLAY_DESIGN reserves Space for dodge;
  the key map is plain data and will be revisited when dodge arrives in Phase 2.

### Tests executed

- `npm run typecheck` — passes.
- `npm test` — 49 unit tests pass: schema validation (17), world compiler (6), simulation
  movement, doors, combat, determinism and save/resume (26).
- `npm run build` — production build succeeds.
- `npm run test:browser` — 30 checks pass in headless Chrome against the production build,
  driving the real keyboard handlers: title, movement, collision, strafing, held-key
  walking, all five rooms, doors, goblin alert, wind-up, dodge, combat to a kill, health
  readout, defeat and restart, and no console errors.

### Known limitations

- Sound has been run without errors but has not been listened to; levels and character
  may need tuning.
- Game feel (hit-stop length, camera kicks, swing timing) was checked through tests and
  screenshots, not by a person playing.
- Tested in headless Chrome only. Firefox and Safari are untested.
- One enemy type and one attack. No block, parry, dodge or stamina yet (Phase 2).
- The chest, key, locked door, secret room, boss and quest from the golden reference
  adventure are not in yet.
- Art is a first pass. The portrait in particular would benefit from more work.
- No save/load interface (session serialization itself is tested).
- Controls are not yet configurable in the interface.

### Recommended next milestone

Finish the golden reference adventure (key, locked door, chest, secret room, boss, one
quest), then Phase 2 combat: heavy attack, stamina, block, parry, dodge and hit reactions.
