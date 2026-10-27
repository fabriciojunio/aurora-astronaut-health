import fc from 'fast-check'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  CAREER_LIMIT_MSV,
  QUALITY_FACTOR,
  careerStatus,
  dailyDoses,
  daysToCareerLimit,
  missionDoseMsv,
  spikeDays,
  type HourlyDose,
} from './radiation'

const snapshot = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../public/data/radiation-may-2024.json'), 'utf-8'),
) as { records: HourlyDose[] }

describe('quality factors from published paired measurements', () => {
  it('match the papers they come from', () => {
    expect(QUALITY_FACTOR.iss.value).toBeCloseTo(2.26, 2)
    expect(QUALITY_FACTOR.lunar_orbit.value).toBeCloseTo(4.32, 2)
    expect(QUALITY_FACTOR.mars_surface.value).toBeCloseTo(3.05, 2)
  })
})

describe('mission dose', () => {
  it('reproduces the published estimate of about 1 Sv for a 180/500/180-day Mars mission', () => {
    const dose = missionDoseMsv([
      { environment: 'mars_transit', days: 180 },
      { environment: 'mars_surface', days: 500 },
      { environment: 'mars_transit', days: 180 },
    ])
    expect(dose).toBeGreaterThan(950)
    expect(dose).toBeLessThan(1050)
    expect(careerStatus(dose).exceedsCareerLimit).toBe(true)
  })

  it('uses a measured rate when one is given', () => {
    expect(missionDoseMsv([{ environment: 'iss', days: 180, rateMsvPerDay: 0.5 }])).toBe(90)
  })

  it('refuses environments without a reference rate unless a measured rate is given', () => {
    expect(() => missionDoseMsv([{ environment: 'iss', days: 10 }])).toThrow('No reference rate')
  })

  it('refuses negative or non-finite durations', () => {
    expect(() => missionDoseMsv([{ environment: 'mars_transit', days: -1 }])).toThrow(RangeError)
    expect(() => missionDoseMsv([{ environment: 'mars_transit', days: Number.NaN }])).toThrow(RangeError)
  })

  it('grows monotonically with mission length', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2000 }), fc.integer({ min: 0, max: 2000 }), (a, b) => {
        const da = missionDoseMsv([{ environment: 'mars_transit', days: a }])
        const db = missionDoseMsv([{ environment: 'mars_transit', days: b }])
        expect(a <= b ? da <= db : da >= db).toBe(true)
      }),
    )
  })
})

describe('career limit', () => {
  it('reports fraction, remaining dose and whether the limit is exceeded', () => {
    expect(careerStatus(150)).toEqual({ careerFraction: 0.25, remainingMsv: 450, exceedsCareerLimit: false })
    expect(careerStatus(CAREER_LIMIT_MSV + 1).exceedsCareerLimit).toBe(true)
    expect(careerStatus(700).remainingMsv).toBe(0)
  })

  it('rejects impossible doses', () => {
    expect(() => careerStatus(-5)).toThrow(RangeError)
    expect(() => careerStatus(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })

  it('computes days left at the current rate', () => {
    expect(daysToCareerLimit(500, 1)).toBe(100)
    expect(daysToCareerLimit(700, 1)).toBe(0)
    expect(daysToCareerLimit(10, 0)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('daily doses from hourly detector data', () => {
  const rows: HourlyDose[] = [
    { instrument: 'DosTel1', environment: 'iss', hour: '2024-05-20T00:00:00', mean_rate: 10, max_rate: 12, samples: 30 },
    { instrument: 'DosTel2', environment: 'iss', hour: '2024-05-20T00:00:00', mean_rate: 14, max_rate: 15, samples: 30 },
    { instrument: 'DosTel1', environment: 'iss', hour: '2024-05-20T01:00:00', mean_rate: 12, max_rate: 13, samples: 30 },
    { instrument: 'MSL-RAD-Surface', environment: 'mars_surface', hour: '2024-05-20T00:00:00', mean_rate: 5, max_rate: 5, samples: 3 },
  ]

  it('averages detectors in the same hour, scales to 24 h and converts with the quality factor', () => {
    const [day] = dailyDoses(rows, 'iss')
    expect(day).toMatchObject({ date: '2024-05-20', hoursCovered: 2, absorbedUgy: 288 })
    expect(day!.equivalentUsv).toBeCloseTo(288 * QUALITY_FACTOR.iss.value, 0)
  })

  it('keeps environments separate and ignores invalid rates', () => {
    const withBad = [...rows, { ...rows[3]!, hour: '2024-05-20T02:00:00', mean_rate: Number.NaN }]
    expect(dailyDoses(withBad, 'mars_surface')).toEqual([
      expect.objectContaining({ absorbedUgy: 120, hoursCovered: 1 }),
    ])
  })
})

describe('real NASA RadLab data for May 2024', () => {
  it('shows the solar event recorded by Curiosity on Mars on 20 May 2024', () => {
    const mars = dailyDoses(snapshot.records, 'mars_surface')
    expect(mars).toHaveLength(31)
    const spikes = spikeDays(mars)
    expect(spikes.map((d) => d.date)).toContain('2024-05-20')
  })

  it('shows the large solar particle event in lunar orbit in mid-May', () => {
    const moon = dailyDoses(snapshot.records, 'lunar_orbit')
    const peak = moon.reduce((a, b) => (b.absorbedUgy > a.absorbedUgy ? b : a))
    expect(peak.date).toBe('2024-05-14')
    expect(spikes(moon)).toBeGreaterThanOrEqual(1)
  })

  it('shows the ISS, shielded by the magnetosphere, with no comparable spike', () => {
    const iss = dailyDoses(snapshot.records, 'iss')
    expect(spikeDays(iss)).toEqual([])
    const typical = iss.map((d) => d.absorbedUgy).sort((a, b) => a - b)[15]!
    expect(typical).toBeGreaterThan(200)
    expect(typical).toBeLessThan(500)
  })
})

function spikes(days: ReturnType<typeof dailyDoses>) {
  return spikeDays(days).length
}
