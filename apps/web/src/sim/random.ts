// Seeded pseudo-random numbers (mulberry32). Not for security: only for reproducible simulations.

export type Random = () => number

export function seeded(seed: number): Random {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Normal distribution with the Box-Muller transform. */
export function gaussian(random: Random, mean: number, sd: number): number {
  const u = Math.max(random(), Number.EPSILON)
  const v = random()
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
