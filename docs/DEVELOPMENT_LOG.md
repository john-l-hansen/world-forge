# Development log — World Forge

## Milestone 9 — Feedback pass from the first play session (2026-11-21)

John played all three adventures and left notes in the status spreadsheet. This
milestone acts on them. The common thread was that things happened without enough
signal on screen.

### What was implemented

- **The character sheet is easy to find.** It was only on the C key. It now has a
  Sheet button beside Journal, and clicking the portrait, or the party cell of the
  character you drive, opens it.
- **Shields matter.** World schema 0.9.0 lets a piece of armour carry a `block`: the
  share of a blocked blow that still lands, and its stamina cost. Only the off hand's
  counts. The Mines' wooden shield lets 12% through for 5 stamina, against 30% for 10
  with a bare guard, and can stop a blow outright. The shield rests at the lower left
  of the view, comes up across it while guarding, jolts when it takes a blow, and
  thuds like wood. The character sheet shows what a block lets through.
- **Pickup feedback.** Picking something up shows its icon and name in a banner
  across the lower view for about two seconds, with a line on what to do with it
  ("On your belt - H to drink", "Strapped to your arm"). A chest's contents share
  one banner. The item's belt slot flashes gold. Floor items glint, a brightening and
  a star, every few seconds from afar, more often within two cells, and at once when
  the party comes close.
- **Cracked walls you smash** (a door kind `breakable`, with a `toughness` of heavy
  blows, 3 if left out). The wall is drawn over its set's own stone with jagged
  cracks and grit at its foot. Each heavy blow throws grit, shakes the view and
  cracks it further, through three looks; the last brings it down in a cloud of dust
  with a long rumble. Searching it says a heavy blow might work, and a light blow
  skitters off and says so. The Mines' hidden cache is now behind one.
- **A draft.** Every hidden way still shut, cracked or secret, breathes a thin
  stream of dust and a low wind that grows louder as the party nears. The log
  mentions the draft the first time the party stands by a cracked wall.
- **Companion feedback.** Every party cell shows its character's hand, as in Eye of
  the Beholder: what they hold, flashing gold when their blow lands, grey while they
  strike, blue while they cast. A companion's damage number carries their name,
  their blows shake the view less, and their bolt starts from their side of the view.

### Decisions made

- **Breakable walls are a new kind, not a change to secret doors.** The quiet
  secret door stays, for secrets meant to be hard; the crypt's walled-up way is
  still one, since John found its colour difference clear enough.
- **Only heavy blows break a wall**, so the action ties into combat and the heavy
  attack has a second use.
- **Session state is now version 8** (it counts the blows on each wall). Version 7
  sessions still load.

### Tests executed

- `npm run typecheck` and `npm run build` — pass.
- `npm test` — 201 unit tests pass in 11 files. New: five on shields (the numbers a
  shield gives, a blow that barely lands, a shield holding where a bare guard breaks,
  an unblockable attack, and validation), and on walls: the cracked wall from first
  bump to collapse, a tougher wall, validation of `toughness`, and loading a
  version 7 session.
- `tests/adventure.test.ts`, the standing regression for the Mines, passes. It now
  smashes the cracked wall where it used to search the secret door.
- `npm run test:browser` — 135 checks pass in headless Chrome. New: the Sheet button
  and clickable portrait, the party sheet from the driven cell, the key glinting when
  the party comes close, the pickup banner, the belt flash, the shield going on and
  coming up on guard, the sheet's block line, the draft in the log and as dust, the
  cracked wall from search through a light blow and three heavy ones, and the
  party's hands and named damage numbers.

### Known limitations

- **None of this has been played by a person yet.** The shield may now make the
  chief too easy; the glint timing, banner length and the draft's loudness are first
  guesses.
- The new sounds (shield thud, crunch, collapse, wind) have not been heard by a
  person.
- Companions still do not block, dodge or use items, and the hand shows the main
  hand only.
- The weapon swing is still the sword's for every weapon.
- The crypt has no cracked walls; it could use one.

### Next milestone

