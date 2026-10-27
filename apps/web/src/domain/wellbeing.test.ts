import fc from 'fast-check'
import { checkInSchema, lastDays, type CheckIn } from './checkin'
import {
  FALSE_START_MS,
  LAPSE_MS,
  PVT_DURATION_MS,
  PVT_MAX_ISI_MS,
  PVT_MIN_ISI_MS,
  scheduleIntervals,
  scorePvt,
} from './cognition'
import { overallReadiness, slowdown, taskReadiness, type FieldTestResult } from './sensorimotor'
import {
  averageHydrationMl,
  headacheOddsMultiplier,
  resistanceAdherence,
  sleepSummary,
  unmitigatedBoneLossRange,
} from './wellbeing'

const base: CheckIn = {
  crewId: 'crew-1',
  at: '2026-11-14T07:00:00.000Z',
  sleepHours: 7.5,
  sleepQuality: 4,
  mood: 4,
  stress: 2,
  symptoms: [],
  hydrationMl: 2600,
  resistanceMin: 60,
  aerobicMin: 30,
  prescribedResistanceMin: 60,
  prescribedAerobicMin: 30,
  note: '',
}

describe('check-in validation', () => {
  it('accepts a complete check-in and fills the note default', () => {
    const { note: _note, ...withoutNote } = base
    expect(checkInSchema.parse(withoutNote).note).toBe('')
  })

  it.each([
    ['sleepHours', 20],
    ['sleepQuality', 6],
    ['mood', 0],
    ['stress', 2.5],
    ['hydrationMl', -1],
    ['resistanceMin', 999],
  ] as const)('rejects out-of-range %s', (field, value) => {
    expect(checkInSchema.safeParse({ ...base, [field]: value }).success).toBe(false)
  })

  it('rejects unknown symptoms, repeated symptoms, extra fields and oversized notes', () => {
    expect(checkInSchema.safeParse({ ...base, symptoms: ['magic'] }).success).toBe(false)
    expect(checkInSchema.safeParse({ ...base, symptoms: ['fever', 'fever'] }).success).toBe(false)
    expect(checkInSchema.safeParse({ ...base, isAdmin: true }).success).toBe(false)
    expect(checkInSchema.safeParse({ ...base, note: 'x'.repeat(501) }).success).toBe(false)
  })

  it('selects check-ins inside a time window', () => {
    const now = new Date('2026-11-14T12:00:00.000Z')
    const items = [
      { ...base, at: '2026-11-14T07:00:00.000Z' },
      { ...base, at: '2026-11-07T11:00:00.000Z' },
      { ...base, at: '2026-11-15T07:00:00.000Z' },
    ]
    expect(lastDays(items, now, 7)).toHaveLength(1)
  })
})

describe('sleep', () => {
  it('summarizes average, debt below 7 h and short nights', () => {
    const nights = [6, 5.5, 8, 7, 6.5].map((sleepHours) => ({ ...base, sleepHours }))
    expect(sleepSummary(nights)).toEqual({ nights: 5, averageHours: 6.6, debtHours: 3, shortNights: 3 })
  })

  it('does not let a long night cancel earlier debt', () => {
    expect(sleepSummary([{ ...base, sleepHours: 4 }, { ...base, sleepHours: 12 }]).debtHours).toBe(3)
  })

  it('handles no data', () => {
    expect(sleepSummary([])).toEqual({ nights: 0, averageHours: 0, debtHours: 0, shortNights: 0 })
  })

  it('never reports negative debt', () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 0, max: 16, noNaN: true }), { minLength: 1, maxLength: 30 }), (hours) => {
        expect(sleepSummary(hours.map((sleepHours) => ({ ...base, sleepHours }))).debtHours).toBeGreaterThanOrEqual(0)
      }),
    )
  })
})

describe('exercise, hydration, CO2 and bone', () => {
  it('measures resistance adherence against the prescription', () => {
    const week = [60, 30, 0, 45, 60].map((resistanceMin) => ({ ...base, resistanceMin }))
    expect(resistanceAdherence(week)).toEqual({ prescribedMin: 300, doneMin: 195, ratio: 0.65 })
    expect(resistanceAdherence([{ ...base, prescribedResistanceMin: 0, resistanceMin: 0 }]).ratio).toBe(1)
  })

  it('reproduces the NASA loading finding as a low ratio', () => {
    const assignedVsLoaded = [{ ...base, prescribedResistanceMin: 147, resistanceMin: 43 }]
    expect(resistanceAdherence(assignedVsLoaded).ratio).toBe(0.29)
  })

  it('averages hydration', () => {
    expect(averageHydrationMl([{ ...base, hydrationMl: 2000 }, { ...base, hydrationMl: 3000 }])).toBe(2500)
    expect(averageHydrationMl([])).toBe(0)
  })

  it('doubles headache odds for each mmHg of CO2 above the 4 mmHg target', () => {
    expect(headacheOddsMultiplier(4)).toBe(1)
    expect(headacheOddsMultiplier(5)).toBe(2)
    expect(headacheOddsMultiplier(6)).toBe(4)
    expect(headacheOddsMultiplier(3)).toBe(0.5)
    expect(() => headacheOddsMultiplier(-1)).toThrow(RangeError)
  })

  it('gives the 1 to 1.5% per month educational bone loss range', () => {
    expect(unmitigatedBoneLossRange(180)).toEqual([5.91, 8.87])
    expect(unmitigatedBoneLossRange(-10)).toEqual([0, 0])
  })
})

