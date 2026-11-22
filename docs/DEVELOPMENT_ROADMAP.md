DEVELOPMENT ROADMAP — WORLD FORGE
Status (2026-11-21)
Phases 0, 1 and 2 are built and tested, and The Forgotten Mines is complete as the golden reference adventure. See DEVELOPMENT_LOG.md for the milestone reports.
Phase 2 still needs one thing no test can give: a person playing it and judging whether the combat feels good. Its numbers are first guesses.
The code lives at https://github.com/john-l-hansen/world-forge.
Phase 3 is built and tested: attributes, classes, levels and experience, equipment and armour, consumables, spells and mana, and a party of up to four with rows, character switching and party AI. The party model is one body with a front and a back row (decided 2026-11-16; see the development log, milestone 7). A second adventure, the same mine for a party of four, can be chosen from the title screen.
Phase 4 is built and tested: one loader for every world, tilesets chosen by each region's environment, a second adventure (The Sunken Crypt) that shares nothing with the Mines but the engine, and world files opened from the player's computer (see the development log, milestone 8).
John played the three adventures on 2026-11-21. His notes were acted on in a feedback pass: an easy-to-find character sheet, shields that change blocking, pickup banners and floor glints, cracked walls you smash with heavy blows, a draft near hidden ways, and companion feedback in the party panel (see the development log, milestone 9). A second play session found it felt good.
Next: Phase 5 (the AI world creator), with Phase 3b (co-op) still open.
Two phases were added on 2026-11-15: Phase 3b (co-op play) and Phase 6b (dynamic world simulation).
The world schema and world validation were brought forward from Phase 4, so that The Forgotten Mines loads from world data and is not hard-coded. The schema is at version 0.9.0 (rooms, doors, locks, secret doors, breakable walls, enemies with attack lists, poise and experience, encounters, bosses, objects, chests, pickups, weapons with light and heavy attacks, armour and shields that change blocking, keys, consumables, scrolls, treasure, spells, characters with class, level, attributes, equipment, row and known spells, bolt and healing spells, main and side quests, two environments).
1. Development philosophy
Build incrementally.
Every milestone must produce functioning software.
Do not attempt to build the complete product in one code-generation operation.
Prioritize a playable vertical slice.
Keep the application runnable throughout development.
2. Phase 0: Project foundation (complete)
Objectives
Establish the development environment.
Tasks
Inspect available repository.
Inspect existing tooling.
Establish React and TypeScript.
Configure Vite.
Configure Three.js.
Configure testing.
Establish Git.
Create project documentation.
Define world schema.
Define engine boundaries.
Acceptance criteria
Application starts.
Production build works.
TypeScript checks pass.
Project structure is documented.
Initial tests run.
3. Phase 1: Playable foundation (complete)
Objectives
Create a recognizable retro first-person dungeon crawler.
Tasks
Three.js renderer.
Low-resolution rendering.
First-person camera.
Grid-based movement.
Dungeon geometry.
Room connections.
Collision.
Player health.
One enemy.
Basic attacks.
Enemy health.
Basic enemy behaviour.
Basic sound effects.
Demonstration
The Forgotten Mines.
Five connected rooms.
Acceptance criteria
Player can navigate all rooms.
Walls block movement.
Enemy can be encountered.
Player can damage enemy.
Enemy can damage player.
Health updates correctly.
Game remains playable.
Visual style matches the project.
Added to The Forgotten Mines in milestone 2 (complete), from the golden reference adventure and GAMEPLAY_DESIGN.md section 18
One locked door.
One key.
One treasure chest.
One secret room.
One boss encounter.
One simple quest.
The full adventure is played from start to finish by an automated test (tests/adventure.test.ts), which is the standing regression test for the engine.
4. Phase 2: Combat (built and tested; feel not yet judged by a player)
Objectives
Establish satisfying real-time combat.
Tasks
Light attacks.
Heavy attacks.
Attack timing.
Stamina.
Blocking.
Parrying.
Dodging.
Enemy telegraphs.
Hit reactions.
Stagger.
Damage feedback.
Sound integration.
Acceptance criteria
Attacks have distinct characteristics.
Enemy attacks are readable.
Defensive actions work.
Stamina rules work.
Combat feedback is clear.
Combat is tested.
Status of each task
Light attacks: done.
Heavy attacks: done. Slower, costlier, about twice the damage, breaks a wind-up if its impact meets the enemy's poise.
Attack timing: done. Wind-up and recovery per attack, in world data.
Stamina: done. Spent by attacks, blocks and dodges; returns with rest.
Blocking: done. Front only; 30% damage for 10 stamina; a tired guard breaks.
Parrying: done. A guard raised within 0.15 s of the blow; no damage, enemy reels for a second.
Dodging: done. A quick step with a short window in which the party cannot be hit.
Enemy telegraphs: done. Every attack has a visible wind-up; unblockable ones glow red.
Hit reactions and stagger: done.
Damage feedback: done. Hit-stop, flash, floating numbers, camera response, parry spark.
Sound integration: done, but not yet listened to.
Not done: directional attacks (horizontal, vertical, thrust), which GAMEPLAY_DESIGN lists as "eventually".
Controls
J or left click: light attack. K or Shift + left click: heavy attack. Hold L or right click: block and parry. Space: dodge. B: journal.
5. Phase 3: RPG systems (complete)
Objectives
Establish the basic RPG framework.
Tasks
Character attributes.
Character classes.
Inventory.
Equipment.
Weapons.
Armour.
Consumables.
Experience.
Progression.
Spells.
Party switching.
Basic party AI.
Acceptance criteria
Character data is structured.
Equipment changes statistics.
Inventory updates correctly.
Progression works.
Party members can be managed.
Status of each task
Character attributes: done. Five attributes; all derived stats come from one file of formulas.
Character classes: done as data (fighter, rogue, mage, cleric). All four are playable in the party adventure.
Inventory: done. Shared by the party.
Equipment: done. Seven slots, equip and unequip, auto-equip into empty slots.
Weapons: done. Light and heavy attacks; bare hands when unarmed.
Armour: done. Flat defence taken off every blow.
Consumables: done. A healing draught and spell scrolls.
Experience and progression: done. Levels raise health, stamina and the class's primary attribute.
Spells: done as world data. Cast from scrolls, or by a character who knows them, for mana. Two shapes: a bolt and a heal.
Party switching: done. Tab or a click takes a character over; the one left goes to the party AI. Characters stand in a front or back row.
Basic party AI: done. Companions heal the badly hurt, cast at what is ahead, and fight from the front row. They do not block, dodge, use items or move the party.
Not done: judging any of this in play. The party adventure's numbers are first guesses.
Controls
Tab: next character. Click a party cell: take that character over. 1 to 4: cast the driven character's spells. C: character sheet, with a button to change row.
5b. Phase 3b: Co-op play (added 2026-11-15)
Objectives
Let two to four people each control one party member in the same dungeon.
This phase starts only once single-player combat and the party systems are solid.
Tasks
Server that owns the game state.
Session creation and joining.
One controller per party member (local player, party AI or remote player).
Command transport from each player to the server.
State updates from the server to each player.
Lag handling for movement and combat timing.
Disconnection and reconnection.
Party AI takes over a character whose player leaves.
Replace the screens that pause the game (journal, victory) with ones that do not stop other players.
Acceptance criteria
Two players can join the same adventure and each control one character.
Both players see the same dungeon, enemies and outcomes.
Combat timing (attacks, parries, dodges) remains fair with ordinary network delay.
A player can drop out and rejoin without ending the session.
The single-player game still runs with no server.
Groundwork already in place
See the co-op principles in ENGINE_PRINCIPLES.md: inputs are commands, the simulation is deterministic, session state is serializable, and every party member has a controller.
6. Phase 4: World engine (complete)
Objectives
Separate world definitions from the playable engine.
Tasks
World schema.
Region definitions.
Room definitions.
Connection handling.
Room generation.
Object placement.
Enemy placement.
Encounter definitions.
World loading.
World validation.
Acceptance criteria
Multiple different worlds can load.
World data is validated.
Room references resolve.
Room connections work.
Invalid worlds fail safely.
Status of each task
World schema: done. Version 0.8.0, with step-by-step migration from 0.1.0.
Region definitions: done. A region names an environment, which chooses the tileset and ambience. One world can mix environments.
Room definitions and room generation: done for rectangular rooms on one grid, on one level.
Connection handling: done. Archways, doors, locked doors and secret doors; loops are allowed.
Object placement: done. Torches, props, pickups and chests.
Enemy placement and encounter definitions: done. Encounters place enemies; a boss has an introduction.
World loading: done. One loader for bundled worlds and for files opened from the title screen.
World validation: done. A world with faults is reported and never played.
Proof: The Sunken Crypt, a second adventure in world data only, won by a scripted player by two different routes.
Not done: more than one level, room shapes other than rectangles, outdoor places, and worlds that bring their own art.
7. Phase 5: AI world creator
Objectives
Create adventures through conversation.
Tasks
Guided questions.
Adventure concept.
World structure generation.
Room graph generation.
Encounter generation.
NPC generation.
Quest generation.
Item generation.
Validation.
Deterministic fallback generator.
Provider abstraction.
Acceptance criteria
User can describe an adventure.
System generates structured world data.
World validates.
Engine loads generated world.
No external AI key is required for demo mode.
8. Phase 6: Visual world editor
Objectives
Allow manual customization.
Tasks
Top-down map.
Room selection.
Room properties.
Connections.
Object placement.
Enemy placement.
Encounter editing.
Quest editing.
Undo/redo.
Version history.
Natural-language changes.
Acceptance criteria
Users can modify rooms.
Changes update the canonical world data.
Undo and redo work.
Playtest reflects editor changes.
8b. Phase 6b: Dynamic world simulation (added 2026-11-15)
Objectives
Persistent NPC relationships, factions, reputation and world consequences, as specified in DYNAMIC_WORLD_SYSTEM.md.
Tasks
Follow the three versions in DYNAMIC_WORLD_SYSTEM.md section 24: initial, second and third.
Acceptance criteria
As listed in DYNAMIC_WORLD_SYSTEM.md section 25.
9. Phase 7: Playtest and persistence
Objectives
Make projects persistent.
Tasks
Playtest mode.
Return to editor.
Local saving.
JSON export.
JSON import.
Autosave.
Project management.
Acceptance criteria
Projects survive refresh.
Worlds can be exported.
Worlds can be imported.
Editor and player share the same world definition.
10. Phase 8: Cloud and publishing
Objectives
Prepare the platform for external users.
Tasks
Supabase integration.
User accounts.
Cloud projects.
Project permissions.
Published adventures.
Sharing links.
Acceptance criteria
Users can save projects.
Users can retrieve projects.
Published worlds can be accessed.
Permissions are enforced.
11. Testing requirements
Test:
TypeScript.
Builds.
World schemas.
Room connections.
Collision.
Combat calculations.
Enemy state transitions.
Inventory.
Quest completion.
Serialization.
World regeneration.
Editor/playtest synchronization.
Use automated tests where possible.
Use browser-based tests for actual interaction.
12. Git workflow
Create commits after each stable milestone.
Do not overwrite known working versions without a recoverable commit.
Use clear commit messages.
Maintain a development log.
13. Milestone reporting
After each milestone, report:
What was implemented.
Files changed.
Tests executed.
Build status.
Known limitations.
Remaining work.
Recommended next milestone.
Do not report untested functionality as complete.
14. Scope control
Do not prioritize:
Marketplace.
Open-world simulation.
Advanced crafting.
Complex physics.
Voice acting.
Large-scale asset generation.
These belong to future development.
Multiplayer was on this list until 2026-11-15. Co-op play is now Phase 3b. Other forms of multiplayer (competitive play, large shared worlds) remain out of scope.
15. Immediate priority
The immediate goal is Phase 5, the AI world creator, which will produce worlds for the loader built in Phase 4. The three adventures have been played and tuned once from that play.
Do not spend the initial development effort building the entire creator platform.
Build a playable retro dungeon first.
Then make it extensible.
Then build the AI creator around it.
