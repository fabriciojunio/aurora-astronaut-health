import fc from 'fast-check'
import type { CheckIn } from './checkin'
import { scorePvt } from './cognition'
import { EVIDENCE } from './evidence'
import { evaluate, severityRank, type RiskContext } from './riskEngine'
import { VITAL_KINDS, type VitalKind, type VitalReading } from './vitals'

const NOW = new Date('2026-11-14T12:00:00.000Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()

const NORMAL: Record<VitalKind, number> = {
  heartRate: 62, hrv: 55, spo2: 98, systolic: 118, diastolic: 76, temperature: 36.7, respiratoryRate: 14,
}

function vitals(overrides: Partial<Record<VitalKind, number>> = {}, hours = 1): VitalReading[] {
  return VITAL_KINDS.map((kind) => ({
    crewId: 'crew-1', kind, value: overrides[kind] ?? NORMAL[kind], at: hoursAgo(hours), source: 'simulated',
  }))
}

function checkIn(daysAgo: number, overrides: Partial<CheckIn> = {}): CheckIn {
  return {
    crewId: 'crew-1', at: hoursAgo(daysAgo * 24 + 2), sleepHours: 7.5, sleepQuality: 4, mood: 4, stress: 2,
    symptoms: [], hydrationMl: 2700, resistanceMin: 60, aerobicMin: 30, prescribedResistanceMin: 60,
    prescribedAerobicMin: 30, note: '', ...overrides,
  }
}

const week = (overrides: Partial<CheckIn> = {}) => [0, 1, 2, 3, 4, 5].map((d) => checkIn(d, overrides))

function context(overrides: Partial<RiskContext> = {}): RiskContext {
  return { crewId: 'crew-1', now: NOW, vitals: vitals(), checkIns: week(), pvt: [], ...overrides }
}

const keys = (ctx: RiskContext) => evaluate(ctx).map((a) => a.key.split(':')[1])

describe('risk engine, real-use scenarios', () => {
  it('raises nothing on a healthy day with complete data', () => {
    expect(evaluate(context())).toEqual([])
  })

  it('asks for missing measurements instead of assuming they are normal', () => {
    const [alert] = evaluate(context({ vitals: vitals().filter((v) => v.kind !== 'spo2') }))
    expect(alert).toMatchObject({ area: 'clinical', severity: 'info' })
    expect(alert!.why).toContain('spo2')
  })

  it('ignores readings older than 24 hours for the current score', () => {
    expect(keys(context({ vitals: vitals({}, 30) }))).toContain('news2-incomplete')
  })

  it('escalates low oxygen saturation', () => {
    const alerts = evaluate(context({ vitals: vitals({ spo2: 90 }) }))
    expect(alerts[0]).toMatchObject({ area: 'clinical', severity: 'warning' })
  })

  it('treats a high early warning score as critical', () => {
    const alerts = evaluate(context({ vitals: vitals({ spo2: 91, heartRate: 135, respiratoryRate: 26 }) }))
    expect(alerts[0]).toMatchObject({ severity: 'critical' })
    expect(alerts[0]!.action).toMatch(/crew medical officer now/)
  })

  it('sends the crew to the storm shelter during a solar event on Mars, but not on the ISS', () => {
    const mars = evaluate(context({ radiation: { environment: 'mars_surface', protonStormLevel: 2, accumulatedMsv: 120 } }))
    expect(mars[0]).toMatchObject({ area: 'radiation', severity: 'critical' })
    expect(mars[0]!.action).toMatch(/shelter/)
    const iss = evaluate(context({ radiation: { environment: 'iss', protonStormLevel: 2, accumulatedMsv: 120 } }))
    expect(iss.find((a) => a.area === 'radiation')!.severity).toBe('watch')
  })

  it('warns as the career dose approaches and passes the NASA limit', () => {
    const near = evaluate(context({ radiation: { environment: 'mars_transit', protonStormLevel: 0, accumulatedMsv: 500 } }))
    expect(near.find((a) => a.key.endsWith('career-dose'))!.severity).toBe('warning')
    const over = evaluate(context({ radiation: { environment: 'mars_transit', protonStormLevel: 0, accumulatedMsv: 1010 } }))
    expect(over.find((a) => a.key.endsWith('career-dose'))!.severity).toBe('critical')
    expect(keys(context({ radiation: { environment: 'iss', protonStormLevel: 0, accumulatedMsv: 100 } }))).toEqual([])
  })

  it('flags short sleep, and makes poor vigilance worse when both happen', () => {
    const tired = week({ sleepHours: 5.5 })
    const badPvt = { at: hoursAgo(1), result: scorePvt([...Array(20).fill({ reactionMs: 300 }), ...Array(6).fill({ reactionMs: 700 })]) }
    const alerts = evaluate(context({ checkIns: tired, pvt: [badPvt] }))
    expect(alerts.find((a) => a.area === 'sleep')!.severity).toBe('warning')
    expect(alerts.find((a) => a.area === 'cognition')!.severity).toBe('warning')
    const rested = evaluate(context({ pvt: [badPvt] }))
    expect(rested.find((a) => a.area === 'cognition')!.severity).toBe('watch')
  })

  it('ignores an interrupted vigilance test', () => {
    const interrupted = { at: hoursAgo(1), result: scorePvt(Array(5).fill({ reactionMs: 900 })) }
    expect(keys(context({ pvt: [interrupted] }))).toEqual([])
  })

  it('links low resistance exercise with hydration and kidney stone risk', () => {
    const alerts = evaluate(context({ checkIns: week({ resistanceMin: 15, hydrationMl: 1800 }) }))
    expect(alerts.find((a) => a.area === 'musculoskeletal')!.severity).toBe('warning')
    expect(alerts.find((a) => a.area === 'renal')!.severity).toBe('warning')
  })

  it('reports cabin CO2 with the headache odds, and escalates when headache is reported', () => {
    const quiet = evaluate(context({ cabin: { co2Mmhg: 6, at: hoursAgo(1) } }))
    expect(quiet.find((a) => a.area === 'environment')).toMatchObject({ severity: 'watch' })
    expect(quiet.find((a) => a.area === 'environment')!.why).toContain('4x')
    const withHeadache = evaluate(
      context({ cabin: { co2Mmhg: 6, at: hoursAgo(1) }, checkIns: [checkIn(0, { symptoms: ['headache'] }), ...week().slice(1)] }),
    )
    expect(withHeadache.find((a) => a.area === 'environment')!.severity).toBe('warning')
  })

  it('treats chest pain as critical and vision change as a warning', () => {
    const alerts = evaluate(context({ checkIns: [checkIn(0, { symptoms: ['chestPain', 'visionChange'] }), ...week().slice(1)] }))
    expect(alerts[0]).toMatchObject({ area: 'cardiopulmonary', severity: 'critical' })
    expect(alerts.find((a) => a.area === 'vision')!.severity).toBe('warning')
  })

  it('only counts symptoms from the last two days', () => {
    const old = [checkIn(5, { symptoms: ['fever'] }), ...week().slice(0, 5)]
    expect(keys(context({ checkIns: old }))).not.toContain('immune')
  })

  it('raises a combined alert one level above when stressors pile up', () => {
    const alerts = evaluate(
      context({
        checkIns: week({ sleepHours: 5.5, resistanceMin: 20 }),
        cabin: { co2Mmhg: 5.5, at: hoursAgo(1) },
      }),
    )
    const combined = alerts.find((a) => a.area === 'combined')!
    expect(combined.why).toMatch(/sleep debt.*low exercise.*high CO2/)
    expect(severityRank(combined.severity)).toBeGreaterThan(severityRank('watch'))
  })

  it('detects a sustained deviation from the personal baseline', () => {
    const history: VitalReading[] = Array.from({ length: 10 }, (_, i) => ({
      crewId: 'crew-1', kind: 'heartRate' as const, value: 58 + (i % 3), at: hoursAgo(48 + i * 6), source: 'simulated' as const,
    }))
    const recent: VitalReading[] = [3, 2, 1].map((h, i) => ({
      crewId: 'crew-1', kind: 'heartRate' as const, value: 84 + i, at: hoursAgo(h), source: 'simulated' as const,
    }))
    const alerts = evaluate(context({ vitals: [...vitals().filter((v) => v.kind !== 'heartRate'), ...history, ...recent] }))
    expect(alerts.find((a) => a.key.endsWith('baseline-heartRate'))).toMatchObject({ severity: 'warning' })
  })

  it('orders alerts from most to least severe', () => {
    const alerts = evaluate(context({ vitals: vitals({ spo2: 91 }), checkIns: week({ sleepHours: 5 }) }))
    const ranks = alerts.map((a) => severityRank(a.severity))
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a))
  })
})

