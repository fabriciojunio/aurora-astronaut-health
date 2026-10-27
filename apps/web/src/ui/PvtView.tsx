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
import type { MessageKey } from '../i18n/messages'
import { useI18n } from '../i18n/useI18n'
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
  const { t } = useI18n()
  const [phase, setPhase] = useState<Phase>('idle')
  const [stimulus, setStimulus] = useState(false)
  // A reaction time in ms, or a message key; kept as data so a language switch rewords it.
  const [feedback, setFeedback] = useState<number | MessageKey | null>(null)
  const [result, setResult] = useState<PvtResult | null>(null)
  const [error, setError] = useState<MessageKey | null>(null)
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
      setError('pvt.saveFailed')
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
    setFeedback(reactionMs >= NO_RESPONSE_MS ? 'pvt.noResponse' : Math.round(reactionMs))
    next()
  }

  function press() {
    if (!running.current) return
    if (shownAt.current === null) {
      // Pressing with nothing on screen is a false start; the wait for the next stimulus continues.
      responses.current.push({ reactionMs: null })
      setFeedback('pvt.tooEarly')
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
    setError(null)
    setFeedback(null)
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
        <h2 id="pvt-title">{t('pvt.running')}</h2>
        <button
          type="button"
          className={stimulus ? 'pvt-target on' : 'pvt-target'}
          onPointerDown={press}
          aria-label={t('pvt.response')}
        >
          {stimulus ? t('pvt.pressNow') : t('pvt.wait')}
        </button>
        <p className="pvt-feedback mono" aria-live="polite">
          {typeof feedback === 'number' ? `${feedback} ms` : feedback && t(feedback)}
        </p>
        <button type="button" className="ghost" onClick={stop}>
          {t('pvt.stop')}
        </button>
      </section>
    )
  }

  return (
    <section className="card pvt" aria-labelledby="pvt-title">
      <h2 id="pvt-title">{t('pvt.title')}</h2>
      <CrewPicker crewId={crewId} onChange={onCrewChange} disabled={phase === 'saving'} />
      <p>{t('pvt.instructions', { min: Math.round(durationMs / 60_000) || 1, lapse: LAPSE_MS })}</p>
      {result && <PvtResultPanel result={result} saved={phase === 'done' && !error} />}
      <p className="form-error" role="alert">
        {error && t(error)}
      </p>
      <button type="button" className="primary" onClick={start} disabled={phase === 'saving'}>
        {result ? t('pvt.runAgain') : t('pvt.start')}
      </button>
    </section>
  )
}

function PvtResultPanel({ result, saved }: { result: PvtResult; saved: boolean }) {
  const { t } = useI18n()
  return (
    <div className="pvt-result">
      <dl className="readouts">
        <div>
          <dt>{t('pvt.median')}</dt>
          <dd>{result.medianRtMs} ms</dd>
        </div>
        <div>
          <dt>{t('pvt.lapses')}</dt>
          <dd>{result.lapses}</dd>
        </div>
        <div>
          <dt>{t('pvt.falseStarts')}</dt>
          <dd>{result.falseStarts}</dd>
        </div>
        <div>
          <dt>{t('pvt.performance')}</dt>
          <dd>{Math.round(result.performance * 100)}%</dd>
        </div>
      </dl>
      <p>
        {!result.valid
          ? t('pvt.tooFew', { n: result.trials })
          : vigilanceBelowNormal(result)
            ? t('pvt.below')
            : t('pvt.normal')}
      </p>
      {saved && <p className="muted small">{t('pvt.saved')}</p>}
    </div>
  )
}