Play it again and tell me what still feels wrong. Then Phase 5, the AI world creator.

## Milestone 8 — Phase 4: the world engine, and a second world (2026-11-16)

The engine now plays a second adventure that shares nothing with The Forgotten Mines
but the engine itself. Phase 4's acceptance criteria are met.

### What was implemented

- **One loader** (`src/world/load.ts`). Migrate, validate, compile: the only way a
  world reaches the engine, whether it is bundled or opened from a file. Nothing in a
  world file is executed. A world that fails is reported with its faults and is never
  compiled or played.
- **World schema 0.8.0.** A second environment (`crypt`), two more enemy visuals
  (`skeleton`, `warden`), three more props (`sarcophagus`, `urn`, `bones`), a quest
  `kind` (`main` or `side`), and an optional `alertText` on an enemy. `0.7.0` worlds
  are migrated with nothing changed.
- **Tilesets by environment.** Each region names an environment. The compiler records
  the environment of every cell, the renderer builds one atlas row per environment the
  world uses, and each cell, door and secret door is dressed from its own. One world
  can mix environments.
- **The crypt's art, drawn in code.** A tileset of dressed grey stone with burial
  niches, flagstones, a vaulted ceiling and bronze doors; a skeleton and the Warden in
  all nine poses; a sarcophagus, an urn and a scatter of bones.
- **Several quests.** The journal lists every quest the party holds, main quests
  first. The objective plate shows the next thing to do. The adventure is won when
  every main quest is done; a side quest is reported and does not end anything.
- **The Sunken Crypt** (`src/worlds/sunken-crypt.json`). Seven rooms joined in a loop,
  the first in the mine's stone and the rest in the crypt's. A rogue and a cleric. Four
  skeletons and the Warden of Ash. A main quest in three steps (get into the vault, lay
  the Warden to rest, take the chalice) and a side quest (the embalmers' coffer). Two
  ways into the vault: the sigil from the coffer unlocks the bronze door, or a
  walled-up door in the chapel can be found by searching.
- **Opening a world file.** The title screen's "Open file" (or O) takes a `.json` world
  from the player's computer and plays it. A file with faults gets a page listing them
  and a way back.
- **Sound by place and by enemy.** The crypt has its own ambience (a low beating hum
  and distant knocks), and the dead rattle and clatter where goblins snarl.
- **Title screen.** Four choices: Mines, Mines: party, Crypt, Open file. The mouse
  controls moved into the key list.

### What the audit found

Before starting, the code was searched for anything tied to the Mines. The engine,
renderer and interface named no rooms, items, enemies or quests. Three assumptions did
need removing: one tileset whatever the region said, only the first quest shown, and a
goblin's snarl for every enemy's alert line and sound. A fourth turned up in play: the
wind-up message assumed an attack's name was a verb ("rears back to chop"), which read
badly for "raking cut". It now reads "rears back for a chop".

### Tests executed

- `npm run typecheck` and `npm run build` — pass.
- `npm test` — 193 unit tests pass in 11 files. New: 13 in `tests/crypt.test.ts`. The
  crypt loads through the loader, uses two environments, shares no IDs with the Mines,
  and is won by a scripted player by both routes (with the sigil, and by the walled-up
  way without it), identically from the same seed. The loader refuses text that is not
  JSON, a broken reference, an unknown schema version and a behaviour that is not on
  the engine's list, and migrates a 0.7.0 world.
- `tests/adventure.test.ts`, the standing regression for the Mines — passes unchanged.
- `npm run test:browser` — 117 checks pass in headless Chrome. The 97 earlier checks
  pass, with one reworded for the new title labels. The 20 new ones load the crypt
  from the title screen, check the party, journal and objective, compare the colour of
  the view in the adit and in the hall to confirm the two tilesets, find the vault door
  locked, beat the skeletons in the ossuary, open the walled-up way, meet the Warden,
  then open a good world file, a faulty one and one that is not JSON.

### Known limitations

- **Nobody has played the crypt.** Its numbers are first guesses. In the browser it
  has been played as far as meeting the Warden; the whole of it has been won only by
  the scripted player in the unit tests.
- Rooms are still rectangles on one grid, on one level. There are no stairs between
  levels, no outdoor places, and no room shapes other than rectangles.
- Two environments exist. Each new one needs a tileset drawn in code and an entry in
  the engine's list; a world cannot bring its own art.
- Enemies have one behaviour (`melee_aggressive`). There are no ranged or casting
  enemies yet.
- The crypt's new art has been checked in contact sheets and screenshots only, and its
  sounds have not been heard by a person.
- An opened world file is not remembered: reloading the page returns to the bundled
  adventures. Saving and importing projects is Phase 7.
- The Ashen Chalice uses the coin-pouch icon, and the Warden's glaive swings like a
  sword.

### Next milestone

Phase 4 is complete, and the roadmap's next phase in order is Phase 5 (the AI world
creator). Before that, both earlier phases still want a person's judgement: play the
Mines, the party and the crypt, and tune from that. Phase 3b (co-op) is still open and
needs a decision about where its server runs.

