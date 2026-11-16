/**
 * Seeded random numbers (mulberry32). The generator state lives in the
 * session, so the same seed and the same commands always give the same game.
 */
export function nextRandom(holder: { rng: number }): number {
  holder.rng = (holder.rng + 0x6d2b79f5) | 0;
  let t = holder.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Whole number from min to max inclusive. */
export function randomInt(holder: { rng: number }, min: number, max: number): number {
  return min + Math.floor(nextRandom(holder) * (max - min + 1));
}

/** Stand-alone generator for art and other non-simulation uses. */
export function makeRng(seed: number): () => number {
  const holder = { rng: seed | 0 };
  return () => nextRandom(holder);
}
