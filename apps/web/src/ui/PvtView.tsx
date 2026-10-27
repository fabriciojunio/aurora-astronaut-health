import { useEffect, useRef, useState } from 'react'
import {
  LAPSE_MS,
  PVT_DURATION_MS,
  scheduleIntervals,
  scorePvt,
  type PvtResponse,
  vigilanceBelowNormal,
  type PvtResult,
} from '../domain/cognition'
import { EVIDENCE } from '../domain/evidence'
import { appendAudit } from '../storage/auditTrail'
import type { Vault } from '../storage/vault'
import { CrewPicker } from './CrewPicker'

interface Props {
  vault: Vault
  crewId: string
  onCrewChange: (crewId: string) => void
  durationMs?: number
  random?: () => number
}

export interface SavedPvt {
  crewId: string
  at: string
  result: PvtResult
}

// A stimulus nobody answers is closed after 30 s and counted as a lapse, as in the PVT software.
const NO_RESPONSE_MS = 30_000

type Phase = 'idle' | 'running' | 'saving' | 'done'

export function PvtView({ vault, crewId, onCrewChange, durationMs = PVT_DURATION_MS, random = Math.random }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [stimulus, setStimulus] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [result, setResult] = useState<PvtResult | null>(null)
  const [error, setError] = useState('')
  const responses = useRef<PvtResponse[]>([])
  const queue = useRef<number[]>([])
  const shownAt = useRef<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const running = useRef(false)

  const pressRef = useRef(() => {})

  async function finish() {
    running.current = false
    const scored = scorePvt(responses.current)
    setResult(scored)
    setPhase('saving')
    const at = new Date().toISOString()
    try {
      await vault.put('pvt', `${crewId}:${at}`, { crewId, at, result: scored } satisfies SavedPvt)
      await appendAudit(vault, {
        actor: crewId,
        action: 'pvt.saved',
        detail: { trials: scored.trials, lapses: scored.lapses, valid: scored.valid },
      })
      setPhase('done')
    } catch {
      setError('The result could not be saved. It is shown here but was not stored.')
      setPhase('done')
    }
  }

  function next() {
    const wait = queue.current.shift()
    if (wait === undefined) {
      void finish()
      return
    }
    timer.current = setTimeout(() => {
      shownAt.current = performance.now()
      setStimulus(true)
      timer.current = setTimeout(() => record(NO_RESPONSE_MS), NO_RESPONSE_MS)
    }, wait)
  }

  function record(reactionMs: number) {
    clearTimeout(timer.current)
    responses.current.push({ reactionMs: Math.round(reactionMs) })
    shownAt.current = null
    setStimulus(false)
    setFeedback(reactionMs >= NO_RESPONSE_MS ? 'No response' : `${Math.round(reactionMs)} ms`)
    next()
  }

  function press() {
    if (!running.current) return
    if (shownAt.current === null) {
      // Pressing with nothing on screen is a false start; the wait for the next stimulus continues.
      responses.current.push({ reactionMs: null })
      setFeedback('Too early')
      return
    }
    record(performance.now() - shownAt.current)
  }

  useEffect(() => {
    pressRef.current = press
  })

  useEffect(() => {
    if (phase !== 'running') return
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat) return
      event.preventDefault()
      pressRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase])

  useEffect(() => () => clearTimeout(timer.current), [])

  function start() {
    responses.current = []
    queue.current = scheduleIntervals(random, durationMs)
    shownAt.current = null
    running.current = true
    setResult(null)
    setError('')
    setFeedback('')
    setPhase('running')
    next()
  }

  function stop() {
    clearTimeout(timer.current)
    running.current = false
    shownAt.current = null
    setStimulus(false)
    setPhase('idle')
  }

  if (phase === 'running') {
    return (
      <section className="card pvt" aria-labelledby="pvt-title">
        <h2 id="pvt-title">Vigilance test running</h2>
        <button
          type="button"
          className={stimulus ? 'pvt-target on' : 'pvt-target'}
          onPointerDown={press}
          aria-label="Response button"
        >
          {stimulus ? 'Press now' : 'Wait'}
        </button>
        <p className="pvt-feedback mono" aria-live="polite">
          {feedback}
        </p>
        <button type="button" className="ghost" onClick={stop}>
          Stop without saving
        </button>
      </section>
    )
  }

  return (
    <section className="card pvt" aria-labelledby="pvt-title">
      <h2 id="pvt-title">Vigilance test (PVT-B)</h2>
      <CrewPicker crewId={crewId} onChange={onCrewChange} disabled={phase === 'saving'} />
      <p>
        For about {Math.round(durationMs / 60_000) || 1} {durationMs >= 120_000 ? 'minutes' : 'minute'}, press the
        space bar or the button as soon as it lights up. Reactions of {LAPSE_MS} ms or more count as lapses. Sleep
        loss shows up here before people notice it themselves.
      </p>
      <p className="muted small">Source: {EVIDENCE.pvtBrief.citation}.</p>
      {result && <PvtResultPanel result={result} saved={phase === 'done' && !error} />}
      <p className="form-error" role="alert">
        {error}
      </p>
      <button type="button" className="primary" onClick={start} disabled={phase === 'saving'}>
        {result ? 'Run again' : 'Start test'}
      </button>
    </section>
  )
}

function PvtResultPanel({ result, saved }: { result: PvtResult; saved: boolean }) {
  return (
    <div className="pvt-result">
      <dl className="readouts">
        <div>
          <dt>Median reaction</dt>
          <dd>{result.medianRtMs} ms</dd>
        </div>
        <div>
          <dt>Lapses</dt>
          <dd>{result.lapses}</dd>
        </div>
        <div>
          <dt>False starts</dt>
          <dd>{result.falseStarts}</dd>
        </div>
        <div>
          <dt>Performance</dt>
          <dd>{Math.round(result.performance * 100)}%</dd>
        </div>
      </dl>
      <p>
        {!result.valid
          ? `Only ${result.trials} trials: too few to interpret. Run the full test.`
          : vigilanceBelowNormal(result)
            ? 'Vigilance below normal. Avoid critical tasks for now, rest, and repeat the test later.'
            : 'Vigilance within the normal range.'}
      </p>
      {saved && <p className="muted small">Saved encrypted on this device.</p>}
    </div>
  )
}
