# Development log — World Forge

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
