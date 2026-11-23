# World Forge

A browser-based retro first-person RPG engine and a world creator that makes new
adventures from a description. It ships with **The Forgotten Mines**, the golden
reference adventure (played alone or with a party of four), and **The Sunken Crypt**.
Every world, bundled, opened from a file or made in the creator, is plain data that
the engine loads only after it validates.

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
| G | Gore: full (the default) or low |
| V | Floating damage numbers on or off (off by default) |
| F5 / F9 | Save the game / load the last save |
| F2 | The Dungeon Master's screen: the clock, every creature's hidden state, the world's history; 1, 2 and 3 pass an hour, eight hours or a day |
| C (title screen) | Continue the last saved game |
| R | Begin again after a defeat or a victory (L loads the last save after a defeat) |

The title screen offers three adventures: 1 for The Forgotten Mines with Brannoc
alone, 2 for the Mines with a party of four, 3 for The Sunken Crypt (or open the page
with `#party` or `#crypt` in the address). O opens a world file (`.json`) from your
computer; it is checked first, and a file with faults is listed, not played. In a party, the front row fights
with weapons and takes the blows from ahead; the back row casts and heals.

Watch the enemy: when it rears back, step away, dodge, block or parry. A red glow means
the blow cannot be blocked.

The world is merciless. Blood stays where it falls, a hard blow can leave a lasting
injury (a broken arm, a torn leg, broken ribs or a cracked skull) that heals only with
time, and healing is scarce. A save holds the whole world, its definition and the state
it reached; the game also saves quietly each time you reach a new room. A save file can
be opened with O like a world file.

The world keeps time, a minute for every second of play, and goes on while you are
away: when you come back to a save, the time since you left has passed (up to 30 days).
Blood dries, the dead are dragged away, and whatever you roused goes back to its place
and licks its wounds.

## The world creator

Press N (or Create) on the title screen, or open the page with `#create`. Describe the
adventure in a sentence or two, or start from a suggestion; the designer reads what it
can from your words, then asks seven quick questions (place, inhabitants, feel, size,
goal, party, difficulty) with its reading already marked. Enter keeps a marked answer,
1 to 3 (or 6) picks another, and "Decide the rest" draws the world up at once.

The world it makes is summarised, checked and mapped. Play it (P), draw another layout,
download it as a world file you can open again with O on the title screen, or start
over. The same description always gives the same world. This first creator is a local
generator: it needs no AI and no key. An AI provider can be added later behind the same
interface, through a secure backend.

## Layout

See `docs/DEVELOPMENT_LOG.md` for the structure, decisions, test results and known
limitations, and `docs/WORLD_SCHEMA_REFERENCE.md` for the world data format.
