# Living World — direction and implementation plan

2026-11-22. Written in response to John's first set of ideas, then revised the same
day with his answers to the decisions (section 3). Nothing here is built yet. Decision 4
(how NPCs decide) has a recommendation awaiting his confirmation; the rest are settled.

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
6. **The creator screen.** VISUAL_STYLE_GUIDE section 12 said the creator should look
   like modern creative software, not a DOS application. The Phase 5 creator was built
   in the game's retro style. Resolved: the creator stays retro and the guide has been
   changed (decision 6).

## 3. Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | One shared world, or a world per save? | **A world per save** to start. The engine keeps its server-ready rules so shared worlds (L9) stay possible. |
| 2 | Does the world move while nobody plays? | **Catch up on return.** The world layer simulates the elapsed time in coarse steps when a save is loaded. No always-on server. |
| 3 | What is the creator for? | **The Dungeon Master side.** The creator makes starting worlds and can force-generate content or weave stories into a living world. It is used through a separate player type, the Dungeon Master (a god mode). See section 3a. |
| 4 | How does an NPC decide? | **Recommended: a tiered hybrid** (section 3b). Awaiting John's confirmation. |
| 5 | Gore as a setting? | **Yes.** Full strength by default, with a lower setting. |
| 6 | The creator's look? | **Keep it retro and change the guide.** The creator stays a DOS-style application; retro is key to the whole experience. VISUAL_STYLE_GUIDE sections 3 and 12 have been rewritten. |

### 3a. The Dungeon Master player type

The creator stops being a separate tool that hands a finished file to the game. It
becomes the Dungeon Master's seat at the same table as the players.

- **A controller and actor of its own.** A save can have player characters and one or
  more Dungeon Masters. A Dungeon Master has no body in the world. Its commands go
  through the same validated command pipeline as every player's, name the Dungeon
  Master as the actor, and are recorded in the world's history. The simulation stays
  deterministic: a replay of the same commands gives the same world.
- **What a Dungeon Master can do.**
  - See hidden state: every agent's location, goals, memories, wallet and faction plans,
    and the event log.
  - Force-generate: a new place, dungeon, NPC, faction, quest or event, made by the same
    generator as the creator and validated before it enters the world.
  - Weave a story: a thread of linked events, NPCs and quests that is placed into the
    living world and then plays out through the agents, rather than as a fixed script.
  - Adjust: faction attitudes, prices, weather, a single NPC's goal; pause, step and
    skip time.
- **What a Dungeon Master cannot do.** Execute code, write state directly, or bypass
  validation. Every change is a typed operation the engine checks, exactly as AI
  proposals are.
- **The same screen language.** The Dungeon Master's screens are retro, like the
  creator today: the map, the event log and the agent sheets look like parts of an old
  DOS editor.
- **Solo play.** One person can be both: create a world as Dungeon Master, then play it
  as a character. A setting decides whether a player's save allows Dungeon Master
  commands at all, so a world can also be played without god mode.

### 3b. Recommendation: how NPCs decide

A balanced split between deterministic rules and AI, in three tiers.

1. **Every NPC: rules.** All decisions that change the world (where to go, whom to
   trade with, whether to flee, report a crime, take a job, join a faction) come from
   needs, goals and utility scoring. This is cheap enough to run for thousands of
   agents, works offline, and is deterministic, so catch-up and replays are exact.
2. **Notable NPCs: rules plus an AI voice.** Merchants, guards, innkeepers and anyone
   the player talks to keep rule-based decisions, but AI writes what they say, limited
   to what each one knows. Speech never changes state; any promise or threat in it must
   map to an action the rules allow.
3. **Key figures: AI deliberation at decision points.** Faction leaders, rivals,
   hirelings and characters a Dungeon Master weaves in may consult the AI when a
   significant choice comes up (declare a feud, betray an employer, accept a bribe). The
   engine offers a menu of legal actions with their context; the AI chooses one and
   returns a structured intent; the engine validates it.

