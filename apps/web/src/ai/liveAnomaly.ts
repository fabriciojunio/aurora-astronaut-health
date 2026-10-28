// The anomaly model over a person's own readings instead of a simulated mission. The personal
// normal comes from their first BASELINE_DAYS days of readings, as in training; the last 24 hours
// are what gets judged.

import { BASELINE_DAYS, MIN_ANOMALOUS_READINGS, type DayAnomaly } from './anomalyMonitor'
import { featureVector, personalBaselines, snapshotsByTime } from './features'
import { assess, type AnomalyModel, type AnomalyResult } from './isolationForest'
import type { VitalReading } from '../domain/vitals'

const DAY_MS = 86_400_000

export function anomalyForReadings(model: AnomalyModel, readings: readonly VitalReading[], now: Date): DayAnomaly {
  const cutoff = now.getTime() - DAY_MS
  const history = readings.filter((r) => Date.parse(r.at) <= cutoff)
  const days = [...new Set(history.map((r) => r.at.slice(0, 10)))].sort()
  if (days.length < BASELINE_DAYS) return { status: 'baseline', daysLeft: BASELINE_DAYS - days.length }

  const baselineDays = new Set(days.slice(0, BASELINE_DAYS))
  const baselines = personalBaselines(history.filter((r) => baselineDays.has(r.at.slice(0, 10))))
  if (!baselines) return { status: 'unavailable' }

  const recent = readings.filter((r) => Date.parse(r.at) > cutoff && Date.parse(r.at) <= now.getTime())
  let worst: { result: AnomalyResult; at: string } | undefined
  let anomalousReadings = 0
  for (const [at, snapshot] of snapshotsByTime(recent)) {
    const x = featureVector(snapshot, baselines)
    if (!x) continue
    const result = assess(model, x)
    if (result.anomalous) anomalousReadings++
    if (!worst || result.score > worst.result.score) worst = { result, at }
  }
  if (!worst) return { status: 'unavailable' }
  return { status: 'assessed', anomalous: anomalousReadings >= MIN_ANOMALOUS_READINGS, anomalousReadings, ...worst }
}
