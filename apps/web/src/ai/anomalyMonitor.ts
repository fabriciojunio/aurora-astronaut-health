// Runs the anomaly model over a mission day. The personal normal comes from the first days of the
// mission, the same way the training data was built, so the app and the model agree on "normal".

import type { ScenarioDay } from '../sim/scenarios'
import { featureVector, personalBaselines, snapshotsByTime } from './features'
import { assess, type AnomalyModel, type AnomalyResult } from './isolationForest'

export const BASELINE_DAYS = 5
// One odd reading is noise more often than illness; same rule the training metrics use per day.
export const MIN_ANOMALOUS_READINGS = 2

export type DayAnomaly =
  | { status: 'baseline'; daysLeft: number }
  | { status: 'unavailable' }
  | { status: 'assessed'; anomalous: boolean; anomalousReadings: number; result: AnomalyResult; at: string }

/** Returns the most anomalous reading of the day for one crew member and whether the day is flagged. */
export function anomalyForDay(
  model: AnomalyModel,
  days: readonly ScenarioDay[],
  crewId: string,
  dayIndex: number,
): DayAnomaly {
  if (dayIndex < BASELINE_DAYS) return { status: 'baseline', daysLeft: BASELINE_DAYS - dayIndex }
  const vitalsOf = (d: ScenarioDay | undefined) => d?.crew.find((c) => c.crewId === crewId)?.vitals ?? []
  const baselines = personalBaselines(days.slice(0, BASELINE_DAYS).flatMap(vitalsOf))
  if (!baselines) return { status: 'unavailable' }

  let worst: { result: AnomalyResult; at: string } | undefined
  let anomalousReadings = 0
  for (const [at, snapshot] of snapshotsByTime(vitalsOf(days[dayIndex]))) {
    const x = featureVector(snapshot, baselines)
    if (!x) continue
    const result = assess(model, x)
    if (result.anomalous) anomalousReadings++
    if (!worst || result.score > worst.result.score) worst = { result, at }
  }
  if (!worst) return { status: 'unavailable' }
  return { status: 'assessed', anomalous: anomalousReadings >= MIN_ANOMALOUS_READINGS, anomalousReadings, ...worst }
}
