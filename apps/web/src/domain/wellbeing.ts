import type { CheckIn } from './checkin'

export const SLEEP_NEED_HOURS = 7
export const SCHEDULED_SLEEP_HOURS = 8.5
export const HYDRATION_TARGET_ML = 2500
export const CO2_TARGET_MMHG = 4

export interface SleepSummary {
  nights: number
  averageHours: number
  debtHours: number
  shortNights: number
}

/** Debt counts only the hours below the 7 h adult need; extra sleep does not cancel earlier debt. */
export function sleepSummary(checkIns: readonly CheckIn[]): SleepSummary {
  if (checkIns.length === 0) return { nights: 0, averageHours: 0, debtHours: 0, shortNights: 0 }
  const hours = checkIns.map((c) => c.sleepHours)
  return {
    nights: hours.length,
    averageHours: round(hours.reduce((a, b) => a + b, 0) / hours.length),
    debtHours: round(hours.reduce((debt, h) => debt + Math.max(SLEEP_NEED_HOURS - h, 0), 0)),
    shortNights: hours.filter((h) => h < SLEEP_NEED_HOURS).length,
  }
}

export interface ExerciseAdherence {
  prescribedMin: number
  doneMin: number
  ratio: number
}

/** Resistance exercise is what protects bone; aerobic minutes are reported but not mixed in. */
export function resistanceAdherence(checkIns: readonly CheckIn[]): ExerciseAdherence {
  const prescribedMin = checkIns.reduce((a, c) => a + c.prescribedResistanceMin, 0)
  const doneMin = checkIns.reduce((a, c) => a + c.resistanceMin, 0)
  return { prescribedMin, doneMin, ratio: prescribedMin === 0 ? 1 : round(doneMin / prescribedMin) }
}

export function averageHydrationMl(checkIns: readonly CheckIn[]): number {
  if (checkIns.length === 0) return 0
  return Math.round(checkIns.reduce((a, c) => a + c.hydrationMl, 0) / checkIns.length)
}

/**
 * Law et al. (2014): odds of headache doubled for each 1 mmHg of CO2 on the ISS. Shown relative to
 * the 4 mmHg target the station adopted afterwards.
 */
export function headacheOddsMultiplier(co2Mmhg: number): number {
  if (!Number.isFinite(co2Mmhg) || co2Mmhg < 0) throw new RangeError('invalid CO2 value')
  return round(2 ** (co2Mmhg - CO2_TARGET_MMHG))
}

/** Bone loss range when exercise is not effective; shown as an educational range, never as a measurement. */
export function unmitigatedBoneLossRange(missionDays: number): readonly [number, number] {
  const months = Math.max(missionDays, 0) / 30.44
  return [round(months * 1.0), round(months * 1.5)]
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
