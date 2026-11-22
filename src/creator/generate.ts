/**
 * Generation, end to end: brief → plan (from a provider) → layout → world
 * data → validation. A plan that will not lay out, or a world that fails
 * validation, is tried again with the next seed, a few times, and every
 * failure is reported. Nothing is presented as playable unless it validated.
 */
import { validateWorld, type ValidationIssue } from '../schema/validate';
import type { WorldDefinition } from '../schema/world';
import { assemble } from './assemble';
import type { AdventureBrief } from './brief';
import { layOut } from './layout';
import { localProvider } from './local';
import type { AdventurePlan } from './plan';
import type { WorldProvider } from './provider';

export interface GenerationAttempt {
  seed: number;
  /** What went wrong with this seed, in words. Empty for the one that worked. */
  problem: string;
}

export type GenerationResult =
  | { ok: true; world: WorldDefinition; plan: AdventurePlan; seed: number; attempts: GenerationAttempt[] }
  | { ok: false; plan: AdventurePlan | null; issues: ValidationIssue[]; attempts: GenerationAttempt[] };

const MAX_ATTEMPTS = 12;

export async function generateWorld(brief: AdventureBrief, seed: number, provider: WorldProvider = localProvider): Promise<GenerationResult> {
  const attempts: GenerationAttempt[] = [];
  let lastPlan: AdventurePlan | null = null;
  let lastIssues: ValidationIssue[] = [];
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const s = seed + i;
    let plan: AdventurePlan;
    try {
      plan = await provider.plan(brief, s);
    } catch (e) {
      attempts.push({ seed: s, problem: `The ${provider.label} could not make a plan: ${String(e instanceof Error ? e.message : e)}` });
      continue;
    }
    lastPlan = plan;
    const layout = layOut(plan, s);
    if (!layout) {
      attempts.push({ seed: s, problem: 'The rooms would not fit together; trying another arrangement.' });
      continue;
    }
    let world: WorldDefinition;
    try {
      world = assemble(plan, layout, s);
    } catch (e) {
      attempts.push({ seed: s, problem: `Furnishing the rooms failed (${String(e instanceof Error ? e.message : e)}); trying another arrangement.` });
      continue;
    }
    const checked = validateWorld(world);
    if (!checked.ok) {
      lastIssues = checked.issues;
      attempts.push({ seed: s, problem: `The world failed validation: ${checked.issues[0]?.message ?? 'unknown fault'}` });
      continue;
    }
    attempts.push({ seed: s, problem: '' });
    return { ok: true, world: checked.world, plan, seed: s, attempts };
  }
  return { ok: false, plan: lastPlan, issues: lastIssues, attempts };
}
