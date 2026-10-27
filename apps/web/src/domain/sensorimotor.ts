// The three post-landing field tasks NASA uses: sit-to-stand, tandem walk and walk-and-turn.
// Results are compared with the same person's preflight (or early-mission) baseline.

export const FIELD_TASKS = ['sitToStand', 'tandemWalk', 'walkAndTurn'] as const
export type FieldTask = (typeof FIELD_TASKS)[number]

export interface FieldTestResult {
  task: FieldTask
  seconds: number
  /** Tandem walk only: correct steps out of 10. */
  correctSteps?: number
  at: string
}

/** NASA reported the functional course taking 48% longer one day after a six-month mission. */
export const REFERENCE_POSTFLIGHT_SLOWDOWN = 0.48
export const WATCH_SLOWDOWN = 0.2

export type Readiness = 'ready' | 'watch' | 'not-ready' | 'no-baseline'

export interface TaskReadiness {
  task: FieldTask
  slowdown: number | null
  readiness: Readiness
}

export function slowdown(current: number, baseline: number): number {
  if (!(baseline > 0) || !(current > 0)) throw new RangeError('times must be positive')
  return Math.round(((current - baseline) / baseline) * 1000) / 1000
}

export function taskReadiness(current: FieldTestResult, baseline: FieldTestResult | undefined): TaskReadiness {
  if (!baseline) return { task: current.task, slowdown: null, readiness: 'no-baseline' }
  const s = slowdown(current.seconds, baseline.seconds)
  const stepsDrop =
    current.task === 'tandemWalk' && current.correctSteps !== undefined && baseline.correctSteps !== undefined
      ? baseline.correctSteps - current.correctSteps
      : 0
  let readiness: Readiness = 'ready'
  if (s >= REFERENCE_POSTFLIGHT_SLOWDOWN || stepsDrop >= 4) readiness = 'not-ready'
  else if (s >= WATCH_SLOWDOWN || stepsDrop >= 2) readiness = 'watch'
  return { task: current.task, slowdown: s, readiness }
}

export function overallReadiness(results: readonly TaskReadiness[]): Readiness {
  if (results.length < FIELD_TASKS.length || results.some((r) => r.readiness === 'no-baseline')) return 'no-baseline'
  if (results.some((r) => r.readiness === 'not-ready')) return 'not-ready'
  if (results.some((r) => r.readiness === 'watch')) return 'watch'
  return 'ready'
}
