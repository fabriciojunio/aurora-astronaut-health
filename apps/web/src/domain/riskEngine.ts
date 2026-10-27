import { computeBaseline, sustainedDeviation } from './baseline'
import { lastDays, type CheckIn, type Symptom } from './checkin'
import { vigilanceBelowNormal, type PvtResult } from './cognition'
import type { EvidenceId } from './evidence'
import { careerStatus, type RadiationEnvironment } from './radiation'
import type { Readiness } from './sensorimotor'
import { RESOLUTION, UNITS, VITAL_KINDS, VITAL_NAMES, latestByKind, news2, type VitalKind, type VitalReading } from './vitals'
import {
  CO2_TARGET_MMHG,
  HYDRATION_TARGET_ML,
  averageHydrationMl,
  headacheOddsMultiplier,
  resistanceAdherence,
  sleepSummary,
} from './wellbeing'

export const SEVERITIES = ['info', 'watch', 'warning', 'critical'] as const
export type Severity = (typeof SEVERITIES)[number]

export type RiskArea =
  | 'clinical'
  | 'vitals'
  | 'radiation'
  | 'sleep'
  | 'cognition'
  | 'musculoskeletal'
  | 'renal'
  | 'environment'
  | 'vision'
  | 'immune'
  | 'cardiopulmonary'
  | 'sensorimotor'
  | 'combined'

export interface Alert {
  key: string
  crewId: string
  area: RiskArea
  severity: Severity
  title: string
  why: string
  action: string
  evidence: EvidenceId[]
  createdAt: string
  /** The values behind the text, so the interface can word the alert in another language. */
  params?: Record<string, string | number>
}

export interface RiskContext {
  crewId: string
  now: Date
  vitals: readonly VitalReading[]
  checkIns: readonly CheckIn[]
  pvt: readonly { at: string; result: PvtResult }[]
  sensorimotor?: Readiness
  cabin?: { co2Mmhg: number; at: string }
  radiation?: { environment: RadiationEnvironment; protonStormLevel: number; accumulatedMsv: number }
}

const DAY = 86_400_000
const BASELINE_EXCLUDE_MS = DAY

