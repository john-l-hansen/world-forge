# Living World — direction and implementation plan

Draft, 2026-11-22. Written in response to John's first set of ideas. Nothing here is
built yet; the open decisions in section 3 need answers before the first irreversible
step.

## 1. The direction, as understood

World Forge moves from a set of one-shot dungeon adventures toward a **persistent,
living world**:

- **Everything has consequences.** Every action becomes a world event. NPCs are agents
  with their own personalities, needs, goals, money and memories. Each reacts to the
  events within its knowledge sphere (what it saw, was told, or heard as rumour) and
  nothing else. The world keeps a record and keeps changing: prices, debts, alliances,
  who rules where.
- **Factions players can change.** Players can join factions, rise or fall in them,
  take part in their politics, turn them against each other, and found their own.
- **Players change the world physically.** They build houses, then improve them into
  manors, keeps and castles. Buildings cost money, materials, labour and time, and they
  matter: they earn, defend, house followers and give their owner standing.
- **Followers.** Players hire people (wages, loyalty, morale, desertion) and tame
  animals as pets that fight and grow with them.
- **The world learns.** As in cabbits-ai, the world watches what the player does and
  grows in response: new rumours, quests, rivals and opportunities that come out of the
  player's own history, not a fixed script.
- **A new creative direction.** Dark, gritty, gory and merciless, in the spirit of
  early Dungeons & Dragons: a realistic, serious RPG where death is real, wounds last
  and the world does not care about the hero.

This is an ongoing direction; more ideas will follow.

## 2. Alignment with what exists

### Already aligned

- **DYNAMIC_WORLD_SYSTEM.md** already specifies most of the first idea: event-driven
  NPCs with personality, layered relationships (trust, fear, respect, suspicion),
  memories with reliability and decay, rumour propagation that prevents global
  knowledge, factions, reputation layers, crime, merchants and versioned persistence.
  Its rules carry over unchanged: deterministic calculations, AI never changes state
  except through validated operations, and only nearby NPCs are simulated in detail.
- **The engine's co-op rules** (commands that name the actor, deterministic steps,
  seeded randomness, serialisable state, renderer and audio read-only) are exactly what
  a persistent, shared or server-run world needs. Nothing built so far has to be thrown
  away.
- **The party system** (one body, rows, a controller per member: local, AI or remote)
  is the base for hirelings and pets: a hireling is a party member with wages and
  loyalty, a pet is a member with different commands.
- **World data stays data.** Buildings, factions, NPCs and their goals all fit as
  validated world data plus world state. AI output is still never code.
- **The creator's provider interface** is where an AI world director plugs in later,
  through a secure backend.

### Not yet aligned (needs a conscious change)

1. **PRODUCT_VISION.md lists "open-world simulation", "multiplayer", "advanced
   crafting" and "massive procedural landscapes" as non-goals** for the initial
   product. The new direction makes open-world simulation the core. The vision document
   should be updated to say so.
2. **The product's shape.** Today World Forge is a creation platform for adventures
   that are played and finished, like modules. A living world is played indefinitely and
   remembered. Section 3 asks how the two relate.
3. **Persistence comes much earlier.** The roadmap has saving in Phase 7 and the cloud
   in Phase 8. A living world needs save and load (and possibly a server) first.
4. **The engine is dungeon-only.** It has rectangular rooms on one level and no
   towns, outdoors, NPCs you can talk to, money, or buildings that change at runtime.
   Each of those is new engine work.
5. **The tone.** The visual style guide and the art so far are dark but not gory.
   Healing is generous (draughts, the cleric's mend), the goblins are faintly
   cartoonish, and there are floating damage numbers and friendly hints. The
   new direction changes art, rules and writing (section 5).
6. **The creator screen.** VISUAL_STYLE_GUIDE section 12 says the creator should look
   like modern creative software, not a DOS application. The Phase 5 creator was built
   in the game's retro style. One or the other should change (section 3).

## 3. Decisions needed before building

1. **One shared world, or a world per player or group?** A single shared world needs a
   server that owns the state and runs the simulation for everyone. A world per save
   can start single-player in the browser and grow into co-op later. Recommendation:
   a world per save first, with the server-ready rules the engine already follows.
2. **Does the world move while nobody plays?** It can advance only while played, or
   catch up (simulate the elapsed time in coarse steps) when the player returns, or run
   continuously on a server. Recommendation: catch up on return. It feels alive and
   needs no always-on server.
3. **What is the creator for now?** It could make starting worlds that then live on
   their own, keep making one-shot adventures, or both. Recommendation: both. A world
   has a starting definition (made by hand or by the creator) and a living state that
   grows from there; dungeons become places within a world.
4. **How does an NPC decide?** Recommendation: deterministic agents (needs, goals and
   utility scoring) for every decision that changes the world, with AI for what NPCs
   say, for summarising memories, and for proposing new world content. The alternative,
   an AI deciding for each NPC, is expensive, slow, not repeatable, and breaks the
   determinism rule.
5. **Gore as a setting?** Recommendation: on by default at full strength, with a lower
   setting for creators and players who want it.
6. **The creator's look:** follow the style guide (modern creative software around a
   retro game preview), or keep the retro creator and change the guide.

## 4. Architecture

The current layers stay, with new ones beside them.

