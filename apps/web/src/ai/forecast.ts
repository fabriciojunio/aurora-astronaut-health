// Trend forecasting with the Theil-Sen estimator: the slope is the median of pairwise slopes, so a
// single bad reading cannot tilt the projection the way it tilts an ordinary least-squares line.

export interface Point {
  t: number
  value: number
}

export interface Trend {
  slopePerDay: number
  intercept: number
  points: number
}

const DAY_MS = 86_400_000

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

export function theilSen(points: readonly Point[]): Trend | undefined {
  const clean = points.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.value))
  if (clean.length < 3) return undefined
  const slopes: number[] = []
  for (let i = 0; i < clean.length; i++) {
    for (let j = i + 1; j < clean.length; j++) {
      const dt = clean[j]!.t - clean[i]!.t
      if (dt !== 0) slopes.push((clean[j]!.value - clean[i]!.value) / dt)
    }
  }
  if (slopes.length === 0) return undefined
  const slope = median(slopes)
  const intercept = median(clean.map((p) => p.value - slope * p.t))
  return { slopePerDay: slope * DAY_MS, intercept, points: clean.length }
}

export function valueAt(trend: Trend, t: number): number {
  return trend.intercept + (trend.slopePerDay / DAY_MS) * t
}

/**
 * Days from `now` until the trend crosses `limit` in the direction it is moving, or undefined if it
 * is moving away from the limit or is flat. Horizons beyond a year are not reported.
 */
export function daysUntil(trend: Trend, now: number, limit: number): number | undefined {
  const current = valueAt(trend, now)
  const rate = trend.slopePerDay
  if (rate === 0) return undefined
  const days = (limit - current) / rate
  if (days < 0 || days > 365) return undefined
  return Math.round(days * 10) / 10
}
