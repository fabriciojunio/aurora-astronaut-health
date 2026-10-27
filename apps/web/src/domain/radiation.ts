import type { EvidenceId } from './evidence'

export type RadiationEnvironment = 'iss' | 'lunar_orbit' | 'mars_transit' | 'mars_surface'

export const CAREER_LIMIT_MSV = 600
export const SPE_EVENT_LIMIT_MSV = 250

/**
 * Mean quality factor = published dose equivalent / published absorbed dose, measured together.
 * Dose equivalent approximates the effective dose used by NASA limits; it is not identical, so the
 * UI labels converted values as estimates.
 */
export const QUALITY_FACTOR: Record<
  Exclude<RadiationEnvironment, 'mars_transit'>,
  { value: number; source: EvidenceId }
> = {
  iss: { value: 647 / 286, source: 'berger2017' },
  lunar_orbit: { value: 1369 / (13.2 * 24), source: 'zhang2020' },
  mars_surface: { value: 0.64 / 0.21, source: 'hassler2014' },
}

/** Reference dose-equivalent rates in mSv/day for mission planning (no live detector in transit). */
export const REFERENCE_RATE_MSV_PER_DAY: Record<'mars_transit' | 'mars_surface', number> = {
  mars_transit: 1.84,
  mars_surface: 0.64,
}

export interface HourlyDose {
  instrument: string
  environment: Exclude<RadiationEnvironment, 'mars_transit'>
  hour: string
  mean_rate: number
  max_rate: number
  samples: number
}

export interface DailyDose {
  date: string
  absorbedUgy: number
  equivalentUsv: number
  hoursCovered: number
}

/**
 * Mean rate (µGy/h) per hour is averaged across detectors in the same hour, then summed. Days with
 * missing hours are scaled up from the hours that exist and report how many hours were covered.
 */
export function dailyDoses(
  hourly: readonly HourlyDose[],
  environment: Exclude<RadiationEnvironment, 'mars_transit'>,
): DailyDose[] {
  const perHour = new Map<string, number[]>()
  for (const h of hourly) {
    if (h.environment !== environment || !Number.isFinite(h.mean_rate) || h.mean_rate < 0) continue
    const list = perHour.get(h.hour) ?? []
    list.push(h.mean_rate)
    perHour.set(h.hour, list)
  }
  const perDay = new Map<string, number[]>()
  for (const [hour, rates] of perHour) {
    const day = hour.slice(0, 10)
    const list = perDay.get(day) ?? []
    list.push(rates.reduce((a, b) => a + b, 0) / rates.length)
    perDay.set(day, list)
  }
  const factor = QUALITY_FACTOR[environment].value
  return [...perDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rates]) => {
      const absorbedUgy = (rates.reduce((a, b) => a + b, 0) / rates.length) * 24
      return {
        date,
        absorbedUgy: round(absorbedUgy, 1),
        equivalentUsv: round(absorbedUgy * factor, 1),
        hoursCovered: rates.length,
      }
    })
}

export interface MissionSegment {
  environment: RadiationEnvironment
  days: number
  /** Optional measured dose-equivalent rate; otherwise the reference rate is used. */
  rateMsvPerDay?: number
}

export function missionDoseMsv(segments: readonly MissionSegment[]): number {
  let total = 0
  for (const segment of segments) {
    if (!Number.isFinite(segment.days) || segment.days < 0) throw new RangeError('days must be >= 0')
    const rate =
      segment.rateMsvPerDay ??
      (segment.environment === 'mars_transit' || segment.environment === 'mars_surface'
        ? REFERENCE_RATE_MSV_PER_DAY[segment.environment]
        : undefined)
    if (rate === undefined) throw new Error(`No reference rate for ${segment.environment}`)
    total += rate * segment.days
  }
  return round(total, 1)
}

export interface LimitStatus {
  careerFraction: number
  remainingMsv: number
  exceedsCareerLimit: boolean
}

export function careerStatus(accumulatedMsv: number): LimitStatus {
  if (!Number.isFinite(accumulatedMsv) || accumulatedMsv < 0) throw new RangeError('invalid dose')
  return {
    careerFraction: round(accumulatedMsv / CAREER_LIMIT_MSV, 4),
    remainingMsv: round(Math.max(CAREER_LIMIT_MSV - accumulatedMsv, 0), 1),
    exceedsCareerLimit: accumulatedMsv > CAREER_LIMIT_MSV,
  }
}

/** Days until the career limit at a given daily rate; Infinity when the rate is zero. */
export function daysToCareerLimit(accumulatedMsv: number, rateMsvPerDay: number): number {
  if (rateMsvPerDay <= 0) return Number.POSITIVE_INFINITY
  return Math.max(Math.floor((CAREER_LIMIT_MSV - accumulatedMsv) / rateMsvPerDay), 0)
}

/** Flags days whose dose is far above the typical day: robust to the spike itself (median based). */
export function spikeDays(days: readonly DailyDose[], ratio = 3): DailyDose[] {
  if (days.length === 0) return []
  const sorted = [...days].map((d) => d.absorbedUgy).sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]!
  return days.filter((d) => median > 0 && d.absorbedUgy >= median * ratio)
}

function round(value: number, digits: number): number {
  const f = 10 ** digits
  return Math.round(value * f) / f
}