## Milestone 7 — Phase 3, part 4: the party (2026-11-16)

Phase 3 is complete with this milestone.

### Decision taken

John chose party model 3 from the options set out under milestone 6: **one body with a
front and a back row**. The party moves as a single unit, as in the reference games.
The player drives one character and can switch; the others are played by the party AI.
In co-op, each player will drive one character's actions while one of them steers.

### What was implemented

- **World schema 0.7.0.** A character can have a `row` (front or back; a class default
  applies if it is left out) and a list of `spells` it knows. A spell's `shape` can now
  be `heal` as well as `bolt`. `0.6.0` worlds are migrated with nothing changed.
- **Rows.** Front-row characters strike with weapons and take the blows that come from
  ahead. The back row is out of reach of both. Blows from behind fall on the back row,
  blows from the side can find anyone, and a sweep catches a whole row. When nobody in
  front is left standing, the back row becomes the front line. A character can be moved
  between rows at any time.
- **Control.** Every character has a controller: the local player, the party AI, or
  (later) a remote player. A `control` command hands a character to the player and the
  one they were driving to the AI. Only the driven character takes orders. If the
  driven character falls, the next one standing is taken over. The party is lost only
  when everyone has fallen.
- **Mana and spells.** Casters have mana, which returns slowly and grows with level. A
  `cast` command casts a known spell, and is refused without the mana or a target. The
  new healing shape mends whoever is hurt worst and never heals past full health.
- **Party AI.** A companion, in order: heals a companion at 60% health or less if it
  knows a healing spell; casts a bolt at an enemy straight ahead that has noticed the
  party; otherwise fights with its weapon from the front line. The rogue waits for an
  opening and then hits harder. Each class acts at its own pace. Companions never move
  the party, open doors, use items, block or dodge.
- **A second adventure to choose.** The title screen offers "Brannoc alone" (the
  adventure as first built, unchanged) and "A party of four": Brannoc the fighter and
  Sela the rogue in front, Ilvane the mage and Maren the cleric behind, against a
  stronger mine (tougher goblins, a second goblin in the hall, a much tougher chief).
  The party world is derived from the solo world in code, so the two cannot drift
  apart. The choice is kept in the address (`#party`).
- **Interface.** With more than one character the party card becomes four cells, two
  across: a portrait, name, and health, stamina and mana bars, with the driven
  character picked out in gold and a letter for the row. Click a cell or press Tab to
  take a character over. A caster's spells appear in a bar above the map, on the
  number keys. The character sheet follows the driven character, shows mana and known
  spells, and has a button to change row. A lone adventurer keeps the original card.
- **Presentation.** Portraits for the rogue, mage and cleric. The held weapon is the
  driven character's: sword, dagger, staff or mace, raised while casting. The log says
  "you" for the driven character and names companions; a companion's misses and
  fumbles are left out. Companions' blows are quieter, shake the view less and show
  smaller numbers. New sounds for healing, changing character, changing row and a
  companion falling.

### Tests executed

