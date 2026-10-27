// Brief Psychomotor Vigilance Test (PVT-B, Basner et al. 2011): 3 minutes, stimuli every 2 to 5 s,
// reactions of 355 ms or more count as lapses, responses under 100 ms (or with no stimulus) are
// false starts.

export const PVT_DURATION_MS = 180_000
export const PVT_MIN_ISI_MS = 2_000
export const PVT_MAX_ISI_MS = 5_000
export const LAPSE_MS = 355
export const FALSE_START_MS = 100

export interface PvtResponse {
  /** Reaction time in ms, or null when the button was pressed with no stimulus on screen. */
  reactionMs: number | null
}

export interface PvtResult {
  trials: number
  meanRtMs: number
  medianRtMs: number
  lapses: number
  falseStarts: number
  /** Performance score as in Basner et al.: 1 - (lapses + false starts) / trials. */
  performance: number
  valid: boolean
}

/** Random inter-stimulus intervals for one test; `random` is injectable so tests are deterministic. */
export function scheduleIntervals(random: () => number = Math.random): number[] {
  const intervals: number[] = []
  let elapsed = 0
  for (;;) {
    const isi = PVT_MIN_ISI_MS + Math.floor(random() * (PVT_MAX_ISI_MS - PVT_MIN_ISI_MS + 1))
    if (elapsed + isi > PVT_DURATION_MS) return intervals
    intervals.push(isi)
    elapsed += isi
  }
}

export function scorePvt(responses: readonly PvtResponse[]): PvtResult {
  const valid = responses.filter((r): r is { reactionMs: number } => r.reactionMs !== null && r.reactionMs >= FALSE_START_MS)
  const falseStarts = responses.length - valid.length
  const times = valid.map((r) => r.reactionMs).sort((a, b) => a - b)
  const lapses = times.filter((t) => t >= LAPSE_MS).length
  const mid = Math.floor(times.length / 2)
  const median = times.length === 0 ? 0 : times.length % 2 ? times[mid]! : (times[mid - 1]! + times[mid]!) / 2
  const trials = responses.length
  return {
    trials,
    meanRtMs: times.length === 0 ? 0 : Math.round(times.reduce((a, b) => a + b, 0) / times.length),
    medianRtMs: Math.round(median),
    lapses,
    falseStarts,
    performance: trials === 0 ? 0 : Math.round((1 - (lapses + falseStarts) / trials) * 1000) / 1000,
    // A test with very few trials (interrupted, or the user walked away) is not interpreted.
    valid: trials >= 20,
  }
}
