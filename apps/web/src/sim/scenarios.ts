import type { CheckIn } from '../domain/checkin'
import { scorePvt, type PvtResponse, type PvtResult } from '../domain/cognition'
import type { RadiationEnvironment } from '../domain/radiation'
import { evaluate, type Alert } from '../domain/riskEngine'
import type { VitalReading } from '../domain/vitals'
import { CREW, randomFor, simulateDay, type DayEffects } from './crew'
import { gaussian, type Random } from './random'

export interface ScenarioEvent {
  fromDay: number
  toDay: number
  crewIds?: string[]
  effects?: DayEffects
  cabinCo2Mmhg?: number
  protonStormLevel?: number
  extraDoseMsv?: number
}

export interface Scenario {
  id: string
  title: string
  description: string
  environment: RadiationEnvironment
  doseRateMsvPerDay: number
  startingDoseMsv: number
  days: number
  seed: number
  events: ScenarioEvent[]
}

const START = Date.UTC(2026, 10, 1)

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'healthy-iss',
    title: 'Routine ISS week',
    description: 'Three weeks on the ISS with no events: the system should stay quiet.',
    environment: 'iss',
    doseRateMsvPerDay: 0.8,
    startingDoseMsv: 40,
    days: 21,
    seed: 11,
    events: [],
  },
  {
    id: 'mars-solar-storm',
    title: 'Solar storm on Mars (May 2024 pattern)',
    description:
      'Surface stay on Mars when a solar particle event like the one Curiosity measured on 20 May 2024 arrives.',
    environment: 'mars_surface',
    doseRateMsvPerDay: 0.64,
    startingDoseMsv: 380,
    days: 21,
    seed: 23,
    events: [{ fromDay: 14, toDay: 15, protonStormLevel: 3, extraDoseMsv: 4.5, effects: { stress: 4 } }],
  },
  {
    id: 'sleep-loss',
    title: 'Five nights of short sleep',
    description: 'A flight engineer sleeps about two hours less for five nights before a critical task.',
    environment: 'iss',
    doseRateMsvPerDay: 0.8,
    startingDoseMsv: 60,
    days: 21,
    seed: 37,
    events: [{ fromDay: 10, toDay: 14, crewIds: ['crew-2'], effects: { sleepShift: -2.2, stress: 4 } }],
  },
  {
    id: 'co2-excursion',
    title: 'Cabin CO2 excursion',
    description: 'A scrubber issue raises cabin CO2 to 6 mmHg for four days; two crew members report headaches.',
    environment: 'iss',
    doseRateMsvPerDay: 0.8,
    startingDoseMsv: 60,
    days: 21,
    seed: 41,
    events: [
      { fromDay: 8, toDay: 11, cabinCo2Mmhg: 6 },
      { fromDay: 9, toDay: 11, crewIds: ['crew-1', 'crew-2'], effects: { symptoms: ['headache'] } },
    ],
  },
  {
    id: 'infection',
    title: 'Fever in the crew medical officer',
    description: 'The crew medical officer develops a fever; any crew member must be able to follow the protocol.',
    environment: 'lunar_orbit',
    doseRateMsvPerDay: 0.94,
    startingDoseMsv: 90,
    days: 21,
    seed: 53,
    events: [
      { fromDay: 12, toDay: 15, crewIds: ['crew-3'], effects: { vitalShift: { temperature: 1.6, heartRate: 22, respiratoryRate: 6 }, symptoms: ['fever', 'fatigue'] } },
    ],
  },
  {
    id: 'exercise-gap',
    title: 'Exercise sessions skipped',
    description: 'Workload pushes resistance exercise to a quarter of the prescription and fluid intake drops.',
    environment: 'mars_transit',
    doseRateMsvPerDay: 1.84,
    startingDoseMsv: 120,
    days: 21,
    seed: 67,
    events: [{ fromDay: 6, toDay: 20, crewIds: ['crew-1'], effects: { resistanceFactor: 0.25, hydrationMl: 1700 } }],
  },
  {
    id: 'combined-transit',
    title: 'Everything at once in transit to Mars',
    description: 'Short sleep, high CO2 and a solar storm overlap during the cruise to Mars.',
    environment: 'mars_transit',
    doseRateMsvPerDay: 1.84,
    startingDoseMsv: 200,
    days: 21,
    seed: 79,
    events: [
      { fromDay: 9, toDay: 14, effects: { sleepShift: -1.8, stress: 4 } },
      { fromDay: 11, toDay: 14, cabinCo2Mmhg: 5.5 },
      { fromDay: 13, toDay: 14, protonStormLevel: 2, extraDoseMsv: 6 },
    ],
  },
]

