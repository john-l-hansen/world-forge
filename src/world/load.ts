/**
 * The one way a world gets into the engine: migrate, validate, compile.
 * Nothing in a world file is ever executed. A world that fails validation is
 * reported with its issues and is never compiled or played.
 */
import { deserializeWorld, validateWorld, type ValidationIssue } from '../schema/validate';
import { compileWorld, type CompiledWorld } from './compile';

export type LoadResult = { ok: true; world: CompiledWorld } | { ok: false; issues: ValidationIssue[] };

/** Load a world from data already parsed, such as a bundled adventure. */
export function loadWorld(data: unknown): LoadResult {
  const result = validateWorld(data);
  return result.ok ? { ok: true, world: compileWorld(result.world) } : { ok: false, issues: result.issues };
}

/** Load a world from the text of a world file. Text that is not JSON is reported like any other fault. */
export function loadWorldText(text: string): LoadResult {
  const result = deserializeWorld(text);
  return result.ok ? { ok: true, world: compileWorld(result.world) } : { ok: false, issues: result.issues };
}
