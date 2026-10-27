// Simulated crew. Real astronaut records are privacy-protected, so the demo uses synthetic people
// built from published adult ranges, each with their own normal (Mars-500: large individual
// differences). Every value produced here is labelled "simulated".

import type { CheckIn, Symptom } from '../domain/checkin'
import { VITAL_KINDS, type VitalKind, type VitalReading } from '../domain/vitals'
import { clamp, gaussian, seeded, type Random } from './random'

export interface CrewProfile {
  id: string
  name: string
  role: string
  baseline: Record<VitalKind, { mean: number; sd: number }>
  sleepHours: number
  prescribedResistanceMin: number
}

export const CREW: readonly CrewProfile[] = [
  {
    id: 'crew-1',
    name: 'A. Rivera',
    role: 'Commander',
    baseline: {
      heartRate: { mean: 52, sd: 3 }, hrv: { mean: 68, sd: 6 }, spo2: { mean: 98, sd: 0.6 },
      systolic: { mean: 114, sd: 5 }, diastolic: { mean: 72, sd: 4 }, temperature: { mean: 36.6, sd: 0.15 },
      respiratoryRate: { mean: 13, sd: 1 },
    },
    sleepHours: 7.2,
    prescribedResistanceMin: 60,
  },
  {
    id: 'crew-2',
    name: 'K. Tanaka',
    role: 'Flight engineer',
    baseline: {
      heartRate: { mean: 66, sd: 3 }, hrv: { mean: 48, sd: 5 }, spo2: { mean: 97.5, sd: 0.6 },
      systolic: { mean: 122, sd: 5 }, diastolic: { mean: 78, sd: 4 }, temperature: { mean: 36.8, sd: 0.15 },
      respiratoryRate: { mean: 15, sd: 1 },
    },
    sleepHours: 6.9,
    prescribedResistanceMin: 60,
  },
  {
    id: 'crew-3',
    name: 'M. Okafor',
    role: 'Crew medical officer',
    baseline: {
      heartRate: { mean: 60, sd: 3 }, hrv: { mean: 58, sd: 5 }, spo2: { mean: 98.2, sd: 0.5 },
      systolic: { mean: 118, sd: 5 }, diastolic: { mean: 75, sd: 4 }, temperature: { mean: 36.7, sd: 0.15 },
      respiratoryRate: { mean: 14, sd: 1 },
    },
    sleepHours: 7.4,
    prescribedResistanceMin: 60,
  },
]

/** Day-level effects a scenario applies on top of a person's normal. */
export interface DayEffects {
  vitalShift?: Partial<Record<VitalKind, number>>
  sleepShift?: number
  resistanceFactor?: number
  hydrationMl?: number
  stress?: number
  symptoms?: Symptom[]
}

const LIMITS: Record<VitalKind, [number, number]> = {
  heartRate: [35, 180], hrv: [5, 200], spo2: [80, 100], systolic: [80, 200], diastolic: [45, 120],
  temperature: [35, 41], respiratoryRate: [8, 40],
}
const DECIMALS: Record<VitalKind, number> = {
  heartRate: 0, hrv: 0, spo2: 1, systolic: 0, diastolic: 0, temperature: 1, respiratoryRate: 0,
}

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits

export function simulateDay(
  profile: CrewProfile,
  day: Date,
  effects: DayEffects,
  random: Random,
  readingsPerDay = 4,
): { vitals: VitalReading[]; checkIn: CheckIn } {
  const vitals: VitalReading[] = []
  for (let i = 0; i < readingsPerDay; i++) {
    const at = new Date(day.getTime() + (7 + i * 4) * 3_600_000).toISOString()
    for (const kind of VITAL_KINDS) {
      const { mean, sd } = profile.baseline[kind]
      const value = gaussian(random, mean + (effects.vitalShift?.[kind] ?? 0), sd)
      vitals.push({
        crewId: profile.id,
        kind,
        value: round(clamp(value, ...LIMITS[kind]), DECIMALS[kind]),
        at,
        source: 'simulated',
      })
    }
  }
  const resistance = Math.round(profile.prescribedResistanceMin * (effects.resistanceFactor ?? 1) * clamp(gaussian(random, 1, 0.05), 0.8, 1.1))
  const checkIn: CheckIn = {
    crewId: profile.id,
    at: new Date(day.getTime() + 6.5 * 3_600_000).toISOString(),
    sleepHours: round(clamp(gaussian(random, profile.sleepHours + (effects.sleepShift ?? 0), 0.3), 0, 16), 1),
    sleepQuality: (effects.sleepShift ?? 0) < -1 ? 2 : 4,
    mood: (effects.stress ?? 2) >= 4 ? 2 : 4,
    stress: effects.stress ?? 2,
    symptoms: effects.symptoms ?? [],
    hydrationMl: effects.hydrationMl ?? Math.round(clamp(gaussian(random, 2700, 150), 2500, 3200)),
    resistanceMin: clamp(resistance, 0, 300),
    aerobicMin: 30,
    prescribedResistanceMin: profile.prescribedResistanceMin,
    prescribedAerobicMin: 30,
    note: '',
  }
  return { vitals, checkIn }
}

export function seedFor(crewId: string, dayIndex: number, scenarioSeed: number): number {
  let h = scenarioSeed ^ (dayIndex * 2654435761)
  for (const ch of crewId) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}

export function randomFor(crewId: string, dayIndex: number, scenarioSeed: number): Random {
  return seeded(seedFor(crewId, dayIndex, scenarioSeed))
}
