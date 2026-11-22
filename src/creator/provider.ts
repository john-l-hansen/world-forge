/**
 * A provider turns a brief into a plan. The first is the local generator:
 * deterministic, offline, no key needed. An AI provider will come later,
 * through a secure backend; it must return the same plan shape, which is then
 * built and validated exactly like a local one. A plan is data, never code.
 */
import type { AdventureBrief } from './brief';
import type { AdventurePlan } from './plan';

export interface WorldProvider {
  readonly id: string;
  readonly label: string;
  plan(brief: AdventureBrief, seed: number): Promise<AdventurePlan>;
}
