import fc from 'fast-check'
import { daysUntil, theilSen, valueAt, type Point } from './forecast'

const DAY = 86_400_000
const line = (slopePerDay: number, start: number, n: number): Point[] =>
  Array.from({ length: n }, (_, i) => ({ t: i * DAY, value: start + slopePerDay * i }))

describe('Theil-Sen trend', () => {
  it('needs at least three points', () => {
    expect(theilSen(line(1, 0, 2))).toBeUndefined()
    expect(theilSen([{ t: 0, value: 1 }, { t: 0, value: 2 }, { t: 0, value: 3 }])).toBeUndefined()
  })

  it('recovers an exact line', () => {
    const trend = theilSen(line(-0.5, 98, 10))!
    expect(trend.slopePerDay).toBeCloseTo(-0.5, 10)
    expect(valueAt(trend, 0)).toBeCloseTo(98, 10)
  })

  it('is not tilted by a single bad reading, unlike a least-squares line', () => {
    const points = line(0, 60, 11)
    points[10] = { t: 10 * DAY, value: 200 }
    expect(theilSen(points)!.slopePerDay).toBeCloseTo(0, 10)
  })

  it('recovers any slope from clean data', () => {
    fc.assert(
      fc.property(fc.double({ min: -50, max: 50, noNaN: true }), fc.double({ min: -100, max: 100, noNaN: true }), (slope, start) => {
        expect(theilSen(line(slope, start, 8))!.slopePerDay).toBeCloseTo(slope, 6)
      }),
    )
  })
})

describe('time to a limit', () => {
  it('projects when a falling value reaches a lower limit', () => {
    const trend = theilSen(line(-1, 100, 5))!
    expect(daysUntil(trend, 4 * DAY, 90)).toBe(6)
  })

  it('returns nothing when the trend moves away from the limit or is flat', () => {
    expect(daysUntil(theilSen(line(1, 100, 5))!, 4 * DAY, 90)).toBeUndefined()
    expect(daysUntil(theilSen(line(0, 100, 5))!, 4 * DAY, 90)).toBeUndefined()
  })

  it('does not report horizons beyond a year', () => {
    expect(daysUntil(theilSen(line(0.001, 0, 5))!, 4 * DAY, 600)).toBeUndefined()
  })

  it('projects the radiation career limit from an accumulating dose', () => {
    const dose = line(1.84, 400, 10)
    expect(daysUntil(theilSen(dose)!, 9 * DAY, 600)).toBeCloseTo((600 - (400 + 1.84 * 9)) / 1.84, 0)
  })
})