describe('risk engine, invariants', () => {
  const symptomArb = fc.subarray(['headache', 'nausea', 'fever', 'visionChange', 'chestPain', 'dizziness', 'coldSores'] as const)

  it('every alert has text, a unique key and evidence that exists in the registry', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 12, noNaN: true }),
        fc.integer({ min: 0, max: 90 }),
        fc.double({ min: 0, max: 8, noNaN: true }),
        fc.integer({ min: 0, max: 5 }),
        symptomArb,
        (sleepHours, resistanceMin, co2Mmhg, storm, symptoms) => {
          const alerts = evaluate(
            context({
              checkIns: [checkIn(0, { sleepHours, resistanceMin, symptoms: [...symptoms] }), ...week({ sleepHours, resistanceMin }).slice(1)],
              cabin: { co2Mmhg, at: hoursAgo(1) },
              radiation: { environment: 'lunar_orbit', protonStormLevel: storm, accumulatedMsv: 50 },
            }),
          )
          expect(new Set(alerts.map((a) => a.key)).size).toBe(alerts.length)
          for (const alert of alerts) {
            expect(alert.title.length).toBeGreaterThan(0)
            expect(alert.why.length).toBeGreaterThan(0)
            expect(alert.action.length).toBeGreaterThan(0)
            expect(alert.evidence.length).toBeGreaterThan(0)
            for (const id of alert.evidence) expect(EVIDENCE).toHaveProperty(id)
          }
        },
      ),
      { numRuns: 200 },
    )
  })

  it('reporting an extra symptom never lowers the highest severity', () => {
    fc.assert(
      fc.property(symptomArb, fc.constantFrom('chestPain', 'visionChange', 'fever', 'dizziness'), (symptoms, extra) => {
        const max = (s: readonly string[]) =>
          Math.max(-1, ...evaluate(context({ checkIns: [checkIn(0, { symptoms: [...new Set(s)] as CheckIn['symptoms'] }), ...week().slice(1)] })).map((a) => severityRank(a.severity)))
        expect(max([...symptoms, extra])).toBeGreaterThanOrEqual(max(symptoms))
      }),
    )
  })

  it('is deterministic', () => {
    const ctx = context({ checkIns: week({ sleepHours: 5 }), cabin: { co2Mmhg: 6, at: hoursAgo(1) } })
    expect(evaluate(ctx)).toEqual(evaluate(ctx))
  })
})
