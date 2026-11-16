# CLAUDE.md — Project Instructions

## Project identity

We are building a browser-based retro first-person RPG engine and AI-powered world
creation platform. The visual and gameplay inspiration is early-90s PC RPGs,
particularly Menzoberranzan, Lands of Lore, Eye of the Beholder, Ravenloft and Stonekeep.

## Permanent development rules

- Preserve the early-90s visual identity.
- Build a reusable game engine, not a single game.
- Keep engine systems independent of the creator interface.
- Keep world content data-driven.
- Use TypeScript throughout.
- Maintain strict world schemas.
- Never allow AI-generated content to execute arbitrary code.
- Keep the application runnable at every milestone.
- Prefer working functionality over placeholder interfaces.
- Do not remove working features without explicit justification.
- Do not introduce unnecessary dependencies.
- Maintain documentation when changing architecture.

## Engine rules that keep co-op possible

- Everything a player does reaches the simulation as a command that names the acting character.
- The simulation is deterministic: fixed steps, and all randomness from the session's seed.
- Session state is plain serializable data, separate from the world definition.
- The renderer, audio and interface read simulation state and events. They never write to it.

## Development workflow

Before making substantial changes: inspect the existing implementation, understand the
relevant systems, identify dependencies, and explain the proposed changes briefly. Then
implement incrementally, run type checks and builds, test affected functionality, and fix
regressions before proceeding.

Checks to run before calling anything done:

```
npm run typecheck
npm test
npm run build
npm run preview &      # then, in another shell
npm run test:browser
```

`tests/adventure.test.ts` plays The Forgotten Mines from start to finish. It is the
standing regression test: every major change must keep it passing.

## Definition of done

A feature is not complete merely because code has been written. It must be implemented,
integrated, tested and verified. Never claim that functionality has been tested unless it
has actually been executed.

## Scope discipline

Follow the development roadmap. Do not jump ahead to later milestones while foundational
systems remain broken. When uncertain about a major product decision, explain the
trade-offs and ask before committing to an irreversible architectural choice.
