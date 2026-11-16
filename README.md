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
| K or Shift + left click | Heavy attack: slow, hits hard, can break a goblin's wind-up |
| Hold L or right click | Block. Raise it just as a blow lands to parry |
| Space | Dodge back, or the way you are steering |
| F or Enter | Open and close doors, unlock, search walls, open chests |
| H | Drink a healing draught |
| B | Quest journal |
| M | Sound on or off |
| R | Try again after a defeat |

Watch the enemy: when it rears back, step away, dodge, block or parry. A red glow means
the blow cannot be blocked.

## Layout

See `docs/DEVELOPMENT_LOG.md` for the structure, decisions, test results and known
limitations, and `docs/WORLD_SCHEMA_REFERENCE.md` for the world data format.
