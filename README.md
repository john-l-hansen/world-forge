# World Forge

A browser-based retro first-person RPG engine and, later, an AI-assisted world creator.
This repository currently holds **The Forgotten Mines**, the golden reference adventure:
a small complete dungeon with a locked door, a key, a secret room, a treasure chest, a
boss and a quest, which the engine loads from validated world data.

```
npm install
npm run dev            # play at http://localhost:5173
npm test               # unit tests
npm run build          # type check + production build in dist/
npm run preview        # serve the production build at http://localhost:4173
npm run test:browser   # browser playthrough (needs Chrome and a running preview)
npm run art            # write the generated art to .art/ for review
```

## Controls

| Key | Action |
| --- | --- |
| W A S D | Step forward, left, back, right |
| Q E (or left/right arrows) | Turn |
| J or left click | Light attack |
| K or Shift + left click | Heavy attack: slow, hits hard, can break a goblin's wind-up, and brings down cracked walls |
| Hold L or right click | Block. Raise it just as a blow lands to parry. A shield in the off hand blocks better |
| Space | Dodge back, or the way you are steering |
| F or Enter | Open and close doors, unlock, search walls, open chests |
| H | Drink a healing draught |
| R | Read a spell scroll at the enemy straight ahead |
| B | Quest journal |
| C, the Sheet button, or click the portrait | Character sheet (click a worn item to take it off; click an item on the belt to equip it; the row button moves the character forward or back) |
| Tab, or click a party cell | Take over the next character. The one you leave is played by the party AI |
| 1 to 4 | Cast one of the driven character's spells, for mana |
| M | Sound on or off |
| R | Try again after a defeat or a victory |

The title screen offers three adventures: 1 for The Forgotten Mines with Brannoc
alone, 2 for the Mines with a party of four, 3 for The Sunken Crypt (or open the page
with `#party` or `#crypt` in the address). O opens a world file (`.json`) from your
computer; it is checked first, and a file with faults is listed, not played. In a party, the front row fights
with weapons and takes the blows from ahead; the back row casts and heals.

Watch the enemy: when it rears back, step away, dodge, block or parry. A red glow means
the blow cannot be blocked.

## Layout

See `docs/DEVELOPMENT_LOG.md` for the structure, decisions, test results and known
limitations, and `docs/WORLD_SCHEMA_REFERENCE.md` for the world data format.
