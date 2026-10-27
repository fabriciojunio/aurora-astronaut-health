import { z } from 'zod'

export const VITAL_KINDS = [
  'heartRate',
  'hrv',
  'spo2',
  'systolic',
  'diastolic',
  'temperature',
  'respiratoryRate',
] as const
export type VitalKind = (typeof VITAL_KINDS)[number]

export const UNITS: Record<VitalKind, string> = {
  heartRate: 'bpm',
  hrv: 'ms',
  spo2: '%',
  systolic: 'mmHg',
  diastolic: 'mmHg',
  temperature: '°C',
  respiratoryRate: 'breaths/min',
}

/** Physically possible ranges. Outside them a value is a sensor or typing error, never a reading. */
export const PLAUSIBLE: Record<VitalKind, readonly [number, number]> = {
  heartRate: [20, 250],
  hrv: [1, 300],
  spo2: [50, 100],
  systolic: [50, 260],
  diastolic: [30, 160],
  temperature: [30, 43],
  respiratoryRate: [4, 60],
}

/** Smallest meaningful change for each signal; used as the floor of the personal-baseline score. */
export const RESOLUTION: Record<VitalKind, number> = {
  heartRate: 1,
  hrv: 2,
  spo2: 0.5,
  systolic: 2,
  diastolic: 2,
  temperature: 0.1,
  respiratoryRate: 1,
}

export const vitalReadingSchema = z
  .object({
    crewId: z.string().regex(/^[a-z0-9-]{1,32}$/),
    kind: z.enum(VITAL_KINDS),
    value: z.number().finite(),
    at: z.iso.datetime(),
    source: z.enum(['sensor', 'manual', 'simulated']),
  })
  .strict()
  .refine((r) => r.value >= PLAUSIBLE[r.kind][0] && r.value <= PLAUSIBLE[r.kind][1], {
    message: 'Value outside the physically possible range for this vital sign',
    path: ['value'],
  })

export type VitalReading = z.infer<typeof vitalReadingSchema>

export type SignalStatus = 'live' | 'stale' | 'missing'

export const STALE_AFTER_MS = 15 * 60_000

export function signalStatus(latest: VitalReading | undefined, now: Date): SignalStatus {
  if (!latest) return 'missing'
  return now.getTime() - Date.parse(latest.at) > STALE_AFTER_MS ? 'stale' : 'live'
}

export function latestByKind(readings: readonly VitalReading[]): Partial<Record<VitalKind, VitalReading>> {
  const latest: Partial<Record<VitalKind, VitalReading>> = {}
  for (const reading of readings) {
    const current = latest[reading.kind]
    if (!current || Date.parse(reading.at) > Date.parse(current.at)) latest[reading.kind] = reading
  }
  return latest
}

type Band = readonly [max: number, points: number]

// NEWS2 (Royal College of Physicians, 2017). Each list is ordered by upper bound, inclusive.
const NEWS2_BANDS: Partial<Record<VitalKind, readonly Band[]>> = {
  respiratoryRate: [[8, 3], [11, 1], [20, 0], [24, 2], [Infinity, 3]],
  spo2: [[91, 3], [93, 2], [95, 1], [Infinity, 0]],
  systolic: [[90, 3], [100, 2], [110, 1], [219, 0], [Infinity, 3]],
  heartRate: [[40, 3], [50, 1], [90, 0], [110, 1], [130, 2], [Infinity, 3]],
  temperature: [[35.0, 3], [36.0, 1], [38.0, 0], [39.0, 1], [Infinity, 2]],
}

export const NEWS2_PARAMETERS = Object.keys(NEWS2_BANDS) as VitalKind[]

export function news2Points(kind: VitalKind, value: number): number | undefined {
  const bands = NEWS2_BANDS[kind]
  if (!bands) return undefined
  return bands.find(([max]) => value <= max)![1]
}

export type ClinicalRisk = 'low' | 'low-medium' | 'medium' | 'high' | 'incomplete'

export interface News2Result {
  total: number
  points: Partial<Record<VitalKind, number>>
  missing: VitalKind[]
  risk: ClinicalRisk
}

/**
 * Missing parameters are never treated as normal: the score is marked incomplete and the UI asks
 * for the missing measurements instead of showing a reassuring number.
 */
export function news2(
  latest: Partial<Record<VitalKind, VitalReading>>,
  options: { newConfusion?: boolean } = {},
): News2Result {
  const points: Partial<Record<VitalKind, number>> = {}
  const missing: VitalKind[] = []
  for (const kind of NEWS2_PARAMETERS) {
    const reading = latest[kind]
    if (!reading) {
      missing.push(kind)
      continue
    }
    points[kind] = news2Points(kind, reading.value)!
  }
  const consciousness = options.newConfusion ? 3 : 0
  const values = Object.values(points)
  const total = values.reduce((a, b) => a + b, 0) + consciousness
  let risk: ClinicalRisk
  if (missing.length > 0) risk = 'incomplete'
  else if (total >= 7) risk = 'high'
  else if (total >= 5) risk = 'medium'
  else if (values.some((p) => p === 3) || consciousness === 3) risk = 'low-medium'
  else risk = 'low'
  return { total, points, missing, risk }
}