```
world definition (data, validated)   what a world starts as: places, factions, NPCs, laws, prices
        │
world state (plain data, versioned)  what it has become: every agent, wallet, building, memory, event
        │
simulation
  ├─ action layer (exists)           60 Hz steps: movement, combat, doors, the party
  ├─ world layer (new)               coarse ticks (a game minute or hour): agents, economy,
  │                                  factions, construction, travel, rumours
  └─ catch-up                        runs the world layer forward over time nobody played
        │
event bus (new)                      every action and outcome as a typed world event, with
                                     place, actor, target, witnesses and evidence
        │
presentation (exists)                renderer, audio, interface: read only
```

- **Knowledge spheres.** An event reaches an agent only through perception (sight and
  hearing in range), being told, faction channels or rumour, each with a reliability.
  No agent ever reads the global state directly.
- **Level of detail.** Agents near the player run fully every world tick; distant ones
  run in summary (a settlement's economy, a faction's plans) at longer intervals.
- **AI layer.** Behind the provider interface and a secure backend: NPC speech,
  memory summaries, rumour wording, and a world director that proposes new quests,
  events and NPCs from the player's history. Every proposal is structured data that
  passes validation and a content check before it enters the world, as cabbits-ai's
  draft-then-approve objects did. Proposals change the world only through validated
  operations.
- **Persistence.** Save and load the whole world state, versioned and migrated like
  world schemas, locally first. A server is the same state behind an API.

## 5. Creative direction: grim, gory, merciless

- **Violence.** Blood on every telling hit, sprays and pools that stay where they fall,
  bodies that stay where they drop, severed limbs and gore deaths drawn in the same
  pixel art, wounds visible on enemies and on portraits.
- **Mercy, or its absence.** Lasting injuries (a broken arm weakens a grip, a leg wound
  slows), slow natural healing, few and costly healing items, death that is final for
  hirelings and optional permadeath for heroes, hunger, light and fatigue as real
  pressures, enemies that flee, ambush and finish the wounded.
- **Look.** Darker, dirtier palettes; goblins redrawn feral rather than comic; less
  light; grim portraits with scars and wear; an interface of iron, leather and old
  parchment.
- **Writing.** Terse and cold. No cheerful hints. Names and descriptions in the voice
  of an old module: matter-of-fact about horror.
- **Feedback.** Keep clarity (telegraphs, readable hits), but let damage show on bodies
  and in the log rather than in floating numbers, which can become an option.

## 6. Implementation phases

Each phase ends runnable, tested and pushed. The Mines regression test keeps passing,
and the dungeon game remains playable throughout.

**Phase L0 — Direction reset** (small, first)
Update PRODUCT_VISION, VISUAL_STYLE_GUIDE and GAMEPLAY_DESIGN for the new direction
and decisions. Blood and gore system (splatter, decals, persistent corpses, gore deaths),
darker palettes, feral goblins, grim writing pass, lasting injuries, slower healing.

**Phase L1 — Persistent world foundation**
World state separate from the world definition. Save and load, versioned. A world clock
with day and night. The world event bus. The coarse world tick and catch-up on return.

**Phase L2 — Places beyond the dungeon**
Settlements and outdoor areas on the grid (streets, buildings with interiors, walls,
gates), travel between places, outdoor tilesets and sky. NPCs as entities in the world
you can approach, talk to and fight.

**Phase L3 — Agents** (DYNAMIC_WORLD_SYSTEM, initial version)
NPC definitions with personality, needs, goals and schedules. Perception and knowledge
spheres, memory, layered relationships, basic dialogue through structured choices,
witnesses and a first crime and response loop.

**Phase L4 — Economy**
One currency and goods. A wallet for every agent, faction and player. Production and
consumption per settlement, prices from supply and demand, wages, rent, taxes, debt
and loans, merchants whose prices follow reputation and stock.

**Phase L5 — Factions and politics**
Factions as agents with goals, treasuries, territory and members. Joining, ranks,
duties and expulsion. Influence, alliances, rivalries, feuds and wars between factions.
Succession, elections or coups where the faction's rules allow. Players founding
factions.

**Phase L6 — Followers**
Hiring (wages, contracts, loyalty, morale, desertion, betrayal, death) with hirelings
as party members or as workers and guards at the player's property. Taming creatures
(approach, feed, bond, train), pets in the party with their own commands and growth.

**Phase L7 — Building**
Land: buying, claiming, granting by a faction. Structures as data: a house upgrades to
a manor, a keep, a castle; walls, workshops, stables. Construction takes materials,
money, hired labour and time. Buildings earn, defend, store and house followers; they
can be raided, burned and taken.

**Phase L8 — The world learns** (AI layer)
The secure backend and AI provider. NPC speech within what each NPC knows. Memory
summaries and rumour wording. A world director that tracks the player's habits and
history (as cabbits-ai tracked interests) and proposes new content, validated and
checked before it enters the world.

**Phase L9 — Shared worlds** (if chosen in decision 1)
A server that owns the world, runs it continuously and lets several players live in it,
building on the co-op groundwork.

### Where the existing roadmap goes

- Phase 3b (co-op) folds into L9.
- Phase 6 (visual editor) continues alongside, extended to edit factions, NPCs and
  settlements.
- Phase 6b (dynamic world) is L3 to L5.
- Phase 7 (persistence) moves up to L1.
- Phase 8 (cloud) becomes the backend in L8 and L9.

## 7. First milestone, once the decisions are made

L0 and the start of L1: the new creative direction applied to the existing Mines and
Crypt (gore, palettes, injuries, writing), plus save and load of a world. That proves
the tone and the persistence foundation on content that already works, before any
large new system.
