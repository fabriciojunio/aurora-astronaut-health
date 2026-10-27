// Builds the labelled dataset used to train and evaluate the anomaly model.
//
//   npx tsx scripts/export-training-data.ts ../../ml/data/dataset.json
//
// Healthy days come from the simulated crew with many seeds and many baseline draws. Anomalies are injected with the
// physiological patterns described in the literature (hypoxia, fever, tachycardia, orthostatic
// drop). All data is simulated and labelled as such.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { BASELINE_DAYS } from '../src/ai/anomalyMonitor'
import { FEATURES, featureVector, personalBaselines, snapshotsByTime } from '../src/ai/features'
import type { VitalKind, VitalReading } from '../src/domain/vitals'
import { CREW, randomFor, simulateDay } from '../src/sim/crew'

const out = process.argv[2]
if (!out) throw new Error('usage: export-training-data.ts <output.json>')

const ANOMALIES: Record<string, Partial<Record<VitalKind, number>>> = {
  hypoxia: { spo2: -5, respiratoryRate: 7, heartRate: 14 },
  fever: { temperature: 1.6, heartRate: 20, respiratoryRate: 5 },
  tachycardia: { heartRate: 32, hrv: -25 },
  orthostatic: { systolic: -24, diastolic: -12, heartRate: 24 },
  hypertension: { systolic: 32, diastolic: 18 },
  // Half-intensity versions show where the model stops seeing the change.
  hypoxia_mild: { spo2: -2.5, respiratoryRate: 3, heartRate: 6 },
  fever_mild: { temperature: 0.7, heartRate: 8, respiratoryRate: 2 },
  tachycardia_mild: { heartRate: 14, hrv: -10 },
  orthostatic_mild: { systolic: -10, diastolic: -5, heartRate: 10 },
  hypertension_mild: { systolic: 14, diastolic: 8 },
}

const START = Date.UTC(2026, 0, 1)
const DAY = 86_400_000
// A personal normal built from only five days varies from draw to draw. Each split uses many
// different baseline draws (never shared between splits) so the threshold reflects that variation.
const SPLITS = [
  { split: 'train', baselines: 30, healthyDays: 4 },
  { split: 'validation', baselines: 10, healthyDays: 4 },
  { split: 'test', baselines: 10, healthyDays: 4 },
] as const
const rows: { split: string; crewId: string; kind: string; day: string; x: number[]; label: number }[] = []

for (const profile of CREW) {
  SPLITS.forEach(({ split, baselines: count, healthyDays }, splitIndex) => {
    for (let b = 0; b < count; b++) {
      const baselineSeed = 10_000 + splitIndex * 1_000 + b
      const history: VitalReading[] = []
      for (let day = 0; day < BASELINE_DAYS; day++) {
        history.push(...simulateDay(profile, new Date(START + day * DAY), {}, randomFor(profile.id, day, baselineSeed)).vitals)
      }
      const baselines = personalBaselines(history)
      if (!baselines) throw new Error(`no baseline for ${profile.id}`)

      const emit = (kind: string, label: number, day: number, readings: VitalReading[]) => {
        for (const snap of snapshotsByTime(readings).values()) {
          const x = featureVector(snap, baselines)
          if (x) rows.push({ split, crewId: profile.id, kind, day: `${profile.id}/${baselineSeed}/${kind}/${day}`, x, label })
        }
      }

      const daySeed = 20_000 + splitIndex * 1_000 + b
      for (let day = 0; day < healthyDays; day++) {
        const date = new Date(START + (BASELINE_DAYS + day) * DAY)
        emit('healthy', 0, day, simulateDay(profile, date, {}, randomFor(profile.id, day, daySeed)).vitals)
      }
      if (split !== 'test') continue
      for (const [name, shift] of Object.entries(ANOMALIES)) {
        const date = new Date(START + 200 * DAY)
        emit(name, 1, 0, simulateDay(profile, date, { vitalShift: shift }, randomFor(profile.id, 0, 30_000 + b)).vitals)
      }
    }
  })
}

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify({ features: FEATURES, simulated: true, rows }))
console.log(`wrote ${rows.length} rows to ${out}`)