describe('PVT-B', () => {
  it('schedules 2 to 5 s intervals that fit in 3 minutes', () => {
    const intervals = scheduleIntervals()
    expect(intervals.every((i) => i >= PVT_MIN_ISI_MS && i <= PVT_MAX_ISI_MS)).toBe(true)
    expect(intervals.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(PVT_DURATION_MS)
    expect(intervals.length).toBeGreaterThanOrEqual(36)
  })

  it('is deterministic with an injected random source', () => {
    const fixed = () => 0.5
    expect(scheduleIntervals(fixed)).toEqual(scheduleIntervals(fixed))
  })

  it('fits a shorter practice run in the requested time', () => {
    const intervals = scheduleIntervals(() => 0.5, 30_000)
    expect(intervals).toEqual(Array(8).fill(3_500))
  })

  it('counts lapses at 355 ms and false starts under 100 ms or without stimulus', () => {
    const responses = [
      ...Array(18).fill({ reactionMs: 250 }),
      { reactionMs: LAPSE_MS },
      { reactionMs: 600 },
      { reactionMs: FALSE_START_MS - 1 },
      { reactionMs: null },
    ]
    expect(scorePvt(responses)).toMatchObject({ trials: 22, lapses: 2, falseStarts: 2, valid: true, medianRtMs: 250 })
    expect(scorePvt(responses).performance).toBeCloseTo(1 - 4 / 22, 3)
  })

  it('does not interpret an interrupted test', () => {
    expect(scorePvt(Array(5).fill({ reactionMs: 240 })).valid).toBe(false)
    expect(scorePvt([])).toMatchObject({ trials: 0, performance: 0, meanRtMs: 0, valid: false })
  })
})

describe('sensorimotor readiness', () => {
  const result = (task: FieldTestResult['task'], seconds: number, correctSteps?: number): FieldTestResult => ({
    task,
    seconds,
    at: '2026-11-14T10:00:00.000Z',
    ...(correctSteps === undefined ? {} : { correctSteps }),
  })

  it('computes slowdown against the personal baseline', () => {
    expect(slowdown(14.8, 10)).toBe(0.48)
    expect(() => slowdown(10, 0)).toThrow(RangeError)
  })

  it('classifies ready, watch and not-ready using the 48% NASA reference', () => {
    expect(taskReadiness(result('sitToStand', 11), result('sitToStand', 10)).readiness).toBe('ready')
    expect(taskReadiness(result('sitToStand', 12.5), result('sitToStand', 10)).readiness).toBe('watch')
    expect(taskReadiness(result('sitToStand', 15), result('sitToStand', 10)).readiness).toBe('not-ready')
  })

  it('uses missed steps in the tandem walk', () => {
    expect(taskReadiness(result('tandemWalk', 10, 7), result('tandemWalk', 10, 10)).readiness).toBe('watch')
    expect(taskReadiness(result('tandemWalk', 10, 5), result('tandemWalk', 10, 10)).readiness).toBe('not-ready')
  })

  it('needs all three tasks with baselines before declaring anyone ready', () => {
    const ready = taskReadiness(result('sitToStand', 10), result('sitToStand', 10))
    expect(overallReadiness([ready])).toBe('no-baseline')
    expect(taskReadiness(result('walkAndTurn', 10), undefined).readiness).toBe('no-baseline')
    const all = ['sitToStand', 'tandemWalk', 'walkAndTurn'].map((t) =>
      taskReadiness(result(t as FieldTestResult['task'], 10), result(t as FieldTestResult['task'], 10)),
    )
    expect(overallReadiness(all)).toBe('ready')
    expect(overallReadiness([...all.slice(0, 2), { ...all[2]!, readiness: 'watch' }])).toBe('watch')
    expect(overallReadiness([...all.slice(0, 2), { ...all[2]!, readiness: 'not-ready' }])).toBe('not-ready')
  })
})
