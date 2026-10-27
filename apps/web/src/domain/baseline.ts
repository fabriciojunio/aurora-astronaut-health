// Personal baselines: each astronaut is compared with their own normal, not with a population
// range, because Mars-500 showed large individual differences in how people respond to isolation.

export const MIN_BASELINE_SAMPLES = 7
export const MODIFIED_Z_THRESHOLD = 3.5 // Iglewicz & Hoaglin
export const MIN_CONSECUTIVE = 3

export interface Baseline {
  median: number
  mad: number
  samples: number
}

export interface Deviation {
  direction: 'up' | 'down'
  since: string
  count: number
  maxAbsZ: number
}

export interface TimedValue {
  at: string
  value: number
}

function median(sorted: readonly number[]): number {
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

export function computeBaseline(values: readonly number[]): Baseline | undefined {
  const clean = values.filter(Number.isFinite)
  if (clean.length < MIN_BASELINE_SAMPLES) return undefined
  const sorted = [...clean].sort((a, b) => a - b)
  const center = median(sorted)
  const mad = median(sorted.map((v) => Math.abs(v - center)).sort((a, b) => a - b))
  return { median: center, mad, samples: clean.length }
}

/**
 * When almost every baseline value is identical the MAD is zero. The floor keeps the score finite;
 * it should be the measurement resolution of the signal (0.5 % for SpO2, 1 bpm for heart rate),
 * because a relative floor hides clinically relevant drops in tightly regulated signals.
 */
export function modifiedZ(value: number, baseline: Baseline, floor?: number): number {
  const minSpread = floor ?? Math.max(Math.abs(baseline.median) * 0.01, 1e-6)
  return (0.6745 * (value - baseline.median)) / Math.max(baseline.mad, minSpread)
}

/** Looks at the most recent run of out-of-range values; a single outlier never raises a deviation. */
export function sustainedDeviation(
  recent: readonly TimedValue[],
  baseline: Baseline,
  options: { threshold?: number; minConsecutive?: number; floor?: number } = {},
): Deviation | undefined {
  const threshold = options.threshold ?? MODIFIED_Z_THRESHOLD
  const minConsecutive = options.minConsecutive ?? MIN_CONSECUTIVE
  const ordered = [...recent].sort((a, b) => a.at.localeCompare(b.at))
  let run: { direction: 'up' | 'down'; items: { at: string; z: number }[] } | undefined
  for (const point of ordered) {
    const z = modifiedZ(point.value, baseline, options.floor)
    const direction = z > threshold ? 'up' : z < -threshold ? 'down' : undefined
    if (!direction) {
      run = undefined
    } else if (run && run.direction === direction) {
      run.items.push({ at: point.at, z })
    } else {
      run = { direction, items: [{ at: point.at, z }] }
    }
  }
  if (!run || run.items.length < minConsecutive) return undefined
  return {
    direction: run.direction,
    since: run.items[0]!.at,
    count: run.items.length,
    maxAbsZ: Math.max(...run.items.map((i) => Math.abs(i.z))),
  }
}
