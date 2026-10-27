// Builds the labelled dataset used to train and evaluate the anomaly model.
//
//   npx tsx scripts/export-training-data.ts ../../ml/data/dataset.json
//
// Healthy days come from the simulated crew with many seeds. Anomalies are injected with the
// physiological patterns described in the literature (hypoxia, fever, tachycardia, orthostatic
// drop). All data is simulated and labelled as such.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
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
const BASELINE_DAYS = 5
const rows: { split: string; crewId: string; kind: string; x: number[]; label: number }[] = []

for (const profile of CREW) {
  const history: VitalReading[] = []
  for (let day = 0; day < BASELINE_DAYS; day++) {
    history.push(...simulateDay(profile, new Date(START + day * 86_400_000), {}, randomFor(profile.id, day, 1)).vitals)
  }
  const baselines = personalBaselines(history)
  if (!baselines) throw new Error(`no baseline for ${profile.id}`)

  const emit = (split: string, kind: string, label: number, readings: VitalReading[]) => {
    for (const snap of snapshotsByTime(readings).values()) {
      const x = featureVector(snap, baselines)
      if (x) rows.push({ split, crewId: profile.id, kind, x, label })
    }
  }

  // Healthy days: training (seed 100), validation (seed 200) and test (seed 300) never overlap.
  for (const [split, seed] of [['train', 100], ['validation', 200], ['test', 300]] as const) {
    const days = split === 'train' ? 120 : 40
    for (let day = 0; day < days; day++) {
      const date = new Date(START + (BASELINE_DAYS + day) * 86_400_000)
      emit(split, 'healthy', 0, simulateDay(profile, date, {}, randomFor(profile.id, day, seed)).vitals)
    }
  }
  for (const [name, shift] of Object.entries(ANOMALIES)) {
    for (let day = 0; day < 10; day++) {
      const date = new Date(START + (200 + day) * 86_400_000)
      emit('test', name, 1, simulateDay(profile, date, { vitalShift: shift }, randomFor(profile.id, day, 400)).vitals)
    }
  }
}

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify({ features: FEATURES, simulated: true, rows }))
console.log(`wrote ${rows.length} rows to ${out}`)