Rules that hold across all three tiers:

- **The decision is recorded as a command.** Once chosen, by rules or by AI, the
  decision enters the simulation as a command in the log, so saves and replays stay
  deterministic without calling the AI again.
- **Rules are always the fallback.** No key, a timeout, or invalid output means the
  rule-based choice is used. The world never waits on the AI.
- **A budget.** AI calls are limited per world tick and per catch-up, and spent on the
  NPCs nearest the player first.
- **Catch-up uses rules only.** Time that passed while nobody played is simulated by
  rules; key figures' big choices during catch-up are queued for the AI when the player
  next meets their consequences, or decided by rules if the budget is spent.

Trade-off: this keeps the world cheap, fast and repeatable, at the cost of most NPCs
being only as clever as their rules. The AI is spent where players notice it: in
conversation and in the choices of the people who shape the world.

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
  world schemas, locally first. Each save is its own world (decision 1). A server is
  the same state behind an API.
- **Dungeon Master commands.** A `dm` controller kind beside local, AI and remote. Its
  commands (generate, weave, adjust, time control) are validated operations recorded in
  world history, as described in section 3a.

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
  parchment. Everything, the creator and Dungeon Master screens included, stays a
  low-resolution DOS-era application.
- **Gore setting.** Full by default. A lower setting replaces severing, sprays and
  pools with darker stains and plain deaths, and keeps lasting injuries as rules.
- **Writing.** Terse and cold. No cheerful hints. Names and descriptions in the voice
  of an old module: matter-of-fact about horror.
- **Feedback.** Keep clarity (telegraphs, readable hits), but let damage show on bodies
  and in the log rather than in floating numbers, which can become an option.

## 6. Implementation phases

Each phase ends runnable, tested and pushed. The Mines regression test keeps passing,
and the dungeon game remains playable throughout.

**Phase L0 — Direction reset** (small, first)
PRODUCT_VISION and VISUAL_STYLE_GUIDE updated for the new direction and decisions (done
with this revision); GAMEPLAY_DESIGN to follow with the rules changes. Blood and gore
system (splatter, decals, persistent corpses, gore deaths) with the gore setting,
darker palettes, feral goblins, grim writing pass, lasting injuries, slower healing.

**Phase L1 — Persistent world foundation**
World state separate from the world definition. Save and load, versioned, one world per
save. A world clock with day and night. The world event bus. The coarse world tick and
catch-up on return. The `dm` controller kind with its first commands (view hidden state,
pause and skip time).

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

**Phase L8 — The world learns** (AI layer and the Dungeon Master's tools)
The secure backend and AI provider. NPC speech within what each NPC knows (tier 2) and
key figures' deliberation (tier 3). Memory summaries and rumour wording. A world
director that tracks the player's habits and history (as cabbits-ai tracked interests)
and proposes new content, validated and checked before it enters the world. The
Dungeon Master's force-generate and weave-a-story commands, using the same pipeline.
(Simpler Dungeon Master commands arrive earlier, with the systems they touch.)

**Phase L9 — Shared worlds** (later; decision 1 starts with a world per save)
A server that owns the world, runs it continuously and lets several players live in it,
building on the co-op groundwork.

### Where the existing roadmap goes

- Phase 3b (co-op) folds into L9.
- Phase 6 (visual editor) continues alongside, extended to edit factions, NPCs and
  settlements.
- Phase 6b (dynamic world) is L3 to L5.
- Phase 7 (persistence) moves up to L1.
- Phase 8 (cloud) becomes the backend in L8 and L9.

## 7. First milestone

L0 and the start of L1: the new creative direction applied to the existing Mines and
Crypt (gore with its setting, palettes, injuries, writing), plus save and load of a
world. That proves the tone and the persistence foundation on content that already
works, before any large new system. Decision 4 does not block it: no NPC agents are
built until L3.
