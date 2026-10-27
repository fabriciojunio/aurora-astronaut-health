// Turns one set of vital signs into the features the anomaly model sees: how far each signal is
// from that person's own normal. The same function runs in training (via the export script) and
// in the app, so the model never sees features computed differently from how it was trained.

import { computeBaseline, modifiedZ, type Baseline } from '../domain/baseline'
import { RESOLUTION, VITAL_KINDS, type VitalKind, type VitalReading } from '../domain/vitals'

// The seven per-signal deviations, plus two aggregates. Isolation Forest picks one feature per
// split at random, so an anomaly concentrated in one or two signals is isolated slowly; the largest
// deviation and the root mean square make those cases easy to isolate as well.
export const FEATURES = [...VITAL_KINDS, 'maxAbsDeviation', 'rmsDeviation'] as const
export const FEATURE_CLIP = 10

export type PersonalBaselines = Record<VitalKind, Baseline>

export function personalBaselines(history: readonly VitalReading[]): PersonalBaselines | undefined {
  const result: Partial<PersonalBaselines> = {}
  for (const kind of VITAL_KINDS) {
    const baseline = computeBaseline(history.filter((r) => r.kind === kind).map((r) => r.value))
    if (!baseline) return undefined
    result[kind] = baseline
  }
  return result as PersonalBaselines
}

/** Returns undefined when any vital is missing: the model never guesses a missing signal. */
export function featureVector(
  snapshot: Partial<Record<VitalKind, number>>,
  baselines: PersonalBaselines,
): number[] | undefined {
  const vector: number[] = []
  for (const kind of VITAL_KINDS) {
    const value = snapshot[kind]
    if (value === undefined || !Number.isFinite(value)) return undefined
    const z = modifiedZ(value, baselines[kind], RESOLUTION[kind])
    vector.push(round6(Math.max(-FEATURE_CLIP, Math.min(FEATURE_CLIP, z))))
  }
  const maxAbs = Math.max(...vector.map(Math.abs))
  const rms = Math.sqrt(vector.reduce((a, v) => a + v * v, 0) / vector.length)
  return [...vector, round6(maxAbs), round6(rms)]
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

/** Groups readings taken at the same moment into one snapshot per timestamp. */
export function snapshotsByTime(readings: readonly VitalReading[]): Map<string, Partial<Record<VitalKind, number>>> {
  const byTime = new Map<string, Partial<Record<VitalKind, number>>>()
  for (const r of readings) {
    const snap = byTime.get(r.at) ?? {}
    snap[r.kind] = r.value
    byTime.set(r.at, snap)
  }
  return byTime
}