- `npm run typecheck` and `npm run build` — pass.
- `npm test` — 180 unit tests pass in 10 files. New since milestone 6: 38 in
  `tests/party.test.ts` (rows and who gets hit, control and hand-over, falling and
  defeat, mana and healing, each class's AI behaviour, a full win of the party world by
  a scripted player, determinism from a seed, save and reload) and 6 in
  `tests/messages.test.ts` (both title-screen worlds validate; log wording for the
  driven character, companions and healing; the solo wording is unchanged).
- `tests/adventure.test.ts`, the standing regression for the solo adventure — passes
  unchanged. Solo play uses the same random numbers in the same order as before.
- `npm run test:browser` — 97 checks pass in headless Chrome. The 71 solo checks
  pass unchanged. The 26 new ones choose the party from the title screen, switch
  characters with Tab and by clicking, check the held weapon and spell bar, change row
  on the character sheet, walk into the hall as the mage, cast with the 1 key, win the
  fight against both goblins alongside the three companions, and heal as the cleric.

### Known limitations

- **Nobody has played the party world.** Its balance (goblin and chief health, mana
  costs, how fast companions act) is a first guess. In the browser only its first
  fight has been played, by a script; the whole of it has been won only by the scripted
  player in the unit tests.
- Companions are simple. They do not block, dodge, step out of a sweep or use items,
  so the player still has to move the party out of danger.
- A fallen character stays down until the adventure is restarted. There is no revival.
- The weapon swing is the sword's for every weapon.
- The party cells show bars, not numbers; the numbers are in the tooltip and on the
  character sheet.
- The number keys do two jobs: 1 and 2 choose the adventure on the title screen, and
  1 to 4 cast spells in play.
- The journal and character sheet still pause the game. That has to change for co-op.
- The portraits, held weapons and party panel have been checked by eye in screenshots
  only, and the new sounds have not been heard by a person.

### Next milestone

The roadmap's next phase is Phase 3b (co-op play), which the roadmap says should start
only once single-player combat and the party are solid. They are built and tested but
not yet judged in play, so the next step should be a play session and a tuning pass,
then a choice between Phase 3b and Phase 4 (world schema and loader, already largely
brought forward).

## Milestone 6 — Phase 3, part 3: spells and scrolls (2026-11-15)

### What was implemented

- **World schema 0.6.0.** A world can define `spells`: name, element (fire, ice or
  lightning), shape (a bolt, for now), range, damage, impact, cast time, recovery and
  mana cost. A consumable item can have the effect `cast` with a `spellId`, which makes
  it a scroll. `0.5.0` worlds are migrated.
- **Simulation.** Reading a scroll starts a cast that takes its time and then strikes
  the first enemy straight ahead within range, if no wall or closed door is in the way.
  Magic ignores armour, is sharpened by intelligence, staggers like a heavy blow and
  can break a wind-up if its impact meets the enemy's poise. A scroll is kept if there
  is nothing to strike, and the spell fades if the target leaves the line mid-cast.
- **Content.** A Scroll of storms lies in the mine hall. It casts Storm bolt: 14 to 20
  damage at up to five cells.
- **Presentation.** A jagged bolt drawn fresh each frame from the caster's hand to the
  target, a flash, a floating damage number, a rising hum for the cast and a crack and
  rumble for the strike. Read a scroll with R or by clicking it on the belt.

### Decisions made

- **Spells are world data and scrolls reuse them.** The same spell definition will
  serve a mage spending mana once casters arrive; a scroll simply casts it for free.
  This also matches the reference board's point that one effect should serve both a
  combat action and a scripted scene.
- **One shape so far (bolt).** Area effects, healing spells and status effects wait
  for the party, since they need casters and allies to be worth designing.

### Tests executed

- `npm run typecheck` and `npm run build` — pass.
- `npm test` — 136 unit tests pass. New: 13 in `tests/spells.test.ts` (pickup, cast
  timing, damage, range, walls and doors, refusal with no target, fizzling,
  interruption against poise, experience and quest credit for a spell kill, being busy
  while casting, determinism, and three validation cases).
