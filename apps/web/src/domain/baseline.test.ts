import fc from 'fast-check'
import {
  MIN_BASELINE_SAMPLES,
  computeBaseline,
  modifiedZ,
  sustainedDeviation,
  type TimedValue,
} from './baseline'

const series = (values: number[], start = 0): TimedValue[] =>
  values.map((value, i) => ({ at: new Date(Date.UTC(2026, 10, 1, 8, start + i)).toISOString(), value }))

describe('personal baseline', () => {
  it('needs a minimum number of samples before judging anyone', () => {
    expect(computeBaseline([60, 61, 62])).toBeUndefined()
    expect(computeBaseline(Array(MIN_BASELINE_SAMPLES).fill(60))).toBeDefined()
  })

  it('uses median and MAD, so a single spike does not move the baseline', () => {
    const calm = computeBaseline([58, 60, 59, 61, 60, 62, 60, 59, 61])!
    const withSpike = computeBaseline([58, 60, 59, 61, 60, 62, 60, 59, 180])!
    expect(withSpike.median).toBe(calm.median)
    expect(withSpike.mad).toBe(calm.mad)
  })

  it('ignores non-finite values', () => {
    expect(computeBaseline([60, 60, 61, Number.NaN, 59, 60, 61, 62])?.samples).toBe(7)
  })

  it('compares people with their own normal: the same value is normal for one and abnormal for another', () => {
    const athlete = computeBaseline([46, 47, 48, 47, 46, 48, 47, 47])!
    const other = computeBaseline([72, 74, 73, 75, 72, 74, 73, 74])!
    expect(Math.abs(modifiedZ(72, athlete))).toBeGreaterThan(3.5)
    expect(Math.abs(modifiedZ(72, other))).toBeLessThan(3.5)
  })

  it('stays finite when every baseline value is identical', () => {
    const flat = computeBaseline(Array(10).fill(98))!
    expect(flat.mad).toBe(0)
    expect(Number.isFinite(modifiedZ(94, flat))).toBe(true)
  })

  it('catches a clinically relevant SpO2 drop when the floor is the sensor resolution', () => {
    const flat = computeBaseline(Array(10).fill(98))!
    // A relative floor (1% of 98) would hide this 4-point drop; the 0.5% resolution floor does not.
    expect(modifiedZ(94, flat)).toBeGreaterThan(-3.5)
    expect(modifiedZ(94, flat, 0.5)).toBeLessThan(-3.5)
    expect(modifiedZ(97.5, flat, 0.5)).toBeGreaterThan(-3.5)
  })
})

describe('sustained deviation', () => {
  const baseline = computeBaseline([60, 61, 59, 60, 62, 60, 61, 59, 60])!

  it('ignores a single outlier', () => {
    expect(sustainedDeviation(series([60, 95, 61, 60]), baseline)).toBeUndefined()
  })

  it('raises an upward deviation after three consecutive high values', () => {
    const result = sustainedDeviation(series([60, 61, 85, 88, 90]), baseline)
    expect(result).toMatchObject({ direction: 'up', count: 3 })
    expect(result!.since).toBe(series([0, 0, 0])[2]!.at)
  })

  it('raises a downward deviation', () => {
    expect(sustainedDeviation(series([40, 41, 39]), baseline)).toMatchObject({ direction: 'down', count: 3 })
  })

  it('resets when the values come back to normal', () => {
    expect(sustainedDeviation(series([85, 88, 90, 60]), baseline)).toBeUndefined()
  })

  it('does not merge an upward run with a downward run', () => {
    expect(sustainedDeviation(series([85, 88, 40, 41]), baseline)).toBeUndefined()
  })

  it('works with readings that arrive out of order', () => {
    const points = series([60, 85, 88, 90]).reverse()
    expect(sustainedDeviation(points, baseline)).toMatchObject({ direction: 'up', count: 3 })
  })

  it('never reports a deviation for values inside the personal range', () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 59, max: 61, noNaN: true }), { maxLength: 50 }), (values) => {
        expect(sustainedDeviation(series(values), baseline)).toBeUndefined()
      }),
    )
  })
})
