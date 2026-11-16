# Development log — World Forge

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
