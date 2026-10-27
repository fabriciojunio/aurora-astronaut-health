import fc from 'fast-check'
import {
  PLAUSIBLE,
  STALE_AFTER_MS,
  VITAL_KINDS,
  latestByKind,
  news2,
  news2Points,
  signalStatus,
  vitalReadingSchema,
  type VitalKind,
  type VitalReading,
} from './vitals'

const at = '2026-11-14T09:00:00.000Z'
const reading = (kind: VitalKind, value: number, when = at): VitalReading => ({
  crewId: 'crew-1',
  kind,
  value,
  at: when,
  source: 'simulated',
})

const normal: Record<VitalKind, number> = {
  heartRate: 62,
  hrv: 55,
  spo2: 98,
  systolic: 118,
  diastolic: 76,
  temperature: 36.7,
  respiratoryRate: 14,
}
const allNormal = () => latestByKind(VITAL_KINDS.map((k) => reading(k, normal[k])))

describe('reading validation', () => {
  it('accepts a well-formed reading', () => {
    expect(vitalReadingSchema.safeParse(reading('heartRate', 62)).success).toBe(true)
  })

  it.each([
    ['heartRate', 400],
    ['spo2', 120],
    ['temperature', 50],
    ['respiratoryRate', 0],
  ] as const)('rejects impossible %s = %d as a sensor error', (kind, value) => {
    expect(vitalReadingSchema.safeParse(reading(kind, value)).success).toBe(false)
  })

  it('rejects NaN, unknown fields, unknown kinds and unsafe crew ids', () => {
    expect(vitalReadingSchema.safeParse(reading('heartRate', Number.NaN)).success).toBe(false)
    expect(vitalReadingSchema.safeParse({ ...reading('heartRate', 62), extra: 1 }).success).toBe(false)
    expect(vitalReadingSchema.safeParse({ ...reading('heartRate', 62), kind: 'mood' }).success).toBe(false)
    expect(
      vitalReadingSchema.safeParse({ ...reading('heartRate', 62), crewId: '<script>' }).success,
    ).toBe(false)
    expect(vitalReadingSchema.safeParse({ ...reading('heartRate', 62), at: 'yesterday' }).success).toBe(false)
  })

  it('accepts every value inside the plausible range and rejects every value outside it', () => {
    fc.assert(
      fc.property(fc.constantFrom(...VITAL_KINDS), fc.double({ noNaN: true, min: -1000, max: 1000 }), (kind, value) => {
        const [min, max] = PLAUSIBLE[kind]
        expect(vitalReadingSchema.safeParse(reading(kind, value)).success).toBe(value >= min && value <= max)
      }),
    )
  })
})

describe('signal status', () => {
  const now = new Date(Date.parse(at) + 1000)

  it('is missing when there is no reading, live when recent, stale when old', () => {
    expect(signalStatus(undefined, now)).toBe('missing')
    expect(signalStatus(reading('heartRate', 62), now)).toBe('live')
    const old = new Date(Date.parse(at) - STALE_AFTER_MS - 1).toISOString()
    expect(signalStatus(reading('heartRate', 62, old), now)).toBe('stale')
  })

  it('keeps only the most recent reading of each kind', () => {
    const latest = latestByKind([
      reading('heartRate', 60, '2026-11-14T08:00:00.000Z'),
      reading('heartRate', 75, '2026-11-14T09:30:00.000Z'),
      reading('heartRate', 70, '2026-11-14T09:00:00.000Z'),
    ])
    expect(latest.heartRate?.value).toBe(75)
  })
})

describe('NEWS2 bands (RCP 2017)', () => {
  it.each([
    ['respiratoryRate', 8, 3], ['respiratoryRate', 9, 1], ['respiratoryRate', 12, 0],
    ['respiratoryRate', 21, 2], ['respiratoryRate', 25, 3],
    ['spo2', 91, 3], ['spo2', 92, 2], ['spo2', 94, 1], ['spo2', 96, 0],
    ['systolic', 90, 3], ['systolic', 91, 2], ['systolic', 101, 1], ['systolic', 111, 0],
    ['systolic', 219, 0], ['systolic', 220, 3],
    ['heartRate', 40, 3], ['heartRate', 41, 1], ['heartRate', 51, 0], ['heartRate', 91, 1],
    ['heartRate', 111, 2], ['heartRate', 131, 3],
    ['temperature', 35.0, 3], ['temperature', 35.1, 1], ['temperature', 36.1, 0],
    ['temperature', 38.1, 1], ['temperature', 39.1, 2],
  ] as const)('%s %d gives %d points', (kind, value, points) => {
    expect(news2Points(kind, value)).toBe(points)
  })

  it('does not score parameters outside NEWS2', () => {
    expect(news2Points('hrv', 55)).toBeUndefined()
  })
})

describe('NEWS2 aggregate', () => {
  it('scores a healthy crew member as low risk', () => {
    expect(news2(allNormal())).toMatchObject({ total: 0, risk: 'low', missing: [] })
  })

  it('never treats a missing measurement as normal', () => {
    const latest = allNormal()
    delete latest.spo2
    const result = news2(latest)
    expect(result.risk).toBe('incomplete')
    expect(result.missing).toEqual(['spo2'])
  })

  it('flags a single extreme parameter as low-medium (urgent review)', () => {
    expect(news2({ ...allNormal(), spo2: reading('spo2', 90) }).risk).toBe('low-medium')
  })

  it('reaches medium at 5 and high at 7 points', () => {
    const medium = { ...allNormal(), heartRate: reading('heartRate', 115), temperature: reading('temperature', 38.5), spo2: reading('spo2', 93) }
    expect(news2(medium)).toMatchObject({ total: 5, risk: 'medium' })
    const high = { ...medium, respiratoryRate: reading('respiratoryRate', 22) }
    expect(news2(high)).toMatchObject({ total: 7, risk: 'high' })
  })

  it('adds 3 points for new confusion', () => {
    expect(news2(allNormal(), { newConfusion: true })).toMatchObject({ total: 3, risk: 'low-medium' })
  })

  it('never gives a lower score when any parameter gets worse', () => {
    fc.assert(
      fc.property(fc.integer({ min: 92, max: 100 }), fc.integer({ min: 0, max: 8 }), (spo2, drop) => {
        const better = news2({ ...allNormal(), spo2: reading('spo2', spo2) }).total
        const worse = news2({ ...allNormal(), spo2: reading('spo2', Math.max(spo2 - drop, 50)) }).total
        expect(worse).toBeGreaterThanOrEqual(better)
      }),
    )
  })
})