export interface CrewDay {
  crewId: string
  alerts: Alert[]
  vitals: VitalReading[]
  checkIn: CheckIn
  pvt: PvtResult
}

export interface ScenarioDay {
  day: number
  date: string
  cabinCo2Mmhg: number
  protonStormLevel: number
  accumulatedMsv: number
  crew: CrewDay[]
}

function activeEvents(scenario: Scenario, day: number, crewId?: string): ScenarioEvent[] {
  return scenario.events.filter(
    (e) => day >= e.fromDay && day <= e.toDay && (!crewId || !e.crewIds || e.crewIds.includes(crewId)),
  )
}

function mergeEffects(events: readonly ScenarioEvent[]): DayEffects {
  const merged: DayEffects = {}
  for (const { effects } of events) {
    if (!effects) continue
    merged.vitalShift = { ...merged.vitalShift, ...effects.vitalShift }
    merged.sleepShift = (merged.sleepShift ?? 0) + (effects.sleepShift ?? 0)
    if (effects.resistanceFactor !== undefined) merged.resistanceFactor = effects.resistanceFactor
    if (effects.hydrationMl !== undefined) merged.hydrationMl = effects.hydrationMl
    if (effects.stress !== undefined) merged.stress = Math.max(merged.stress ?? 0, effects.stress)
    merged.symptoms = [...new Set([...(merged.symptoms ?? []), ...(effects.symptoms ?? [])])]
  }
  return merged
}

/** Sleep loss raises reaction times and lapses, as in the HERA and PVT literature. */
export function simulatePvt(random: Random, sleepShift: number): PvtResponse[] {
  const impaired = sleepShift <= -1.5
  return Array.from({ length: 42 }, () => {
    const lapse = random() < (impaired ? 0.22 : 0.02)
    const rt = lapse ? gaussian(random, 520, 80) : gaussian(random, impaired ? 290 : 250, 25)
    return { reactionMs: Math.round(Math.max(rt, 120)) }
  })
}

export function runScenario(scenario: Scenario): ScenarioDay[] {
  const history = new Map<string, { vitals: VitalReading[]; checkIns: CheckIn[]; pvt: { at: string; result: PvtResult }[] }>()
  for (const p of CREW) history.set(p.id, { vitals: [], checkIns: [], pvt: [] })
  let dose = scenario.startingDoseMsv
  const days: ScenarioDay[] = []

  for (let day = 0; day < scenario.days; day++) {
    const date = new Date(START + day * 86_400_000)
    const shared = activeEvents(scenario, day)
    const cabinCo2Mmhg = Math.max(2.5, ...shared.map((e) => e.cabinCo2Mmhg ?? 0))
    const protonStormLevel = Math.max(0, ...shared.map((e) => e.protonStormLevel ?? 0))
    dose += scenario.doseRateMsvPerDay + shared.reduce((a, e) => a + (e.extraDoseMsv ?? 0), 0)
    const now = new Date(date.getTime() + 22 * 3_600_000)

    const crew: CrewDay[] = CREW.map((profile) => {
      const random = randomFor(profile.id, day, scenario.seed)
      const effects = mergeEffects(activeEvents(scenario, day, profile.id))
      const { vitals, checkIn } = simulateDay(profile, date, effects, random)
      const pvt = scorePvt(simulatePvt(random, effects.sleepShift ?? 0))
      const h = history.get(profile.id)!
      h.vitals.push(...vitals)
      h.checkIns.push(checkIn)
      h.pvt.push({ at: new Date(date.getTime() + 8 * 3_600_000).toISOString(), result: pvt })
      const alerts = evaluate({
        crewId: profile.id,
        now,
        vitals: h.vitals,
        checkIns: h.checkIns,
        pvt: h.pvt,
        cabin: { co2Mmhg: cabinCo2Mmhg, at: now.toISOString() },
        radiation: { environment: scenario.environment, protonStormLevel, accumulatedMsv: Math.round(dose * 10) / 10 },
      })
      return { crewId: profile.id, alerts, vitals, checkIn, pvt }
    })
    days.push({ day, date: date.toISOString().slice(0, 10), cabinCo2Mmhg, protonStormLevel, accumulatedMsv: Math.round(dose * 10) / 10, crew })
  }
  return days
}

export function scenarioById(id: string): Scenario {
  const scenario = SCENARIOS.find((s) => s.id === id)
  if (!scenario) throw new Error(`Unknown scenario: ${id}`)
  return scenario
}