- `npm run test:browser` — 71 checks pass in headless Chrome, including picking up
  the scroll, keeping it when nothing is ahead, and striking the chief with it.

### Known limitations

- The bolt is drawn as thin lines and reads as lightning only just. It is the same
  for every element apart from colour.
- Mana exists as a formula but no character spends it yet.
- R reads a scroll during play and restarts after a defeat or victory. The two never
  overlap, but the key is doing two jobs.

### Also in this milestone

- **The great sweep has its own wind-up pose.** The chief hauls the blade back low at
  the hip for a sweep and raises it overhead for a cleave, so the two can be told apart
  by silhouette as well as by the red glow. This closes a limitation noted in
  milestone 3. Checked by eye on the sprite sheet; not yet seen in play by a person.

### Open decision before the rest of Phase 3: how the party works

Party switching and party AI are the remaining Phase 3 tasks, and they depend on a
choice that is hard to undo and that also shapes co-op:

1. **One body, classic style.** The party moves as a single unit, as in Eye of the
   Beholder and Lands of Lore. The player acts through one active character and can
   switch; the others attack, cast and heal on their own. Simple, faithful to the
   references, and it keeps grid movement and encounters as they are. In co-op,
   though, several players would share one body, so someone has to steer.
2. **Separate bodies.** Each character stands in their own cell and moves on their
   own. This fits "each player controls one party member" in co-op, and makes
   positioning matter (the rogue behind the enemy). It is a much larger change:
   companion pathfinding, formation, doors and corridors with four bodies, and a view
   that only ever shows one character's eyes.
3. **One body now, with rows.** As option 1, plus a front and back row inside the
   party's cell, so the fighter shields the mage. Co-op players each drive one
   character's actions while one of them steers, as in a tabletop party.

Recommendation: option 3. It matches the reference games, keeps everything built so
far, gives classes distinct roles, and gives co-op a workable shape without a rewrite.
The cost is that co-op players do not move independently.

## Milestone 5 — Phase 3, part 2: equipment and armour (2026-11-15)

### What was implemented

- **World schema 0.5.0.** A new `armour` item category with a `slot` (off hand, head,
  body, hands, feet, accessory) and a `defence` value. A character's `equipment` now has
  seven optional slots. `0.4.0` worlds are migrated.
- **Simulation.** Each party member carries their own equipment in the session. Armour
  takes its defence off every blow that lands, down to a minimum of 1, before a block
  is applied. `equip` and `unequip` commands move items between the pack and the
  slots; whatever is replaced goes back in the pack. Armour found for an empty slot is
  put straight on. A character with nothing in the main hand fights with bare hands.
- **Content.** The miner's chest now also holds a studded jerkin (body, defence 2), and
  a wooden shield (off hand, defence 1) lies in the storeroom.
- **Interface.** The belt shows what is carried; clicking armour or a weapon equips it.
  The character sheet lists what is worn and total defence, and clicking a worn item
  takes it off. Floor pickups now have their own sprites (key, shield, or a sack for
  anything without art). The sword is hidden when none is held.

### Decisions made

- **Changing equipment is immediate**, like raising the guard: it is not queued behind
  a swing. Drinking a draught still takes its turn.
- **Armour is flat damage reduction.** Simple to read and to balance; percentage armour
  can come later if needed.
- **A shield is armour in the off hand** and does not yet change how blocking works.

### Tests executed

- `npm run typecheck` and `npm run build` — pass.
- `npm test` — 123 unit tests pass. New: 11 in `tests/equipment.test.ts` (starting
  gear, auto-equip, equip and unequip, refusals, defence and its minimum, bare hands,
  save and reload, and four validation cases).
- `npm run test:browser` — 68 checks pass in headless Chrome, including wearing the
  jerkin from the chest, taking it off on the character sheet, putting it back on from
  the belt, and picking up the shield.

### Known limitations

- With the jerkin, the shield and two levels, the chief is now noticeably easier.
  Balance has not been revisited and needs human play.
- There is one weapon in the adventure, so swapping weapons is tested only with bare
  hands against the sword.
- No art shows worn armour on the portrait or in the view.

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