export function severityRank(severity: Severity): number {
  return SEVERITIES.indexOf(severity)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "16 Nov, 07:00 UTC": mission time is UTC, and crews read times, not ISO strings. */
export function utcTime(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${hh}:${mm} UTC`
}

function raise(severity: Severity): Severity {
  return SEVERITIES[Math.min(severityRank(severity) + 1, SEVERITIES.length - 1)]!
}

export function evaluate(ctx: RiskContext): Alert[] {
  const alerts: Alert[] = []
  const add = (rule: string, a: Omit<Alert, 'key' | 'crewId' | 'createdAt'>) =>
    alerts.push({ ...a, key: `${ctx.crewId}:${rule}`, crewId: ctx.crewId, createdAt: ctx.now.toISOString() })

  const recentVitals = ctx.vitals.filter((v) => ctx.now.getTime() - Date.parse(v.at) <= DAY)
  const week = lastDays(ctx.checkIns, ctx.now, 7)
  const twoDays = lastDays(ctx.checkIns, ctx.now, 2)
  const symptoms = new Set<Symptom>(twoDays.flatMap((c) => c.symptoms))
  const stressors: string[] = []

  // Clinical early warning score.
  const score = news2(latestByKind(recentVitals), { newConfusion: false })
  if (score.risk === 'incomplete') {
    add('news2-incomplete', {
      area: 'clinical',
      severity: 'info',
      params: { missing: score.missing.join(',') },
      title: 'Measurements missing',
      why: `No reading in the last 24 h for: ${score.missing.join(', ')}. A missing value is never treated as normal.`,
      action: 'Take the missing measurements to complete today’s assessment.',
      evidence: ['news2'],
    })
  } else if (score.risk !== 'low') {
    const severity: Severity = score.risk === 'high' ? 'critical' : 'warning'
    add('news2', {
      area: 'clinical',
      severity,
      params: { total: score.total, risk: score.risk, points: Object.entries(score.points).filter(([, p]) => p > 0).map(([k, p]) => `${k}:${p}`).join(','), critical: severity === 'critical' ? 1 : 0 },
      title: `Early warning score ${score.total} (${score.risk})`,
      why: `NEWS2 points: ${Object.entries(score.points).filter(([, p]) => p > 0).map(([k, p]) => `${k} +${p}`).join(', ')}.`,
      action:
        severity === 'critical'
          ? 'Contact the crew medical officer now and repeat the measurements.'
          : 'Repeat the measurements within one hour and inform the crew medical officer.',
      evidence: ['news2'],
    })
  }

  // Deviations from the personal baseline.
  for (const kind of VITAL_KINDS) {
    const series = ctx.vitals.filter((v) => v.kind === kind)
    const history = series.filter((v) => ctx.now.getTime() - Date.parse(v.at) > BASELINE_EXCLUDE_MS)
    const baseline = computeBaseline(history.map((v) => v.value))
    if (!baseline) continue
    const recent = series.filter((v) => ctx.now.getTime() - Date.parse(v.at) <= BASELINE_EXCLUDE_MS)
    const deviation = sustainedDeviation(recent, baseline, { floor: RESOLUTION[kind] })
    if (!deviation) continue
    const watchOnly: VitalKind[] = ['hrv', 'temperature', 'diastolic']
    add(`baseline-${kind}`, {
      area: 'vitals',
      severity: watchOnly.includes(kind) ? 'watch' : 'warning',
      params: { kind, direction: deviation.direction, count: deviation.count, since: deviation.since, median: baseline.median },
      title: `${VITAL_NAMES[kind]} ${deviation.direction === 'up' ? 'above' : 'below'} your personal normal`,
      why: `${deviation.count} consecutive readings since ${utcTime(deviation.since)} away from your median of ${baseline.median} ${UNITS[kind]}.`,
      action: 'Check how you feel, repeat the measurement at rest and log any symptom.',
      evidence: ['mars500', 'modifiedZ'],
    })
  }

  // Radiation.
  if (ctx.radiation) {
    const { environment, protonStormLevel, accumulatedMsv } = ctx.radiation
    if (protonStormLevel >= 1) {
      const shielded = environment === 'iss'
      add('proton-storm', {
        area: 'radiation',
        severity: shielded ? 'watch' : 'critical',
        params: { level: protonStormLevel, shielded: shielded ? 1 : 0 },
        title: `Solar radiation storm S${protonStormLevel}`,
        why: shielded
          ? 'The ISS is partly shielded by Earth’s magnetic field, but dose can still rise.'
          : 'Outside Earth’s magnetic field a solar particle event can deliver a large dose in hours.',
        action: shielded
          ? 'Follow the flight rules for solar events and limit time in less shielded modules.'
          : 'Go to the storm shelter now and stay until the alert ends.',
        evidence: ['noaaScales', 'nasaStd3001Radiation'],
      })
      stressors.push('solar radiation storm')
    }
    const career = careerStatus(accumulatedMsv)
    if (career.careerFraction >= 0.8) {
      add('career-dose', {
        area: 'radiation',
        severity: career.exceedsCareerLimit ? 'critical' : 'warning',
        params: { pct: Math.round(career.careerFraction * 100), msv: accumulatedMsv },
        title: `Career dose at ${Math.round(career.careerFraction * 100)}% of the NASA limit`,
        why: `${accumulatedMsv} mSv accumulated; the career limit is 600 mSv.`,
        action: 'Review exposure planning with the flight surgeon and minimise optional exposure.',
        evidence: ['nasaStd3001Radiation'],
      })
    }
  }

  // Sleep and cognition.
  const sleep = sleepSummary(week)
  if (sleep.nights >= 3 && (sleep.averageHours < 6 || sleep.debtHours >= 5)) {
    add('sleep', {
      area: 'sleep',
      severity: sleep.averageHours < 6 ? 'warning' : 'watch',
      params: { avg: sleep.averageHours, short: sleep.shortNights, nights: sleep.nights, debt: sleep.debtHours },
      title: `Sleep averaging ${sleep.averageHours} h`,
      why: `${sleep.shortNights} of ${sleep.nights} nights under 7 h; ${sleep.debtHours} h of debt this week.`,
      action: 'Protect the next sleep period: dim light, limit screens and avoid late exercise.',
      evidence: ['sleepNeed', 'sleep2014'],
    })
    stressors.push('sleep debt')
  }
  const latestPvt = [...ctx.pvt].filter((p) => p.result.valid).sort((a, b) => b.at.localeCompare(a.at))[0]
  if (latestPvt && vigilanceBelowNormal(latestPvt.result)) {
    add('vigilance', {
      area: 'cognition',
      severity: stressors.includes('sleep debt') ? 'warning' : 'watch',
      params: { lapses: latestPvt.result.lapses, median: latestPvt.result.medianRtMs, performance: latestPvt.result.performance },
      title: `Vigilance below normal (${latestPvt.result.lapses} lapses)`,
      why: `Median reaction ${latestPvt.result.medianRtMs} ms, performance ${latestPvt.result.performance}.`,
      action: 'Avoid critical tasks for now, rest, and repeat the 3-minute test later.',
      evidence: ['pvtBrief', 'pvt'],
    })
  }

  // Exercise, bone, kidney.
  const adherence = resistanceAdherence(week)
  if (week.length >= 3 && adherence.ratio < 0.6) {
    add('exercise', {
      area: 'musculoskeletal',
      severity: adherence.ratio < 0.3 ? 'warning' : 'watch',
      params: { pct: Math.round(adherence.ratio * 100), done: adherence.doneMin, prescribed: adherence.prescribedMin },
      title: `Resistance exercise at ${Math.round(adherence.ratio * 100)}% of the prescription`,
      why: `${adherence.doneMin} of ${adherence.prescribedMin} min with load this week. In flight, bone can be lost at 1 to 1.5% per month.`,
      action: 'Plan the missing resistance sessions; load matters more than duration.',
      evidence: ['boneLoss', 'exerciseLoading', 'muscle6months'],
    })
    stressors.push('low exercise')
  }
  const hydration = averageHydrationMl(week)
  if (week.length >= 3 && hydration < HYDRATION_TARGET_ML) {
    add('hydration', {
      area: 'renal',
      severity: adherence.ratio < 0.6 ? 'warning' : 'watch',
      params: { ml: hydration, target: HYDRATION_TARGET_ML },
      title: `Hydration averaging ${hydration} ml/day`,
      why: 'Bone loss raises calcium in the urine; low fluid intake adds kidney stone risk, which cannot be treated in flight.',
      action: `Drink enough to reach about ${HYDRATION_TARGET_ML} ml per day.`,
      evidence: ['renalStone', 'stoneFluids'],
    })
  }

  // Cabin environment.
  if (ctx.cabin && ctx.cabin.co2Mmhg > CO2_TARGET_MMHG) {
    const odds = headacheOddsMultiplier(ctx.cabin.co2Mmhg)
    add('co2', {
      area: 'environment',
      severity: symptoms.has('headache') ? 'warning' : 'watch',
      params: { mmhg: ctx.cabin.co2Mmhg, odds },
      title: `Cabin CO2 at ${ctx.cabin.co2Mmhg} mmHg`,
      why: `On the ISS each 1 mmHg doubled the odds of headache: about ${odds}x the odds at the 4 mmHg target.`,
      action: 'Report to the crew; check air flow near your work area and take breaks in better-ventilated modules.',
      evidence: ['co2Law2014'],
    })
    stressors.push('high CO2')
  }

  // Symptoms.
  if (symptoms.has('chestPain') || symptoms.has('shortnessOfBreath')) {
    add('cardiopulmonary-symptom', {
      area: 'cardiopulmonary',
      severity: 'critical',
      title: 'Chest pain or shortness of breath reported',
      why: 'These symptoms need immediate medical assessment.',
      action: 'Stop activity and contact the crew medical officer now.',
      evidence: ['jugular2019', 'eimo'],
    })
  }
  if (symptoms.has('visionChange')) {
    add('vision', {
      area: 'vision',
      severity: 'warning',
      title: 'Change in vision reported',
      why: 'About 66% of long-duration astronauts show early signs of SANS.',
      action: 'Do the visual self-check and report it to the crew medical officer.',
      evidence: ['sans'],
    })
  }
  if (symptoms.has('fever') || symptoms.has('coldSores') || symptoms.has('skinRash')) {
    add('immune', {
      area: 'immune',
      severity: 'watch',
      title: 'Possible immune-related symptom',
      why: 'Spaceflight weakens immune control; 61% of ISS astronauts shed reactivated herpes viruses.',
      action: 'Log temperature twice a day and inform the crew medical officer if it persists.',
      evidence: ['herpes2019'],
    })
  }
  if (symptoms.has('dizziness')) {
    add('dizziness', {
      area: 'cardiopulmonary',
      severity: 'watch',
      title: 'Dizziness reported',
      why: 'Orthostatic intolerance affects 20 to 30% of astronauts returning to gravity.',
      action: 'Sit or lie down, drink fluids and avoid sudden changes of posture.',
      evidence: ['orthostatic'],
    })
  }
  const stressAvg = week.length ? week.reduce((a, c) => a + c.stress, 0) / week.length : 0
  if (week.length >= 3 && stressAvg >= 4) stressors.push('high stress')

  // Sensorimotor readiness.
  if (ctx.sensorimotor === 'not-ready' || ctx.sensorimotor === 'watch') {
    add('sensorimotor', {
      area: 'sensorimotor',
      severity: ctx.sensorimotor === 'not-ready' ? 'warning' : 'watch',
      params: { readiness: ctx.sensorimotor },
      title: `Balance and mobility: ${ctx.sensorimotor}`,
      why: 'After long missions the field tasks took 48% longer one day after landing.',
      action: 'Do not perform egress or EVA tasks alone; repeat the field tests after rest.',
      evidence: ['fieldTest'],
    })
  }

  // Combined stressors: hazards interact, so two or more together raise the level.
  if (stressors.length >= 2) {
    const worst = alerts.reduce<Severity>((s, a) => (severityRank(a.severity) > severityRank(s) ? a.severity : s), 'watch')
    add('combined', {
      area: 'combined',
      severity: raise(worst === 'critical' ? 'warning' : worst),
      params: { count: stressors.length, stressors: stressors.join(',') },
      title: `${stressors.length} stressors at the same time`,
      why: `Active together: ${stressors.join(', ')}. Spaceflight hazards interact and can worsen each other.`,
      action: 'Treat the most severe item first and lighten the workload until these improve.',
      evidence: ['hrpHazards'],
    })
  }

  return alerts.sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
}
