import { checkInSchema } from '../domain/checkin'
import { vitalReadingSchema } from '../domain/vitals'
import { CREW, simulateDay } from './crew'
import { seeded } from './random'
import { SCENARIOS, runScenario, scenarioById, type ScenarioDay } from './scenarios'

const alertKeys = (day: ScenarioDay, crewId: string) =>
  day.crew.find((c) => c.crewId === crewId)!.alerts.map((a) => a.key.split(':')[1] ?? '')
const severityOf = (day: ScenarioDay, crewId: string, rule: string) =>
  day.crew.find((c) => c.crewId === crewId)!.alerts.find((a) => a.key.endsWith(`:${rule}`))?.severity

describe('simulated crew', () => {
  it('produces readings and check-ins that pass the same validation as real input', () => {
    for (const profile of CREW) {
      const { vitals, checkIn } = simulateDay(profile, new Date(Date.UTC(2026, 10, 1)), {}, seeded(1))
      for (const v of vitals) expect(vitalReadingSchema.safeParse(v).success).toBe(true)
      expect(checkInSchema.safeParse(checkIn).success).toBe(true)
      expect(vitals.every((v) => v.source === 'simulated')).toBe(true)
    }
  })

  it('gives each crew member their own normal', () => {
    const hr = (id: string) => CREW.find((c) => c.id === id)!.baseline.heartRate.mean
    expect(hr('crew-1')).not.toBe(hr('crew-2'))
  })

  it('is reproducible: the same scenario always gives the same result', () => {
    const a = runScenario(scenarioById('sleep-loss'))
    const b = runScenario(scenarioById('sleep-loss'))
    expect(a).toEqual(b)
  })
})

describe('mission scenarios run through the risk engine', () => {
  it('keeps a routine ISS mission free of warnings', () => {
    const days = runScenario(scenarioById('healthy-iss'))
    const serious = days.flatMap((d) => d.crew.flatMap((c) => c.alerts)).filter((a) => a.severity === 'warning' || a.severity === 'critical')
    expect(serious).toEqual([])
  })

  it('sends the crew to shelter on the day of the Mars solar storm, and clears afterwards', () => {
    const days = runScenario(scenarioById('mars-solar-storm'))
    for (const crew of CREW) {
      expect(severityOf(days[13]!, crew.id, 'proton-storm')).toBeUndefined()
      expect(severityOf(days[14]!, crew.id, 'proton-storm')).toBe('critical')
      expect(severityOf(days[16]!, crew.id, 'proton-storm')).toBeUndefined()
    }
    expect(days[14]!.accumulatedMsv - days[13]!.accumulatedMsv).toBeGreaterThan(4)
  })

  it('detects the sleep loss and the drop in vigilance only for the affected crew member', () => {
    const days = runScenario(scenarioById('sleep-loss'))
    expect(alertKeys(days[8]!, 'crew-2')).not.toContain('sleep')
    expect(alertKeys(days[13]!, 'crew-2')).toEqual(expect.arrayContaining(['sleep', 'vigilance']))
    expect(alertKeys(days[13]!, 'crew-1')).not.toContain('sleep')
  })

  it('links the CO2 excursion to the reported headaches', () => {
    const days = runScenario(scenarioById('co2-excursion'))
    expect(severityOf(days[8]!, 'crew-3', 'co2')).toBe('watch')
    expect(severityOf(days[10]!, 'crew-1', 'co2')).toBe('warning')
    expect(severityOf(days[13]!, 'crew-1', 'co2')).toBeUndefined()
  })

  it('catches the fever through both the clinical score and the personal baseline', () => {
    const days = runScenario(scenarioById('infection'))
    const keys = alertKeys(days[13]!, 'crew-3')
    expect(keys).toEqual(expect.arrayContaining(['immune', 'baseline-temperature']))
    expect(keys.some((k) => k === 'news2' || k.startsWith('baseline-heartRate'))).toBe(true)
    expect(alertKeys(days[13]!, 'crew-1')).not.toContain('immune')
  })

  it('flags skipped exercise and low fluids as bone and kidney risk', () => {
    const days = runScenario(scenarioById('exercise-gap'))
    expect(severityOf(days[20]!, 'crew-1', 'exercise')).toBe('warning')
    expect(severityOf(days[20]!, 'crew-1', 'hydration')).toBe('warning')
    expect(severityOf(days[20]!, 'crew-2', 'exercise')).toBeUndefined()
  })

  it('raises a combined alert when stressors overlap in transit', () => {
    const days = runScenario(scenarioById('combined-transit'))
    const combined = days[13]!.crew[0]!.alerts.find((a) => a.area === 'combined')
    expect(combined).toBeDefined()
    expect(combined!.why).toMatch(/solar radiation storm/)
  })

  it('every scenario has unique ids and runs for its full length', () => {
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length)
    for (const s of SCENARIOS) expect(runScenario(s)).toHaveLength(s.days)
    expect(() => scenarioById('nope')).toThrow('Unknown scenario')
  })
})
